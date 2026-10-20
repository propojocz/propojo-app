// lib/obce.ts
// Hledání obcí bez diakritiky a s malou chybou (20. 10. 2026, Matej: „roznov“ i „Rožnof“ → Rožnov pod Radhoštěm).
// Seznam ~6 250 obcí (tabulka `obce`) si server jednou načte do paměti a porovnává sám – bez SQL.
// Od 20. 10. 2026 navíc části obcí a městské části z RÚIAN (`lib/data/casti-obci.ts`: Praha 3, Žižkov,
// Brno-Židenice, Poruba…) – jen pro hledání v marketplace (`parts`), ne pro obec karty / poptávky.
// Používá našeptávač obcí (/api/obce) i marketplace (výchozí bod vzdálenosti, název obce do filtru).
// Jen na serveru (čte databázi).

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/search'
import { CASTI_OBCI_TSV } from '@/lib/data/casti-obci'

export type ObecRow = {
  obec: string
  okres: string
  psc: string | number | null
  latitude: number
  longitude: number
  /** U části obce / městské části: obec, do které patří („Žižkov“ → „Praha“) */
  parent?: string | null
}
// rank: 0 = obec, 1 = městská část (Praha 3, Brno-Židenice), 2 = část obce (Žižkov, Malenovice)
// size: u části počet částí její obce (náhrada velikosti města – Žižkov v Praze před Žižkovem u Kutné Hory)
type Indexed = ObecRow & { norm: string; rank: number; size: number }

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
      for (const r of (data ?? []) as ObecRow[]) rows.push({ ...r, obec: fixCaps(r.obec), parent: null, norm: normalizeText(r.obec), rank: 0, size: 0 })
      if (!data || data.length < 1000) break
    }
    rows.push(...parseParts())
    cache = { at: Date.now(), rows }
    return rows
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

function parseParts(): Indexed[] {
  const out: Indexed[] = []
  for (const line of CASTI_OBCI_TSV.split('\n')) {
    const [n, p, o, t, la, lo] = line.split('\t')
    if (!n || !la || !lo) continue
    const isObec = t === 'o'
    out.push({
      obec: n, okres: o, psc: null, latitude: Number(la), longitude: Number(lo),
      parent: isObec ? null : fixCaps(p), norm: normalizeText(n), rank: isObec ? 0 : t === 'm' ? 1 : 2, size: 0,
    })
  }
  const count = new Map<string, number>()
  for (const r of out) if (r.parent) count.set(r.parent, (count.get(r.parent) ?? 0) + 1)
  for (const r of out) if (r.parent) r.size = count.get(r.parent) ?? 0
  return out
}

