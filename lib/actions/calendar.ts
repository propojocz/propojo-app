'use server'
// lib/actions/calendar.ts
// Kalendář poskytovatele K1 (19. 10. 2026, docs/plan-kalendar.md): jeden den jako časová osa.
//
// Co se ukazuje: rezervace (model v2 podle booking_state, starý model podle status / deposit_status),
// pauza / přesun za rezervací (pauza za službou + rezerva na přejezd u výjezdu – přesuny počítá
// poskytovatel sám, žádné trasy), vypsané volné termíny, blokace a poznámky („ruční rezervace“).
// Mezery: volný čas v otevírací době karet (service_hours) mínus vše obsazené; bez otevírací doby jen
// mezery mezi rezervacemi. Počítá se na serveru pro každý filtr místa zvlášť – obsazenost je ale vždy
// celá (poskytovatel je jeden člověk, rezervace na jednom místě mu blokuje i to druhé).
//
// Místa: adresa karet „u poskytovatele“ (pobočky doplní Provider OS) + „Výjezdy“ (karty u zákazníka).
// Přesnou adresu zákazníka poskytovatel vidí až po potvrzení (AK bod 8, providerSeesCustomerContact).

import { createClient } from '@/lib/supabase/server'
import { adminDb } from '@/lib/booking/payments'
import { isoZPrazskehoCasu, minutyOdPulnociPraha, casNaMinuty, denVTydnuPraha } from '@/lib/format'
import { providerSeesCustomerContact } from '@/lib/booking/state'

const MIN_GAP_MIN = 30
const FALLBACK_DURATION_MIN = 60
// Stavy v2, které v kalendáři drží čas
const SHOWN_STATES = ['pending_payment', 'awaiting_confirmation', 'capture_in_progress', 'confirmed', 'no_show_reported']

export type CalPlace = { key: string; label: string; kind: 'place' | 'vyjezdy' }

export type CalBooking = {
  type: 'booking'
  id: string
  start: string
  end: string
  /** Konec pauzy / přesunu za rezervací (null = žádná) */
  bufferEnd: string | null
  title: string
  customer: string
  placeKey: string
  placeLabel: string | null
  /** pending_payment | awaiting | confirmed | no_show | legacy */
  state: 'pending_payment' | 'awaiting' | 'confirmed' | 'no_show' | 'legacy'
  arrivalWindow: boolean
}

export type CalSlot = { type: 'slot'; id: string; start: string; end: string; label: string; placeKeys: string[] }

export type CalBlock = { type: 'block'; id: string; start: string; end: string; text: string | null; kind: 'block' | 'note' }

export type CalItem = CalBooking | CalSlot | CalBlock

export type CalGap = { start: string; end: string; minutes: number; cardIds: string[] }

export type CalendarDay = {
  date: string
  today: string
  /** Po–Ne týdne s vybraným dnem a počtem rezervací */
  week: { date: string; count: number }[]
  places: CalPlace[]
  items: CalItem[]
  /** Mezery podle filtru: 'all' a klíč každého místa */
  gaps: Record<string, CalGap[]>
  /** Má aspoň jedna karta otevírací dobu? (jinak mezery jen mezi rezervacemi) */
  hasHours: boolean
}

function pragueDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function placeKey(text: string): string {
  return 'p:' + text.trim().toLowerCase().replace(/\s+/g, ' ')
}

type Range = { from: number; to: number }

function mergeRanges(list: Range[]): Range[] {
  const sorted = list.filter((r) => r.to > r.from).sort((a, b) => a.from - b.from)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to)
    else out.push({ ...r })
  }
  return out
}

/** Ranges minus busy (vše v minutách od pražské půlnoci) */
function subtract(ranges: Range[], busy: Range[]): Range[] {
  let free = ranges.map((r) => ({ ...r }))
  for (const b of busy) {
    const next: Range[] = []
    for (const f of free) {
      if (b.to <= f.from || b.from >= f.to) { next.push(f); continue }
      if (b.from > f.from) next.push({ from: f.from, to: b.from })
      if (b.to < f.to) next.push({ from: b.to, to: f.to })
    }
    free = next
  }
  return free
}

