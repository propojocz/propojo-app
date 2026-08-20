// lib/format.ts
// Jednotné psaní data a času. Bez tohohle si každá stránka formátovala
// po svém — někde „13. srpna 2026 v 09:08", jinde „13. 8. 2026, 9:08"
// a v ose zase jinak. Působilo to, že to psali tři různí lidé.
//
// ČASOVÁ ZÓNA: serverové komponenty se vykreslují na Vercelu, který běží
// v UTC. Bez explicitní zóny by termín na 8:00 svítil jako 6:00 — a zákazník
// by přišel o dvě hodiny dřív. Zóna je proto natvrdo Europe/Prague; letní
// i zimní čas si Intl pohlídá sám. (Proměnná prostředí TZ nepomůže, Vercel
// si ten název rezervoval a nastavit ho nedovolí.)
//
// PRAVIDLO:
//   · termín služby → dlouze, ať se nedá splést („čtvrtek 13. srpna, 14:00")
//   · záznamy a historie → krátce („13. 8. 2026, 9:08")
//   · v seznamech → nejkratší, co dává smysl („13. 8., 14:00")

const CS = 'cs-CZ'
const TZ = 'Europe/Prague'

function bezpecne(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** „čtvrtek 13. srpna, 14:00" — pro potvrzený termín služby. */
export function terminDlouze(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  const den = new Intl.DateTimeFormat(CS, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d)
  const cas = new Intl.DateTimeFormat(CS, { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d)
  return `${den}, ${cas}`
}

/** „13. 8. 2026, 9:08" — pro záznamy, historii, časovou osu. */
export function datumCas(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  }).format(d)
}

/** „13. 8., 14:00" — do seznamů, kde je málo místa. */
export function datumCasKratce(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  const den = new Intl.DateTimeFormat(CS, { day: 'numeric', month: 'numeric', timeZone: TZ }).format(d)
  const cas = new Intl.DateTimeFormat(CS, { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d)
  return `${den}, ${cas}`
}

/** „13. srpna 2026" — samotné datum bez času. */
export function datum(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(d)
}

/** „14:00" — samotný čas. Pro mřížky termínů a rozsahy. */
export function cas(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d)
}

/** „út 18. 8." — krátký den do štítků a chipů. */
export function denKratce(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: TZ }).format(d)
}

/** „čtvrtek 13. srpna" — den bez času, dlouze. */
export function denDlouze(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d)
}

/** „14:00–15:30" — rozsah termínu. */
export function rozsahCasu(
  od: string | Date | null | undefined,
  doKdy: string | Date | null | undefined
): string {
  return `${cas(od)}–${cas(doKdy)}`
}

/** „před 2 h" / „včera" / „13. 8." — pro zprávy a oznámení. */
export function jakDavno(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  const rozdil = Date.now() - d.getTime()
  const minut = Math.floor(rozdil / 60000)
  if (minut < 1) return 'právě teď'
  if (minut < 60) return `před ${minut} min`
  const hodin = Math.floor(minut / 60)
  if (hodin < 24) return `před ${hodin} h`
  const dnu = Math.floor(hodin / 24)
  if (dnu === 1) return 'včera'
  if (dnu < 7) return `před ${dnu} dny`
  return new Intl.DateTimeFormat(CS, { day: 'numeric', month: 'numeric', timeZone: TZ }).format(d)
}

// ── Práce s pražským časem na serveru ────────────────────────
// Server běží v UTC, ale rozhodujeme se podle toho, kolik je u nás: do kterého
// dne termín spadá, jestli je v otevírací době, jestli se kryje s blokací.
// Posun se NEPÍŠE natvrdo (+02:00 platí jen v létě) — Intl ho pro daný den
// spočítá sám, včetně přechodu na zimní čas.

/** Kolik minut má Praha náskok před UTC v daný okamžik (120 v létě, 60 v zimě). */
function posunPrahy(d: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(d)) p[part.type] = part.value
  const jakoUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  )
  return Math.round((jakoUtc - d.getTime()) / 60000)
}

/** Pražské datum a čas → ISO v UTC. Vstup: '2026-08-25' a '14:30'. */
export function isoZPrazskehoCasu(datum: string, cas: string): string {
  const hruby = new Date(`${datum}T${cas.slice(0, 5)}:00Z`)
  // Dvě kola kvůli okamžikům těsně kolem změny času.
  let vysledek = new Date(hruby.getTime() - posunPrahy(hruby) * 60000)
  vysledek = new Date(hruby.getTime() - posunPrahy(vysledek) * 60000)
  return vysledek.toISOString()
}

/** Den v týdnu podle pražského času. 1 = pondělí … 7 = neděle (jako v service_hours). */
export function denVTydnuPraha(iso: string | Date): number {
  const d = bezpecne(iso)
  if (!d) return 1
  const posunuty = new Date(d.getTime() + posunPrahy(d) * 60000)
  const js = posunuty.getUTCDay()   // 0 = neděle
  return js === 0 ? 7 : js
}

/** Kolik minut uplynulo od pražské půlnoci — na porovnání s otevírací dobou. */
export function minutyOdPulnociPraha(iso: string | Date): number {
  const d = bezpecne(iso)
  if (!d) return 0
  const posunuty = new Date(d.getTime() + posunPrahy(d) * 60000)
  return posunuty.getUTCHours() * 60 + posunuty.getUTCMinutes()
}

/** 'HH:MM' nebo 'HH:MM:SS' → minuty od půlnoci. */
export function casNaMinuty(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}