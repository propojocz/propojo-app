// lib/search.ts
// Chytřejší vyhledávání na marketplace (část B, 9. 10. 2026).
// Z dotazu udělá vzory pro databázovou funkci search_service_ids:
//   1) bez diakritiky a malými písmeny („Stříhání“ → „strihani“),
//   2) kořen slova – odříznutí běžných českých koncovek („strihani“ → „strih“),
//   3) příbuzná slova ze slovníku („strih“ → kadeřník, holič, barber…).
// Vzory se v databázi hledají jako podřetězec, takže „kadern“ najde kadeřník, kadeřnice i kadeřnictví.
// Slovník se doplňuje průběžně – drž ho konkrétní, krátké obecné kořeny (pod 4 znaky) najdou nesmysly.

/** Malá písmena bez diakritiky */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Koncovky od nejdelší; kořen musí mít aspoň 4 znaky
const SUFFIXES = [
  'ovani', 'ovat', 'ování', 'ani', 'eni', 'ovy', 'ova', 'ove', 'ich', 'ach', 'ami', 'emi',
  'ice', 'ace', 'ik', 'ky', 'ka', 'ku', 'ce', 'ci', 'ou', 'em', 'a', 'e', 'i', 'y', 'u', 'o',
].map(normalizeText)

export function stem(word: string): string {
  const w = normalizeText(word)
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length)
  }
  return w
}

/**
 * Skupiny příbuzných slov (už bez diakritiky, jako kořeny). Když se dotaz shoduje s některým
 * slovem skupiny, hledá se celá skupina.
 */
const SYNONYM_GROUPS: { terms: string[]; cats: string[] }[] = [
  { cats: ['krasa'], terms: ['strih', 'vlas', 'kadern', 'holic', 'barber', 'ucesy', 'ucesu', 'holeni', 'oholeni', 'vousy', 'vousu', 'fouk'] },
  { cats: ['krasa'], terms: ['neht', 'manikur', 'pedikur', 'gel lak', 'gellak'] },
  { cats: ['krasa'], terms: ['kosmet', 'plet', 'oboc', 'rasy', 'rasa', 'lash', 'make-up', 'makeup', 'licen'] },
  { cats: ['zdravi', 'krasa'], terms: ['masaz', 'relax', 'lymfo', 'reflexn'] },
  { cats: ['remesla', 'dum-a-byt'], terms: ['malir', 'malov', 'vymal', 'nater', 'stierk', 'sterk', 'vymalov'] },
  { cats: ['remesla', 'dum-a-byt'], terms: ['elektr', 'zasuvk', 'jistic', 'vypinac', 'svetl', 'kabel', 'rozvadec', 'revize elektr'] },
  { cats: ['remesla', 'dum-a-byt'], terms: ['instalat', 'vodoinst', 'kohout', 'odpad', 'ucpan', 'zachod', 'bojler', 'radiator', 'splach', 'vodovod'] },
  { cats: ['remesla'], terms: ['zednik', 'zdeni', 'stavb', 'rekonstr', 'omitk', 'sadrokarton', 'zatepl'] },
  { cats: ['remesla'], terms: ['obklad', 'dlazb', 'dlazd', 'spar'] },
  { cats: ['remesla', 'dum-a-byt'], terms: ['truhl', 'tesar', 'nabyt', 'kuchyn', 'skrin', 'drev'] },
  { cats: ['remesla', 'dum-a-byt'], terms: ['podlah', 'plovouc', 'vinyl', 'parket', 'lamin', 'koberc'] },
  { cats: ['zahrada'], terms: ['zahrad', 'sekani', 'sekat', 'kosen', 'kosit', 'sekac', 'travnik', 'trava', 'kaceni', 'kacet', 'prorez', 'zivy plot', 'krovi', 'strom'] },
  { cats: ['uklid'], terms: ['uklid', 'uklizen', 'myti oken', 'cisteni', 'cistit', 'tepov', 'gauc'] },
  { cats: ['stehovani'], terms: ['stehov', 'prevoz', 'dodavk', 'odvoz', 'vyklizen', 'vyklid'] },
  { cats: ['auto'], terms: ['auto', 'pneu', 'prezut', 'vymena oleje', 'karoser', 'mechanik', 'autoserv'] },
  { cats: ['it'], terms: ['pocitac', 'notebook', 'tiskarn', 'software', 'wifi', 'webov', 'mobil', 'it sluzb'] },
  { cats: ['doucovani'], terms: ['doucov', 'vyuk', 'matemat', 'anglic', 'cestin', 'chemi', 'fyzik', 'maturit', 'prijimac'] },
  { cats: ['zvirata'], terms: ['venceni', 'vencit', 'dog', 'psu', 'psy', 'hlidani zvirat', 'trimov', 'zvirat'] },
  { cats: ['udalosti'], terms: ['dort', 'cukrar', 'peceni', 'catering', 'raut', 'svatb'] },
  { cats: ['udalosti', 'online'], terms: ['fotograf', 'foceni', 'video', 'kameram'] },
  { cats: ['remesla', 'dum-a-byt'], terms: ['klimat', 'tepelne cerpad', 'vzduchotech', 'chlazeni'] },
  { cats: ['pece-o-lidi'], terms: ['hlidani deti', 'chuva', 'senior', 'asistenc', 'pecovat'] },
  { cats: ['pravo-finance', 'firmy'], terms: ['ucetn', 'danov', 'pravn', 'advok', 'notar', 'pojist', 'financ'] },
  { cats: ['dum-a-byt', 'remesla'], terms: ['zamek', 'zamk', 'vlozk', 'zamecn', 'otevreni dveri'] },
]


