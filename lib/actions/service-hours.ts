'use server'
// lib/actions/service-hours.ts
// Otevírací doba karty + nastavení kalendáře.
//
// Z otevírací doby se generují volné termíny (vrstva 3). Kdo ji nevyplní,
// dostává objednávky jako poptávky bez termínu — přesně jako dosud.
//
// Ověřování vlastnictví děláme V KÓDU, ne jen přes RLS: service_id přijde
// z prohlížeče, takže si vždy nejdřív ověříme, že karta patří přihlášenému.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Jeden rozsah v jednom dni. weekday podle ISO: 1 = pondělí … 7 = neděle.
export type ServiceHour = {
  weekday: number
  starts_at: string // 'HH:MM'
  ends_at: string   // 'HH:MM'
}

export type CalendarSettings = {
  travel_buffer_minutes: number
  separate_calendar: boolean
}

type Result = { success: true } | { success: false; error: string }

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Ořízne sekundy, které Postgres u typu `time` vrací navíc ('09:00:00' → '09:00').
function trimTime(t: string): string {
  return t.slice(0, 5)
}

async function assertOwner(serviceId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Nejste přihlášeni.' }

  const { data } = await supabase
    .from('services')
    .select('id, provider_id')
    .eq('id', serviceId)
    .single() as { data: { id: string; provider_id: string } | null }

  if (!data) return { ok: false as const, error: 'Karta nenalezena.' }
  if (data.provider_id !== user.id) return { ok: false as const, error: 'K této kartě nemáte přístup.' }

  return { ok: true as const, supabase, userId: user.id }
}

/** Načte otevírací dobu karty seřazenou podle dne a času. */
export async function getServiceHours(serviceId: string): Promise<ServiceHour[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('service_hours')
    .select('weekday, starts_at, ends_at')
    .eq('service_id', serviceId)
    .order('weekday', { ascending: true })
    .order('starts_at', { ascending: true }) as { data: ServiceHour[] | null }

  return (data ?? []).map((h) => ({
    weekday: h.weekday,
    starts_at: trimTime(h.starts_at),
    ends_at: trimTime(h.ends_at),
  }))
}

/**
 * Uloží celou otevírací dobu naráz — staré řádky smaže a vloží nové.
 * Prázdné pole = karta nemá otevírací dobu a vrací se k poptávkám bez termínu.
 */
export async function saveServiceHours(serviceId: string, hours: ServiceHour[]): Promise<Result> {
  const auth = await assertOwner(serviceId)
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase } = auth

  // ── kontrola vstupu ──────────────────────────────────────
  const clean: ServiceHour[] = []
  for (const h of hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 1 || h.weekday > 7) {
      return { success: false, error: 'Neplatný den v týdnu.' }
    }
    const from = trimTime(String(h.starts_at ?? ''))
    const to = trimTime(String(h.ends_at ?? ''))
    if (!TIME_RE.test(from) || !TIME_RE.test(to)) {
      return { success: false, error: 'Čas musí být ve tvaru HH:MM.' }
    }
    if (toMinutes(to) <= toMinutes(from)) {
      return { success: false, error: 'Konec musí být po začátku.' }
    }
    clean.push({ weekday: h.weekday, starts_at: from, ends_at: to })
  }

  // Rozsahy v jednom dni se nesmí překrývat — jinak by se termíny generovaly dvakrát.
  for (let d = 1; d <= 7; d++) {
    const day = clean
      .filter((h) => h.weekday === d)
      .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))
    for (let i = 1; i < day.length; i++) {
      if (toMinutes(day[i].starts_at) < toMinutes(day[i - 1].ends_at)) {
        return { success: false, error: 'Rozsahy v jednom dni se nesmí překrývat.' }
      }
    }
  }

  // ── zápis ────────────────────────────────────────────────
  const { error: delErr } = await supabase.from('service_hours').delete().eq('service_id', serviceId)
  if (delErr) {
    console.error('[service-hours] mazání:', delErr)
    return { success: false, error: 'Otevírací dobu se nepodařilo uložit.' }
  }

  if (clean.length > 0) {
    const rows = clean.map((h) => ({
      service_id: serviceId,
      weekday: h.weekday,
      starts_at: h.starts_at,
      ends_at: h.ends_at,
    }))
    const { error: insErr } = await (supabase.from('service_hours') as any).insert(rows)
    if (insErr) {
      console.error('[service-hours] vkládání:', insErr)
      return { success: false, error: 'Otevírací dobu se nepodařilo uložit.' }
    }
  }

  revalidatePath(`/sluzby/${serviceId}`)
  revalidatePath('/dashboard/nabidky')
  revalidatePath('/dashboard/terminy')
  return { success: true }
}

/**
 * Rezerva na přejezd (jen u karet s výjezdem) a přepínač samostatného kalendáře.
 * separate_calendar = false znamená, že karty jednoho poskytovatele sdílejí čas.
 */
export async function saveCalendarSettings(
  serviceId: string,
  settings: CalendarSettings
): Promise<Result> {
  const auth = await assertOwner(serviceId)
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase } = auth

  const buffer = Math.round(Number(settings.travel_buffer_minutes ?? 0))
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 480) {
    return { success: false, error: 'Rezerva na přejezd musí být 0 až 480 minut.' }
  }

  const { error } = await (supabase.from('services') as any)
    .update({
      travel_buffer_minutes: buffer,
      separate_calendar: settings.separate_calendar === true,
    })
    .eq('id', serviceId)

  if (error) {
    console.error('[service-hours] nastavení kalendáře:', error)
    return { success: false, error: 'Nastavení se nepodařilo uložit.' }
  }

  revalidatePath(`/sluzby/${serviceId}`)
  revalidatePath('/dashboard/terminy')
  return { success: true }
}

/**
 * Má poskytovatel víc karet? Podle toho se ukazuje přepínač
 * „tuto kartu obsluhuje někdo jiný" — u jediné karty nemá co řešit.
 */
export async function providerHasOtherCards(serviceId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { count } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', user.id)
    .neq('id', serviceId)

  return (count ?? 0) > 0
}