export async function getCalendarDay(dateStr?: string): Promise<CalendarDay | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminDb() as any

  const today = pragueDate(new Date())
  const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(new Date(`${dateStr}T12:00:00Z`).getTime())
    ? dateStr
    : today

  const weekday = denVTydnuPraha(isoZPrazskehoCasu(date, '12:00'))
  const weekStart = shiftDate(date, 1 - weekday)
  const weekFromIso = isoZPrazskehoCasu(weekStart, '00:00')
  const weekToIso = isoZPrazskehoCasu(shiftDate(weekStart, 7), '00:00')
  const dayStartIso = isoZPrazskehoCasu(date, '00:00')
  const dayEndIso = isoZPrazskehoCasu(shiftDate(date, 1), '00:00')
  const dayStartMs = new Date(dayStartIso).getTime()
  const dayEndMs = new Date(dayEndIso).getTime()

  // ── Karty a otevírací doba ─────────────────────────────────
  const { data: svcRows } = await db
    .from('services')
    .select('id, title, is_active, location_type, address, city, travel_buffer_minutes')
    .eq('provider_id', user.id)
  const services = (svcRows ?? []) as any[]
  const active = services.filter((s) => s.is_active === true)

  const places: CalPlace[] = []
  const addPlace = (key: string, label: string, kind: CalPlace['kind']) => {
    if (!places.some((p) => p.key === key)) places.push({ key, label, kind })
  }
  // Karta → klíče míst (karta „u zákazníka i u mě“ patří do obou)
  const cardPlaces = new Map<string, string[]>()
  for (const s of active) {
    const keys: string[] = []
    const lt = s.location_type
    if (lt === 'u_poskytovatele' || lt === 'oboji') {
      const where = (s.address || s.city || '').trim()
      if (where) { const k = placeKey(where); addPlace(k, where, 'place'); keys.push(k) }
    }
    if (lt !== 'u_poskytovatele') keys.push('vyjezdy')
    cardPlaces.set(s.id, keys)
  }
  const hasVyjezdy = Array.from(cardPlaces.values()).some((k) => k.includes('vyjezdy'))

  const { data: hourRows } = active.length > 0
    ? await db.from('service_hours').select('service_id, weekday, starts_at, ends_at').in('service_id', active.map((s) => s.id))
    : { data: [] }
  const hours = (hourRows ?? []) as { service_id: string; weekday: number; starts_at: string; ends_at: string }[]
  const cardsWithHours = new Set(hours.map((h) => h.service_id))
  const dayHours = new Map<string, Range[]>()
  for (const h of hours) {
    if (Number(h.weekday) !== weekday) continue
    const list = dayHours.get(h.service_id) ?? []
    list.push({ from: casNaMinuty(h.starts_at), to: casNaMinuty(h.ends_at) })
    dayHours.set(h.service_id, list)
  }

  // ── Rezervace v týdnu (počty u dnů) a ve vybraném dni ──────
  const { data: orderRows } = await db
    .from('orders')
    .select('id, customer_id, status, booking_state, offer_kind, scheduled_at, scheduled_end, deposit_status, hold_expires_at, authorized_at, service_location, location_address, location_city, provider_place_address, service_items(name, duration_minutes, buffer_minutes), services(title, location_type, address, city, travel_buffer_minutes)')
    .eq('provider_id', user.id)
    .neq('status', 'zruseno')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', weekFromIso)
    .lt('scheduled_at', weekToIso)
    .order('scheduled_at', { ascending: true })
  const now = Date.now()
  let orders = ((orderRows ?? []) as any[]).filter((o) => {
    const holdLive = !o.hold_expires_at || new Date(o.hold_expires_at).getTime() > now
    if (o.booking_state) {
      if (!SHOWN_STATES.includes(o.booking_state)) return false
      return o.booking_state !== 'pending_payment' || holdLive
    }
    // Nová rezervace před otevřením platby (offer_kind bez booking_state, např. z otevírací doby)
    // drží čas jen po dobu zámku – stejně jako ve free-times
    if (o.offer_kind) return o.deposit_status === 'pending' && !!o.hold_expires_at && holdLive
    // Starý model: nezaplacený zámek po vypršení už termín nedrží
    return o.deposit_status !== 'pending' || holdLive
  })
  // Nezaplacené objednávky z poptávky žijí jen v chatu jednání (jako v seznamu objednávek)
  const unpaidIds = orders.filter((o) => !o.authorized_at).map((o) => o.id)
  if (unpaidIds.length > 0) {
    const { data: ev } = await db.from('order_events').select('order_id').eq('type', 'created_from_request').in('order_id', unpaidIds)
    const drafts = new Set(((ev ?? []) as { order_id: string }[]).map((e) => e.order_id))
    orders = orders.filter((o) => !drafts.has(o.id))
  }

  const week = Array.from({ length: 7 }, (_, i) => ({ date: shiftDate(weekStart, i), count: 0 }))
  for (const o of orders) {
    const w = week.find((d) => d.date === pragueDate(new Date(o.scheduled_at)))
    if (w) w.count += 1
  }

  const dayOrders = orders.filter((o) => {
    const t = new Date(o.scheduled_at).getTime()
    return t >= dayStartMs && t < dayEndMs
  })

  const customerIds = Array.from(new Set(dayOrders.map((o) => o.customer_id).filter(Boolean)))
  const nameOf = new Map<string, string>()
  if (customerIds.length > 0) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', customerIds)
    for (const p of (profs ?? []) as any[]) nameOf.set(p.id, p.full_name || 'Zákazník')
  }

  const items: CalItem[] = []
  for (const o of dayOrders) {
    const startMs = new Date(o.scheduled_at).getTime()
    const dur = Number(o.service_items?.duration_minutes ?? 0)
    const endMs = o.scheduled_end ? new Date(o.scheduled_end).getTime() : startMs + (dur > 0 ? dur : FALLBACK_DURATION_MIN) * 60_000
    const atCustomer = o.service_location
      ? o.service_location === 'u_zakaznika'
      : o.services?.location_type !== 'u_poskytovatele'
    // Pauza za službou jen u nového modelu (u starého je v scheduled_end), přejezd jen u výjezdu
    const itemBuf = o.booking_state || o.offer_kind ? Number(o.service_items?.buffer_minutes ?? 0) : 0
    const travel = atCustomer ? Number(o.services?.travel_buffer_minutes ?? 0) : 0
    const bufMin = Math.max(0, itemBuf) + Math.max(0, travel)

    let key: string
    let label: string | null
    if (atCustomer) {
      key = 'vyjezdy'
      const sees = o.booking_state ? providerSeesCustomerContact(o.booking_state) : true
      label = sees ? (o.location_address ?? o.location_city ?? null) : (o.location_city ?? null)
    } else {
      const where = (o.provider_place_address || o.services?.address || o.services?.city || '').trim()
      key = where ? placeKey(where) : 'p:'
      label = where || null
      if (where) addPlace(key, where, 'place')
    }

    const st = o.booking_state ?? (o.offer_kind ? 'pending_payment' : null)
    items.push({
      type: 'booking',
      id: o.id,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      bufferEnd: bufMin > 0 ? new Date(endMs + bufMin * 60_000).toISOString() : null,
      title: o.service_items?.name || o.services?.title || 'Rezervace',
      customer: nameOf.get(o.customer_id) ?? 'Zákazník',
      placeKey: key,
      placeLabel: label,
      state: st === 'pending_payment' ? 'pending_payment'
        : st === 'awaiting_confirmation' || st === 'capture_in_progress' ? 'awaiting'
        : st === 'confirmed' ? 'confirmed'
        : st === 'no_show_reported' ? 'no_show'
        : 'legacy',
      arrivalWindow: o.offer_kind === 'B',
    })
  }
  if (items.some((i) => i.type === 'booking' && i.placeKey === 'vyjezdy') || hasVyjezdy) addPlace('vyjezdy', 'Výjezdy k zákazníkům', 'vyjezdy')

  // ── Vypsané volné termíny ─────────────────────────────────
  const { data: slotRows } = await db
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, slot_services(service_id, services(title))')
    .eq('provider_id', user.id)
    .lt('starts_at', dayEndIso)
    .gt('ends_at', dayStartIso)
    .order('starts_at', { ascending: true })
  const busyExtra: { start: number; end: number }[] = []
  for (const s of (slotRows ?? []) as any[]) {
    if (s.status !== 'volno') {
      // Zabrané okno má objednávku – v kalendáři je jako rezervace, tady jen drží čas
      busyExtra.push({ start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() })
      continue
    }
    const links = (s.slot_services ?? []) as any[]
    const keys = Array.from(new Set(links.flatMap((l) => cardPlaces.get(l.service_id) ?? [])))
    items.push({
      type: 'slot',
      id: s.id,
      start: new Date(s.starts_at).toISOString(),
      end: new Date(s.ends_at).toISOString(),
      label: links.map((l) => l.services?.title).filter(Boolean).join(', ') || 'Volný termín',
      placeKeys: keys,
    })
  }

  // ── Blokace a poznámky ─────────────────────────────────────
  // select('*') – sloupec kind existuje až po SQL kalendar-k1; bez něj je všechno blokace
  const { data: blockRows } = await db
    .from('provider_blocks')
    .select('*')
    .eq('provider_id', user.id)
    .lt('starts_at', dayEndIso)
    .gt('ends_at', dayStartIso)
    .order('starts_at', { ascending: true })
  for (const b of (blockRows ?? []) as any[]) {
    items.push({ type: 'block', id: b.id, start: new Date(b.starts_at).toISOString(), end: new Date(b.ends_at).toISOString(), text: b.reason ?? null, kind: b.kind === 'note' ? 'note' : 'block' })
  }

  items.sort((a, b) => a.start.localeCompare(b.start))

  // ── Mezery ────────────────────────────────────────────────
  const toDayMin = (ms: number) => (ms <= dayStartMs ? 0 : ms >= dayEndMs ? 24 * 60 : minutyOdPulnociPraha(new Date(ms)))
  const busy = mergeRanges([
    ...items.map((i) => ({
      from: toDayMin(new Date(i.start).getTime()),
      to: toDayMin(new Date(i.type === 'booking' && i.bufferEnd ? i.bufferEnd : i.end).getTime()),
    })),
    ...busyExtra.map((b) => ({ from: toDayMin(b.start), to: toDayMin(b.end) })),
  ])
  // Minulost se nenabízí; dnes až od nejbližších 5 minut
  const lowerBound = date < today ? null : date === today ? Math.ceil(minutyOdPulnociPraha(new Date()) / 5) * 5 : 0

  const gapsFor = (cardIds: string[]): CalGap[] => {
    if (lowerBound == null || cardIds.length === 0) return []
    const withHours = cardIds.filter((id) => cardsWithHours.has(id))
    let open: Range[]
    if (withHours.length > 0) {
      open = mergeRanges(withHours.flatMap((id) => dayHours.get(id) ?? []))
    } else {
      // Bez otevírací doby jen mezery mezi rezervacemi
      const bookings = mergeRanges(items.filter((i) => i.type === 'booking').map((i) => ({
        from: toDayMin(new Date(i.start).getTime()),
        to: toDayMin(new Date((i as CalBooking).bufferEnd ?? i.end).getTime()),
      })))
      open = bookings.length > 1 ? [{ from: bookings[0].from, to: bookings[bookings.length - 1].to }] : []
    }
    open = open.map((r) => ({ from: Math.max(r.from, lowerBound), to: r.to })).filter((r) => r.to > r.from)
    return subtract(open, busy)
      .filter((g) => g.to - g.from >= MIN_GAP_MIN)
      .map((g) => ({
        start: isoZPrazskehoCasu(date, hhmm(g.from)),
        end: g.to >= 24 * 60 ? dayEndIso : isoZPrazskehoCasu(date, hhmm(g.to)),
        minutes: g.to - g.from,
        // Karty, jejichž otevírací doba mezeru zasahuje (bez otevírací doby všechny z filtru)
        cardIds: withHours.length > 0
          ? withHours.filter((id) => (dayHours.get(id) ?? []).some((r) => r.from < g.to && r.to > g.from))
          : cardIds,
      }))
  }

  const gaps: Record<string, CalGap[]> = { all: gapsFor(active.map((s) => s.id)) }
  for (const p of places) {
    gaps[p.key] = gapsFor(active.filter((s) => (cardPlaces.get(s.id) ?? []).includes(p.key)).map((s) => s.id))
  }

  return { date, today, week, places, items, gaps, hasHours: cardsWithHours.size > 0 }
}
