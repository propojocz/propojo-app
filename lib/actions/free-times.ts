'use server'
// lib/actions/free-times.ts
// VRSTVA 3a — generování volných termínů z otevírací doby karty.
//
// Vstup: karta + úkon. Výstup: dny s konkrétními časy, na které se zákazník
// může objednat. Počítá se na serveru, protože blokace poskytovatele jsou
// soukromé (RLS) a klient by je nesměl vidět.
//
// Co se odečítá:
//   1) obsazené termíny (orders.scheduled_at) — u sdíleného kalendáře napříč
//      všemi kartami poskytovatele, u samostatného jen z téhle karty,
//   2) blokace (provider_blocks) — dovolená, doktor, zákazník z ulice,
//   3) pauza za úkonem (service_items.buffer_minutes) a rezerva na přejezd
//      (services.travel_buffer_minutes).
//
// Zámek při placení: objednávka s deposit_status='pending' a živým
// hold_expires_at drží čas jen dočasně. Ostatním se ukáže zašedle
// („právě se rezervuje") a po vypršení se sama vrátí mezi volné — bez cronu,
// prostě se přestane počítat jako obsazená.
//
// POZOR na typy: types/database.ts nezná service_hours, provider_blocks ani
// polovinu sloupců orders. Proto se všude přetypovává, stejně jako jinde
// v projektu.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const ZONE = 'Europe/Prague'
const STEP_MIN = 15          // granularita nabízených časů (v1 po čtvrthodinách)
const MIN_LEAD_MIN = 30      // nejbližší možný termín — ne „za pět minut"
const DEFAULT_DAYS = 14
const FALLBACK_DURATION = 60 // když u staré objednávky neznáme délku

export type FreeTime = {
  /** ISO začátek termínu */
  start: string
  /** ISO konec (bez pauzy — to je čas, který zákazník uvidí) */
  end: string
  /** Někdo ho právě platí. Ukázat zašedle, nejde kliknout. */
  locked: boolean
  /** Do kdy zámek běží (ISO) — pro odpočet v UI. */
  lockedUntil?: string | null
}

export type FreeDay = {
  /** 'YYYY-MM-DD' v pražském čase */
  date: string
  /** „Dnes" / „Zítra" / „čt 31. 7." */
  label: string
  /** Počet časů, na které opravdu jde kliknout (bez zamčených). */
  count: number
  times: FreeTime[]
}

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Pražský čas bez knihoven ─────────────────────────────────
// Server běží v UTC, otevírací doba je ale lokální. Offset zjišťujeme přes
// Intl, takže letní i zimní čas vyjde správně bez natvrdo zadaných +1/+2.
function offsetMinutesAt(d: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second)
  )
  return (asUtc - d.getTime()) / 60000
}

/** '2026-07-28' + '09:00' (pražsky) → skutečný okamžik v UTC. */
function pragueToUtc(dateStr: string, timeStr: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  // Dvě kola kvůli hodině, kdy se přehazuje čas.
  let guess = new Date(naive.getTime() - offsetMinutesAt(naive) * 60000)
  guess = new Date(naive.getTime() - offsetMinutesAt(guess) * 60000)
  return guess
}

/** Datum v pražském čase jako 'YYYY-MM-DD'. */
function pragueDateStr(d: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return dtf.format(d)
}