export type SearchPlan = { patterns: string[]; categoryHints: string[] }

/**
 * Plán hledání: vzory pro search_service_ids (nejvýš 30, každý aspoň 3 znaky) a kategorie,
 * které k dotazu patří (pro řazení). Když aspoň jedno slovo dotazu patří do slovníku, hledá se
 * podle slovníku a obecná slova („pokoj“, „oprava“) se vynechají – jinak by „pokoj“ našel
 * i „spokojenost“ v popisu. Bez shody se slovníkem se hledá podle kořenů všech slov.
 */
export function searchPlan(q: string): SearchPlan {
  const words = normalizeText(q).split(/[^a-z0-9-]+/).filter((w) => w.length >= 3)
  const fromGroups = new Set<string>()
  const plain = new Set<string>()
  const cats = new Set<string>()
  for (const w of words) {
    const st = stem(w)
    let hit = false
    for (const group of SYNONYM_GROUPS) {
      if (group.terms.some((t) => (t.length >= 4 && st.startsWith(t)) || t.startsWith(st) || w.startsWith(t))) {
        group.terms.forEach((t) => fromGroups.add(t))
        group.cats.forEach((c) => cats.add(c))
        hit = true
      }
    }
    if (hit) fromGroups.add(st)
    else plain.add(st)
  }
  const out = fromGroups.size > 0 ? fromGroups : plain
  const full = normalizeText(q).trim()
  if (full.length >= 3) out.add(full)
  return { patterns: Array.from(out).filter((p) => p.length >= 3).slice(0, 30), categoryHints: Array.from(cats) }
}

export function expandSearch(q: string): string[] {
  return searchPlan(q).patterns
}

/**
 * Relevance nalezené karty: shoda v názvu, podtitulu, oboru nebo ceníku váží víc než zmínka
 * v popisu; karta z kategorie, ke které dotaz patří (vlasy → Krása), jde dopředu.
 */
export function relevanceScore(
  plan: SearchPlan,
  card: { strong: string; weak: string; category: string | null },
): number {
  const strong = normalizeText(card.strong)
  const weak = normalizeText(card.weak)
  let score = 0
  for (const p of plan.patterns) {
    if (strong.includes(p)) score += 3
    else if (weak.includes(p)) score += 1
  }
  if (card.category && plan.categoryHints.includes(card.category)) score += 5
  return score
}
