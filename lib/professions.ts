// lib/professions.ts
// Hledání profese podle toho, co člověk napíše (23. 10. 2026, Matej: lidé píšou „malíř“, „barber“, „podlahy“).
// Profese = podkategorie s příbuznými slovy (subcategories.synonyms, docs/profese-navrh.json).
// Čistá funkce – používá ji formulář nabídky (prohlížeč) i našeptávač /api/obory (server).

import { expandSearch, normalizeText } from '@/lib/search'

export type ProfessionLike = { id: string; name: string; synonyms?: string[] | null }

/** Kořeny slov dotazu: „pergola“ → „perg“, „kadernik“ → „kader“ (koncovky češtiny pryč) */
function stemsOf(q: string): string[] {
  return normalizeText(q.trim())
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length >= 5 ? w.slice(0, w.length - 2) : w))
}

/**
 * Profese seřazené podle shody: název začíná dotazem → název obsahuje → příbuzné slovo.
 * Když nic, zkusí slovník příbuzných slov z chytrého hledání (expandSearch).
 */
export function matchProfessions<T extends ProfessionLike>(q: string, list: T[], limit = 8): T[] {
  const stems = stemsOf(q)
  if (stems.length === 0 || normalizeText(q.trim()).length < 2) return []
  const full = normalizeText(q.trim())
  const scored: Array<{ p: T; score: number }> = []
  for (const p of list) {
    const name = normalizeText(p.name)
    const syns = (p.synonyms ?? []).map(normalizeText)
    const inName = stems.every((st) => name.includes(st))
    const inSyn = syns.some((s) => stems.every((st) => s.includes(st)))
    if (!inName && !inSyn) continue
    const score = name.startsWith(full) ? 0 : inName ? 1 : syns.some((s) => s.startsWith(full)) ? 2 : 3
    scored.push({ p, score })
  }
  let out = scored.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'cs')).map((x) => x.p)
  if (out.length === 0) {
    const pats = expandSearch(q).map(normalizeText).filter((x) => x.length >= 3)
    out = list.filter((p) => pats.some((pt) => normalizeText([p.name, ...(p.synonyms ?? [])].join(' ')).includes(pt)))
  }
  return out.slice(0, limit)
}