// V číselníku je 11 velkých měst velkými písmeny („ZLÍN“, „ÚSTÍ NAD LABEM“) – do našeptávače a karet normálně
const SMALL_WORDS = new Set(['nad', 'pod', 'u', 'v', 've', 'na'])
function fixCaps(name: string): string {
  if (name !== name.toLocaleUpperCase('cs') || !/\p{L}{3}/u.test(name)) return name
  return name.toLocaleLowerCase('cs').replace(/[\p{L}]+/gu, (w, i: number) =>
    i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toLocaleUpperCase('cs') + w.slice(1))
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

/** Okres z Mapy.com („Hlavní město Praha“) vs. z číselníku („Praha“) – stačí, když jeden obsahuje druhý */
function okresMatches(rowOkres: string, nOkres: string): boolean {
  const r = normalizeText(rowOkres)
  return r === nOkres || r.includes(nOkres) || nOkres.includes(r)
}

type Opts = { parts?: boolean }
const byRankSize = (a: Indexed, b: Indexed) => a.rank - b.rank || b.size - a.size
const pool = (rows: Indexed[], opts?: Opts) => (opts?.parts ? rows : rows.filter((r) => r.parent == null))

/**
 * Obce pro našeptávač: začínající na dotaz (bez diakritiky); když žádná, tak s malou chybou na začátku názvu.
 * `parts`: i části obcí a městské části (jen hledání v marketplace).
 */
export async function searchObce(q: string, limit = 7, opts?: Opts): Promise<ObecRow[]> {
  const nq = normalizeText(q.trim())
  if (nq.length < 2) return []
  const rows = pool(await loadAll(), opts)
  const exactOrPrefix = rows
    .filter((r) => r.norm.startsWith(nq))
    .sort((a, b) => (a.norm === nq ? -1 : 0) - (b.norm === nq ? -1 : 0) || a.rank - b.rank || a.norm.length - b.norm.length || b.size - a.size || a.obec.localeCompare(b.obec, 'cs'))
  const out: Indexed[] = exactOrPrefix.slice(0, limit)
  const typos = maxTypos(nq.length)
  // Tolerance na chybu jen když podle začátku názvu nic není (jinak by přidávala nesmyslné podobné obce)
  if (out.length === 0 && typos > 0) {
    const fuzzy = rows
      .map((r) => ({ r, d: editDistance(nq, r.norm.slice(0, nq.length)) }))
      .filter((x) => x.d <= typos)
      .sort((a, b) => a.d - b.d || a.r.rank - b.r.rank || a.r.norm.length - b.r.norm.length || b.r.size - a.r.size)
      .slice(0, limit)
      .map((x) => x.r)
    out.push(...fuzzy)
  }
  return out.map(strip)
}

/**
 * Jedno místo podle textu z hledání: přesný název (bez diakritiky), jinak začátek názvu, jinak malá chyba.
 * Stejnojmenné (Bystřice, Střítež, Žižkov…) rozliší okres z našeptávače (`okres`); bez něj vezme obec
 * před městskou částí a částí obce a marketplace nabídne výběr (findObecAll).
 */
export async function findObec(text: string, okres?: string | null, opts?: Opts): Promise<ObecRow | null> {
  const nq = normalizeText(text.trim())
  if (nq.length < 2) return null
  const rows = pool(await loadAll(), opts)
  const nOkres = okres ? normalizeText(okres.trim()) : null
  const exactAll = rows.filter((r) => r.norm === nq).sort(byRankSize)
  const exact = (nOkres ? exactAll.find((r) => okresMatches(r.okres, nOkres)) : null) ?? exactAll[0]
  if (exact) return strip(exact)
  const prefix = rows.filter((r) => r.norm.startsWith(nq)).sort((a, b) => a.norm.length - b.norm.length || byRankSize(a, b))[0]
  if (prefix) return strip(prefix)
  const typos = maxTypos(nq.length)
  if (typos === 0) return null
  let best: { r: Indexed; d: number } | null = null
  for (const r of rows) {
    const d = Math.min(editDistance(nq, r.norm), editDistance(nq, r.norm.slice(0, nq.length)))
    if (d <= typos && (!best || d < best.d || (d === best.d && byRankSize(r, best.r) < 0))) best = { r, d }
  }
  return best ? strip(best.r) : null
}

/** Všechna místa s přesně tímto názvem (bez diakritiky) – kvůli výběru u stejnojmenných */
export async function findObecAll(text: string, opts?: Opts): Promise<ObecRow[]> {
  const nq = normalizeText(text.trim())
  if (nq.length < 2) return []
  return pool(await loadAll(), opts).filter((r) => r.norm === nq).sort(byRankSize).map(strip)
}

/** Souřadnice obcí podle názvu (karty bez souřadnic): normalizovaný název → první obec toho jména */
export async function obceCoordsByName(): Promise<Map<string, { latitude: number; longitude: number }>> {
  const map = new Map<string, { latitude: number; longitude: number }>()
  for (const r of await loadAll()) {
    if (r.parent == null && !map.has(r.norm)) map.set(r.norm, { latitude: r.latitude, longitude: r.longitude })
  }
  return map
}

function strip(r: Indexed): ObecRow {
  return { obec: r.obec, okres: r.okres, psc: r.psc, latitude: r.latitude, longitude: r.longitude, parent: r.parent ?? null }
}