/** ISO číslo dne (1 = pondělí … 7 = neděle) pro dané pražské datum. */
function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`)
  const js = d.getUTCDay() // 0 = neděle
  return js === 0 ? 7 : js
}

function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return 'Dnes'
  if (dateStr === tomorrowStr) return 'Zítra'
  const d = new Date(`${dateStr}T12:00:00Z`)
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC',
  }).format(d)
}

function hhmm(t: string): string {
  return String(t ?? '').slice(0, 5)
}

function toMin(t: string): number {
  const [h, m] = hhmm(t).split(':').map(Number)
  return h * 60 + m
}

type Busy = { from: number; to: number; locked: boolean; lockedUntil?: string | null }

type CardContext = {
  providerId: string
  travel: number
  byWeekday: Record<number, { from: number; to: number }[]>
  busy: Busy[]
}

/** Načte vše, co je pro generování společné — otevírací dobu a obsazenost. */
async function loadCardContext(serviceId: string, daysAhead: number): Promise<CardContext | null> {
  const supabase = createClient()

  const { data: cardRow } = await supabase
    .from('services')
    .select('id, provider_id, location_type, is_active')
    .eq('id', serviceId)
    .single() as { data: any }

  if (!cardRow || cardRow.is_active !== true) return null
  const providerId: string = cardRow.provider_id

  // Sloupce z vrstvy 1 — zvlášť, ať to nespadne, kdyby SQL neproběhlo.
  let travelBuffer = 0
  let separateCalendar = false
  try {
    const { data: extra } = await supabase
      .from('services')
      .select('travel_buffer_minutes, separate_calendar')
      .eq('id', serviceId)
      .single() as { data: any }
    travelBuffer = Number(extra?.travel_buffer_minutes ?? 0)
    separateCalendar = extra?.separate_calendar === true
  } catch {
    // Sloupce ještě nejsou — jedeme bez nich.
  }

  // Přejezd se počítá jen tam, kde se za zákazníkem jezdí.
  const travel = cardRow.location_type === 'u_poskytovatele' ? 0 : travelBuffer

  // ── Otevírací doba ─────────────────────────────────────────
  const { data: hoursRows } = await supabase
    .from('service_hours')
    .select('weekday, starts_at, ends_at')
    .eq('service_id', serviceId) as { data: any[] | null }

  const hours = hoursRows ?? []
  if (hours.length === 0) return null   // bez otevírací doby → poptávkový tok

  const byWeekday: Record<number, { from: number; to: number }[]> = {}
  for (const h of hours) {
    const w = Number(h.weekday)
    ;(byWeekday[w] ??= []).push({ from: toMin(h.starts_at), to: toMin(h.ends_at) })
  }
  for (const w of Object.keys(byWeekday)) {
    byWeekday[Number(w)].sort((a, b) => a.from - b.from)
  }

  // ── Obsazenost ─────────────────────────────────────────────
  // Blokace jsou soukromé (RLS jen vlastník), takže přes service role.
  const admin = getAdminClient()
  const now = new Date()
  const rangeFrom = new Date(now.getTime() - 24 * 3600 * 1000)
  const rangeTo = new Date(now.getTime() + (daysAhead + 1) * 24 * 3600 * 1000)

  // Objednávky s termínem. Sdílený kalendář = všechny karty poskytovatele,
  // aby si jeden člověk nemohl být zarezervovaný dvakrát naráz.
  let ordersQuery = admin
    .from('orders')
    .select('id, service_id, scheduled_at, scheduled_end, status, deposit_status, hold_expires_at, service_items(duration_minutes, buffer_minutes)')
    .eq('provider_id', providerId)
    .neq('status', 'zruseno')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', rangeFrom.toISOString())
    .lte('scheduled_at', rangeTo.toISOString())

  if (separateCalendar) ordersQuery = ordersQuery.eq('service_id', serviceId)

  const { data: orderRows } = await ordersQuery as { data: any[] | null }

  const busy: Busy[] = []
  for (const o of orderRows ?? []) {
    // Vypršelý zámek = čas je zase volný. Žádný cron na to nepotřebujeme.
    const holdUntil = o.hold_expires_at ? new Date(o.hold_expires_at) : null
    const isHold = o.deposit_status === 'pending' && holdUntil != null
    if (isHold && holdUntil!.getTime() <= now.getTime()) continue

    const start = new Date(o.scheduled_at).getTime()
    const dur = Number(o.service_items?.duration_minutes ?? 0)
    const buf = Number(o.service_items?.buffer_minutes ?? 0)
    const end = o.scheduled_end
      ? new Date(o.scheduled_end).getTime()
      : start + ((dur > 0 ? dur : FALLBACK_DURATION) + buf) * 60000

    busy.push({
      from: start,
      to: end,
      locked: isHold,
      lockedUntil: isHold ? holdUntil!.toISOString() : null,
    })
  }

  // Zabraná okna z last-minute termínů — objednávka u nich sice bývá, ale
  // když vznikla starým tokem bez scheduled_at, jinak bychom o ní nevěděli.
  const { data: slotRows } = await admin
    .from('availability_slots')
    .select('starts_at, ends_at, status')
    .eq('provider_id', providerId)
    .eq('status', 'zabrano')
    .lt('starts_at', rangeTo.toISOString())
    .gt('ends_at', rangeFrom.toISOString()) as { data: any[] | null }

  for (const s of slotRows ?? []) {
    busy.push({
      from: new Date(s.starts_at).getTime(),
      to: new Date(s.ends_at).getTime(),
      locked: false,
    })
  }

  // Blokace: buď na konkrétní kartu, nebo na všechny (service_id null = dovolená).
  const { data: blockRows } = await admin
    .from('provider_blocks')
    .select('service_id, starts_at, ends_at')
    .eq('provider_id', providerId)
    .lt('starts_at', rangeTo.toISOString())
    .gt('ends_at', rangeFrom.toISOString()) as { data: any[] | null }

  for (const b of blockRows ?? []) {
    if (b.service_id && b.service_id !== serviceId) continue
    busy.push({
      from: new Date(b.starts_at).getTime(),
      to: new Date(b.ends_at).getTime(),
      locked: false,
    })
  }

  return { providerId, travel, byWeekday, busy }
}

/** Z kontextu vyrobí dny s časy pro JEDEN úkon dané délky. */
function buildDays(ctx: CardContext, duration: number, itemBuffer: number, daysAhead: number): FreeDay[] {
  const now = new Date()
  const todayStr = pragueDateStr(now)
  const tomorrowStr = pragueDateStr(new Date(now.getTime() + 24 * 3600 * 1000))
  const earliest = now.getTime() + MIN_LEAD_MIN * 60000
  const blockMin = duration + itemBuffer + ctx.travel

  const days: FreeDay[] = []

  for (let i = 0; i < daysAhead; i++) {
    const dayDate = new Date(now.getTime() + i * 24 * 3600 * 1000)
    const dateStr = pragueDateStr(dayDate)
    const ranges = ctx.byWeekday[isoWeekday(dateStr)] ?? []
    if (ranges.length === 0) continue

    const times: FreeTime[] = []

    for (const r of ranges) {
      // Poslední možný začátek, aby se úkon vešel do otevírací doby.
      // Pauza za úkonem smí přesáhnout zavíračku — uklízí se i po zavření.
      const lastStart = r.to - duration
      for (let m = r.from; m <= lastStart; m += STEP_MIN) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        const startDate = pragueToUtc(dateStr, `${hh}:${mm}`)
        const startMs = startDate.getTime()
        if (startMs < earliest) continue

        const visibleEnd = startMs + duration * 60000
        const blockEnd = startMs + blockMin * 60000

        // Kolize? Porovnáváme včetně pauzy a přejezdu.
        let hit: Busy | null = null
        for (const b of ctx.busy) {
          if (startMs < b.to && blockEnd > b.from) { hit = b; break }
        }

        if (hit && !hit.locked) continue   // obsazeno napevno → nenabízí se vůbec

        times.push({
          start: startDate.toISOString(),
          end: new Date(visibleEnd).toISOString(),
          locked: !!hit,
          lockedUntil: hit?.lockedUntil ?? null,
        })
      }
    }

    if (times.length === 0) continue
    times.sort((a, b) => a.start.localeCompare(b.start))

    days.push({
      date: dateStr,
      label: dayLabel(dateStr, todayStr, tomorrowStr),
      count: times.filter((t) => !t.locked).length,
      times,
    })
  }

  return days
}

/**
 * Volné termíny pro VŠECHNY zveřejněné úkony karty naráz.
 * Obsazenost se čte jednou a použije pro všechny — detail karty tak nedělá
 * deset dotazů na deset úkonů. Vrací mapu service_item_id → dny.
 * Prázdná mapa = karta nemá otevírací dobu (→ poptávka bez termínu).
 */
export async function getFreeTimesForCard(
  serviceId: string,
  daysAhead: number = DEFAULT_DAYS
): Promise<Record<string, FreeDay[]>> {
  const supabase = createClient()

  const { data: itemRows } = await supabase
    .from('service_items')
    .select('id, duration_minutes, payment_model, is_active, buffer_minutes')
    .eq('service_id', serviceId)
    .eq('is_active', true) as { data: any[] | null }

  const items = (itemRows ?? []).filter(
    (i) => i.payment_model !== 'B' && Number(i.duration_minutes ?? 0) > 0
  )
  if (items.length === 0) return {}

  const ctx = await loadCardContext(serviceId, daysAhead)
  if (!ctx) return {}

  const out: Record<string, FreeDay[]> = {}
  for (const it of items) {
    out[it.id] = buildDays(
      ctx,
      Number(it.duration_minutes),
      Number(it.buffer_minutes ?? 0),
      daysAhead
    )
  }
  return out
}

/**
 * Volné termíny pro JEDEN úkon. Hodí se po rezervaci, když je potřeba
 * seznam obnovit, aniž bychom počítali celou kartu.
 */
export async function getFreeTimes(
  serviceId: string,
  serviceItemId: string,
  daysAhead: number = DEFAULT_DAYS
): Promise<FreeDay[]> {
  const supabase = createClient()

  const { data: itemRow } = await supabase
    .from('service_items')
    .select('id, service_id, duration_minutes, payment_model, is_active, buffer_minutes')
    .eq('id', serviceItemId)
    .single() as { data: any }

  if (!itemRow || itemRow.service_id !== serviceId || itemRow.is_active !== true) return []
  // Nacenění na místě se na konkrétní čas nerezervuje — jde přes poptávku.
  if (itemRow.payment_model === 'B') return []

  const duration = Number(itemRow.duration_minutes ?? 0)
  if (!duration || duration <= 0) return []

  const ctx = await loadCardContext(serviceId, daysAhead)
  if (!ctx) return []

  return buildDays(ctx, duration, Number(itemRow.buffer_minutes ?? 0), daysAhead)
}