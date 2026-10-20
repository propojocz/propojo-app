// lib/obce.ts
// Hledání obcí bez diakritiky a s malou chybou (20. 10. 2026, Matej: „roznov“ i „Rožnof“ → Rožnov pod Radhoštěm).
// Seznam ~6 250 obcí (tabulka `obce`) si server jednou načte do paměti a porovnává sám – bez SQL.
// Používá našeptávač obcí (/api/obce) i marketplace (výchozí bod vzdálenosti, název obce do filtru).
// Jen na serveru (čte databázi).

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/search'

export type ObecRow = { obec: string; okres: string; psc: string | number | null; latitude: number; longitude: number }
type Indexed = ObecRow & { norm: string }

const TTL_MS = 24 * 3600_000
let cache: { at: number; rows: Indexed[] } | null = null
let loading: Promise<Indexed[]> | null = null

async function loadAll(): Promise<Indexed[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  if (loading) return loading
  loading = (async () => {
    // Číselník obcí je veřejný údaj; service role kvůli stránkování bez RLS překvapení
    const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const rows: Indexed[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from('obce')
        .select('obec, okres, psc, latitude, longitude')
        .order('obec', { ascending: true })
        .range(from, from + 999)
      if (error) throw new Error(error.message)
      for (const r of (data ?? []) as ObecRow[]) rows.push({ ...r, norm: normalizeText(r.obec) })
      if (!data || data.length < 1000) break
    }
    cache = { at: Date.now(), rows }
    return rows
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

/** Levenshteinova vzdálenost (počet překlepů) – jen pro krátké řetězce */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** Kolik překlepů tolerovat podle délky dotazu */
const maxTypos = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0)

/**
 * Obce pro našeptávač: začínající na dotaz (bez diakritiky); když žádná, tak s malou chybou na začátku názvu.
 */
export async function searchObce(q: string, limit = 7): Promise<ObecRow[]> {
  const nq = normalizeText(q.trim())
  if (nq.length < 2) return []
  const rows = await loadAll()
  const exactOrPrefix = rows
    .filter((r) => r.norm.startsWith(nq))
    .sort((a, b) => (a.norm === nq ? -1 : 0) - (b.norm === nq ? -1 : 0) || a.norm.length - b.norm.length || a.obec.localeCompare(b.obec, 'cs'))
  const out: Indexed[] = exactOrPrefix.slice(0, limit)
  const typos = maxTypos(nq.length)
  // Tolerance na chybu jen když podle začátku názvu nic není (jinak by přidávala nesmyslné podobné obce)
  if (out.length === 0 && typos > 0) {
    const seen = new Set(out.map((r) => `${r.obec}|${r.okres}`))
    const fuzzy = rows
      .filter((r) => !seen.has(`${r.obec}|${r.okres}`))
      .map((r) => ({ r, d: editDistance(nq, r.norm.slice(0, nq.length)) }))
      .filter((x) => x.d <= typos)
      .sort((a, b) => a.d - b.d || a.r.norm.length - b.r.norm.length)
      .slice(0, limit - out.length)
      .map((x) => x.r)
    out.push(...fuzzy)
  }
  return out.map(strip)
}

/**
 * Jedna obec podle textu z hledání: přesný název (bez diakritiky), jinak začátek názvu, jinak malá chyba.
 * Stejnojmenné obce (Bystřice, Střítež…) rozliší okres z našeptávače (`okres`); bez něj vezme první
 * a marketplace nabídne výběr (findObecAll).
 */
export async function findObec(text: string, okres?: string | null): Promise<ObecRow | null> {
  const nq = normalizeText(text.trim())
  if (nq.length < 2) return null
  const rows = await loadAll()
  const nOkres = okres ? normalizeText(okres.trim()) : null
  const exact = (nOkres ? rows.find((r) => r.norm === nq && normalizeText(r.okres) === nOkres) : null)
    ?? rows.find((r) => r.norm === nq)
  if (exact) return strip(exact)
  const prefix = rows.filter((r) => r.norm.startsWith(nq)).sort((a, b) => a.norm.length - b.norm.length)[0]
  if (prefix) return strip(prefix)
  const typos = maxTypos(nq.length)
  if (typos === 0) return null
  let best: { r: Indexed; d: number } | null = null
  for (const r of rows) {
    const d = Math.min(editDistance(nq, r.norm), editDistance(nq, r.norm.slice(0, nq.length)))
    if (d <= typos && (!best || d < best.d)) best = { r, d }
  }
  return best ? strip(best.r) : null
}

/** Všechny obce s přesně tímto názvem (bez diakritiky) – kvůli výběru okresu u stejnojmenných */
export async function findObecAll(text: string): Promise<ObecRow[]> {
  const nq = normalizeText(text.trim())
  if (nq.length < 2) return []
  return (await loadAll()).filter((r) => r.norm === nq).map(strip)
}

function strip(r: Indexed): ObecRow {
  return { obec: r.obec, okres: r.okres, psc: r.psc, latitude: r.latitude, longitude: r.longitude }
}
