// lib/format.ts
// Jednotné psaní data a času. Bez tohohle si každá stránka formátovala
// po svém — někde „13. srpna 2026 v 09:08", jinde „13. 8. 2026, 9:08"
// a v ose zase jinak. Působilo to, že to psali tři různí lidé.
//
// PRAVIDLO:
//   · termín služby → dlouze, ať se nedá splést („čtvrtek 13. srpna, 14:00")
//   · záznamy a historie → krátce („13. 8. 2026, 9:08")
//   · v seznamech → nejkratší, co dává smysl („13. 8., 14:00")

const CS = 'cs-CZ'

function bezpecne(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** „čtvrtek 13. srpna, 14:00" — pro potvrzený termín služby. */
export function terminDlouze(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  const den = new Intl.DateTimeFormat(CS, { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const cas = new Intl.DateTimeFormat(CS, { hour: '2-digit', minute: '2-digit' }).format(d)
  return `${den}, ${cas}`
}

/** „13. 8. 2026, 9:08" — pro záznamy, historii, časovou osu. */
export function datumCas(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/** „13. 8., 14:00" — do seznamů, kde je málo místa. */
export function datumCasKratce(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  const den = new Intl.DateTimeFormat(CS, { day: 'numeric', month: 'numeric' }).format(d)
  const cas = new Intl.DateTimeFormat(CS, { hour: '2-digit', minute: '2-digit' }).format(d)
  return `${den}, ${cas}`
}

/** „13. srpna 2026" — samotné datum bez času. */
export function datum(iso: string | Date | null | undefined): string {
  const d = bezpecne(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(CS, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
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
  return new Intl.DateTimeFormat(CS, { day: 'numeric', month: 'numeric' }).format(d)
}