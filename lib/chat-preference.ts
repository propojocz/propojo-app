// lib/chat-preference.ts
// Text a data zprávy „Kdy se mi to hodí“ / „Můj rozpočet“ v chatu jednání – jedno místo pro chat
// (sendCustomerPreference) i pro založení soukromé poptávky (startPrivateRequest). Bez 'use server'.

export type CustomerPreference =
  | { kind: 'time_preference'; from: string; to: string | null; dayPart: 'kdykoli' | 'rano' | 'odpoledne' | 'vecer'; note?: string | null }
  | { kind: 'budget'; from: number | null; to: number }

const DAY_PARTS: Record<string, string> = {
  kdykoli: 'kdykoli během dne', rano: 'ráno (8–12)', odpoledne: 'odpoledne (12–17)', vecer: 'večer (17–20)',
}

export function customerPreferenceMessage(pref: CustomerPreference):
  { ok: true; content: string; payload: Record<string, unknown> } | { ok: false; error: string } {
  const den = (iso: string) => new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(`${iso}T12:00:00Z`))
  if (pref.kind === 'time_preference') {
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (!iso.test(pref.from) || (pref.to && !iso.test(pref.to))) return { ok: false, error: 'Vyberte datum.' }
    if (pref.to && pref.to < pref.from) return { ok: false, error: 'Konec nemůže být dřív než začátek.' }
    const part = DAY_PARTS[pref.dayPart] ?? DAY_PARTS.kdykoli
    const note = pref.note?.trim().slice(0, 200) || null
    return {
      ok: true,
      content: `Hodí se mi: ${pref.to && pref.to !== pref.from ? `${den(pref.from)} – ${den(pref.to)}` : den(pref.from)}, ${part}${note ? ` (${note})` : ''}.`,
      payload: { kind: 'time_preference', from: pref.from, to: pref.to && pref.to !== pref.from ? pref.to : null, day_part: pref.dayPart, note },
    }
  }
  const to = Math.round(Number(pref.to))
  const from = pref.from != null ? Math.round(Number(pref.from)) : null
  if (!Number.isFinite(to) || to <= 0) return { ok: false, error: 'Zadejte rozpočet v Kč.' }
  if (from != null && (!Number.isFinite(from) || from <= 0 || from > to)) return { ok: false, error: 'Rozpočet „od“ musí být nižší než „do“.' }
  const castka = from != null ? `${from.toLocaleString('cs-CZ')} – ${to.toLocaleString('cs-CZ')} Kč` : `do ${to.toLocaleString('cs-CZ')} Kč`
  return { ok: true, content: `Můj rozpočet: ${castka}.`, payload: { kind: 'budget', from, to } }
}
