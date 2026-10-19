'use server'
// lib/actions/calendar.ts
// Kalendář poskytovatele K1–K4 (19. 10. 2026, docs/plan-kalendar.md): načte se celý týden (Po–Ne)
// s vybraným dnem (Den, Týden, Přehled), nebo celé týdny pokrývající měsíc (Měsíc, 35–42 dní).
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
import { normalizeText } from '@/lib/search'

// Volno jen na celé a půl hodiny a aspoň hodinu (Matej 19. 10.: ne náhodné minuty, jen pár nabídek)
const MIN_GAP_MIN = 60
const GAP_STEP_MIN = 30
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

export type CalDayData = {
  date: string
  items: CalItem[]
  /** Mezery podle filtru: 'all' a klíč každého místa */
  gaps: Record<string, CalGap[]>
  /** Otevírací doba dne podle filtru (minuty od půlnoci); prázdné = zavřeno / bez otevírací doby */
  open: Record<string, { from: number; to: number }[]>
}

export type CalendarDay = {
  /** Vybraný den */
  date: string
  today: string
  /** 'week' = Po–Ne týdne s vybraným dnem, 'month' = celé týdny pokrývající měsíc vybraného dne */
  range: 'week' | 'month'
  days: CalDayData[]
  places: CalPlace[]
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

export async function getCalendarDay(dateStr?: string, range: 'week' | 'month' = 'week'): Promise<CalendarDay | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminDb() as any

  const today = pragueDate(new Date())
  const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(new Date(`${dateStr}T12:00:00Z`).getTime())
    ? dateStr
    : today

  // Rozsah: týden s vybraným dnem, nebo od pondělí před 1. dnem měsíce do neděle po posledním
  const mondayOf = (d: string) => shiftDate(d, 1 - denVTydnuPraha(isoZPrazskehoCasu(d, '12:00')))
  let weekStart: string
  let dayCount = 7
  if (range === 'month') {
    const first = `${date.slice(0, 7)}-01`
    const [yy, mm] = date.split('-').map(Number)
    const last = shiftDate(`${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`, -1)
    weekStart = mondayOf(first)
    const lastSunday = shiftDate(mondayOf(last), 6)
    dayCount = Math.round((new Date(`${lastSunday}T12:00:00Z`).getTime() - new Date(`${weekStart}T12:00:00Z`).getTime()) / 86_400_000) + 1
  } else {
    weekStart = mondayOf(date)
  }
  const weekDates = Array.from({ length: dayCount }, (_, i) => shiftDate(weekStart, i))
  const weekFromIso = isoZPrazskehoCasu(weekStart, '00:00')
  const weekToIso = isoZPrazskehoCasu(shiftDate(weekStart, dayCount), '00:00')

  // ── Karty a otevírací doba ─────────────────────────────────
  const { data: svcRows } = await db
    .from('services')
    .select('id, title, is_active, location_type, address, city, travel_buffer_minutes')
    .eq('provider_id', user.id)
  const active = ((svcRows ?? []) as any[]).filter((s) => s.is_active === true)

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

  // ── Rezervace v týdnu ─────────────────────────────────────
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

  const customerIds = Array.from(new Set(orders.map((o) => o.customer_id).filter(Boolean)))
  const nameOf = new Map<string, string>()
  if (customerIds.length > 0) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', customerIds)
    for (const p of (profs ?? []) as any[]) nameOf.set(p.id, p.full_name || 'Zákazník')
  }

  const bookings: CalBooking[] = []
  for (const o of orders) {
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
    bookings.push({
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
  if (hasVyjezdy || bookings.some((b) => b.placeKey === 'vyjezdy')) addPlace('vyjezdy', 'Výjezdy k zákazníkům', 'vyjezdy')

  // ── Vypsané volné termíny ─────────────────────────────────
  const { data: slotRows } = await db
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, slot_services(service_id, services(title))')
    .eq('provider_id', user.id)
    .lt('starts_at', weekToIso)
    .gt('ends_at', weekFromIso)
    .order('starts_at', { ascending: true })
  const slots: CalSlot[] = []
  // Zabrané okno má objednávku – v kalendáři je jako rezervace, tady jen drží čas
  const takenSlots: { start: string; end: string }[] = []
  for (const s of (slotRows ?? []) as any[]) {
    const start = new Date(s.starts_at).toISOString()
    const end = new Date(s.ends_at).toISOString()
    if (s.status !== 'volno') { takenSlots.push({ start, end }); continue }
    const links = (s.slot_services ?? []) as any[]
    slots.push({
      type: 'slot',
      id: s.id,
      start,
      end,
      label: links.map((l) => l.services?.title).filter(Boolean).join(', ') || 'Volný termín',
      placeKeys: Array.from(new Set(links.flatMap((l) => cardPlaces.get(l.service_id) ?? []))),
    })
  }

  // ── Blokace a poznámky ─────────────────────────────────────
  // select('*') – sloupec kind existuje až po SQL kalendar-k1; bez něj je všechno blokace
  const { data: blockRows } = await db
    .from('provider_blocks')
    .select('*')
    .eq('provider_id', user.id)
    .lt('starts_at', weekToIso)
    .gt('ends_at', weekFromIso)
    .order('starts_at', { ascending: true })
  const blocks: CalBlock[] = ((blockRows ?? []) as any[]).map((b) => ({
    type: 'block',
    id: b.id,
    start: new Date(b.starts_at).toISOString(),
    end: new Date(b.ends_at).toISOString(),
    text: b.reason ?? null,
    kind: b.kind === 'note' ? 'note' : 'block',
  }))

  // ── Mezery jednoho dne pro každý filtr místa ──────────────
  const gapsForDay = (d: string, dayStartMs: number, dayEndMs: number, items: CalItem[], taken: { start: string; end: string }[]): { gaps: Record<string, CalGap[]>; open: Record<string, Range[]> } => {
    const dayEndIso = new Date(dayEndMs).toISOString()
    const weekday = denVTydnuPraha(isoZPrazskehoCasu(d, '12:00'))
    const dayHours = new Map<string, Range[]>()
    for (const h of hours) {
      if (Number(h.weekday) !== weekday) continue
      const list = dayHours.get(h.service_id) ?? []
      list.push({ from: casNaMinuty(h.starts_at), to: casNaMinuty(h.ends_at) })
      dayHours.set(h.service_id, list)
    }
    const toDayMin = (ms: number) => (ms <= dayStartMs ? 0 : ms >= dayEndMs ? 24 * 60 : minutyOdPulnociPraha(new Date(ms)))
    const span = (i: { start: string; end: string; bufferEnd?: string | null }): Range => ({
      from: toDayMin(new Date(i.start).getTime()),
      to: toDayMin(new Date(i.bufferEnd ?? i.end).getTime()),
    })
    const busy = mergeRanges([...items.map((i) => (i.type === 'booking' ? span(i) : span({ start: i.start, end: i.end }))), ...taken.map(span)])
    // Minulost se nenabízí; dnes až od nejbližších 5 minut
    const lowerBound = d < today ? null : d === today ? Math.ceil(minutyOdPulnociPraha(new Date()) / 5) * 5 : 0

    const gapsFor = (cardIds: string[]): CalGap[] => {
      if (lowerBound == null || cardIds.length === 0) return []
      const withHours = cardIds.filter((id) => cardsWithHours.has(id))
      let open: Range[]
      if (withHours.length > 0) {
        open = mergeRanges(withHours.flatMap((id) => dayHours.get(id) ?? []))
      } else {
        // Bez otevírací doby jen mezery mezi rezervacemi
        const bk = mergeRanges(items.filter((i): i is CalBooking => i.type === 'booking').map(span))
        open = bk.length > 1 ? [{ from: bk[0].from, to: bk[bk.length - 1].to }] : []
      }
      open = open.map((r) => ({ from: Math.max(r.from, lowerBound), to: r.to })).filter((r) => r.to > r.from)
      return subtract(open, busy)
        // začátek nahoru, konec dolů na :00 / :30 (půlnoc zůstává)
        .map((g) => ({
          from: Math.ceil(g.from / GAP_STEP_MIN) * GAP_STEP_MIN,
          to: g.to >= 24 * 60 ? 24 * 60 : Math.floor(g.to / GAP_STEP_MIN) * GAP_STEP_MIN,
        }))
        .filter((g) => g.to - g.from >= MIN_GAP_MIN)
        .map((g) => ({
          start: isoZPrazskehoCasu(d, hhmm(g.from)),
          end: g.to >= 24 * 60 ? dayEndIso : isoZPrazskehoCasu(d, hhmm(g.to)),
          minutes: g.to - g.from,
          // Karty, jejichž otevírací doba mezeru zasahuje (bez otevírací doby všechny z filtru)
          cardIds: withHours.length > 0
            ? withHours.filter((id) => (dayHours.get(id) ?? []).some((r) => r.from < g.to && r.to > g.from))
            : cardIds,
        }))
    }

    // Otevírací doba pro šedé vyznačení času mimo provoz v mřížce
    const openFor = (cardIds: string[]): Range[] =>
      mergeRanges(cardIds.filter((id) => cardsWithHours.has(id)).flatMap((id) => dayHours.get(id) ?? []))

    const allIds = active.map((s) => s.id)
    const gaps: Record<string, CalGap[]> = { all: gapsFor(allIds) }
    const open: Record<string, Range[]> = { all: openFor(allIds) }
    for (const p of places) {
      const ids = active.filter((s) => (cardPlaces.get(s.id) ?? []).includes(p.key)).map((s) => s.id)
      gaps[p.key] = gapsFor(ids)
      open[p.key] = openFor(ids)
    }
    return { gaps, open }
  }

  // ── Jednotlivé dny ────────────────────────────────────────
  const days: CalDayData[] = weekDates.map((d) => {
    const startMs = new Date(isoZPrazskehoCasu(d, '00:00')).getTime()
    const endMs = new Date(isoZPrazskehoCasu(shiftDate(d, 1), '00:00')).getTime()
    const overlaps = (i: { start: string; end: string }) =>
      new Date(i.start).getTime() < endMs && new Date(i.end).getTime() > startMs
    const items: CalItem[] = [
      // Rezervace patří ke dni, kdy začíná
      ...bookings.filter((b) => { const t = new Date(b.start).getTime(); return t >= startMs && t < endMs }),
      ...slots.filter(overlaps),
      ...blocks.filter(overlaps),
    ].sort((a, b) => a.start.localeCompare(b.start))
    return { date: d, items, ...gapsForDay(d, startMs, endMs, items, takenSlots.filter(overlaps)) }
  })

  return { date, today, range, days, places, hasHours: cardsWithHours.size > 0 }
}

// ─── Hledání v kalendáři (19. 10. 2026, Matej: „najít konkrétního člověka“) ─────────────
// Rezervace podle jména zákazníka nebo služby a vlastní termíny podle textu – za poslední rok a dopředu,
// bez ohledu na diakritiku a velikost písmen. Nejdřív nadcházející (od nejbližší), pak proběhlé (od nejnovější).

export type CalSearchHit = {
  kind: 'booking' | 'note'
  id: string
  start: string
  end: string
  /** Jméno zákazníka / text vlastního termínu */
  name: string
  /** Služba (u rezervace) */
  detail: string | null
  placeKey: string | null
}

export async function searchCalendar(query: string): Promise<CalSearchHit[]> {
  const words = normalizeText(query.trim()).split(/\s+/).filter(Boolean)
  if (words.join('').length < 2) return []
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const db = adminDb() as any
  const fromIso = new Date(Date.now() - 365 * 86_400_000).toISOString()
  const matches = (text: string) => { const t = normalizeText(text); return words.every((w) => t.includes(w)) }

  const [{ data: orderRows }, { data: blockRows }] = await Promise.all([
    db.from('orders')
      .select('id, customer_id, booking_state, offer_kind, scheduled_at, scheduled_end, service_location, provider_place_address, service_items(name, duration_minutes), services(title, location_type, address, city)')
      .eq('provider_id', user.id)
      .neq('status', 'zruseno')
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', fromIso)
      .order('scheduled_at', { ascending: false })
      .limit(1000),
    db.from('provider_blocks')
      .select('*')
      .eq('provider_id', user.id)
      .gte('starts_at', fromIso)
      .limit(1000),
  ])

  // Jen rezervace, které v kalendáři drží čas (bez rozpracovaných plateb), a starý model
  const orders = ((orderRows ?? []) as any[]).filter((o) =>
    o.booking_state ? SHOWN_STATES.includes(o.booking_state) && o.booking_state !== 'pending_payment' : !o.offer_kind)
  const ids = Array.from(new Set(orders.map((o) => o.customer_id).filter(Boolean)))
  const nameOf = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', ids)
    for (const p of (profs ?? []) as any[]) nameOf.set(p.id, p.full_name || 'Zákazník')
  }

  const hits: CalSearchHit[] = []
  for (const o of orders) {
    const name = nameOf.get(o.customer_id) ?? 'Zákazník'
    const title = o.service_items?.name || o.services?.title || 'Rezervace'
    if (!matches(`${name} ${title}`)) continue
    const startMs = new Date(o.scheduled_at).getTime()
    const dur = Number(o.service_items?.duration_minutes ?? 0)
    const atCustomer = o.service_location ? o.service_location === 'u_zakaznika' : o.services?.location_type !== 'u_poskytovatele'
    const where = (o.provider_place_address || o.services?.address || o.services?.city || '').trim()
    hits.push({
      kind: 'booking',
      id: o.id,
      start: new Date(startMs).toISOString(),
      end: o.scheduled_end ? new Date(o.scheduled_end).toISOString() : new Date(startMs + (dur > 0 ? dur : FALLBACK_DURATION_MIN) * 60_000).toISOString(),
      name,
      detail: title,
      placeKey: atCustomer ? 'vyjezdy' : where ? placeKey(where) : null,
    })
  }
  for (const b of (blockRows ?? []) as any[]) {
    if (b.kind !== 'note' || !b.reason || !matches(b.reason)) continue
    hits.push({ kind: 'note', id: b.id, start: new Date(b.starts_at).toISOString(), end: new Date(b.ends_at).toISOString(), name: b.reason, detail: null, placeKey: null })
  }

  const now = Date.now()
  const upcoming = hits.filter((h) => new Date(h.end).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start))
  const past = hits.filter((h) => new Date(h.end).getTime() < now).sort((a, b) => b.start.localeCompare(a.start))
  return [...upcoming, ...past].slice(0, 20)
}
