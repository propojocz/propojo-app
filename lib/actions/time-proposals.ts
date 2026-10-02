'use server'
// lib/actions/time-proposals.ts
// VRSTVA 4 — návrh termínů u poptávky bez termínu.
//
// Tok: zákazník pošle poptávku → poskytovatel navrhne 1–6 časů (předvyplněných
// z jeho dostupnosti, ať se nebijí s tím, co už má) → zákazník jeden vybere a
// zaplatí zálohu, čímž je termín potvrzený. Nebo odmítne a domluví se v chatu.
//
// Návrhy se NEDRŽÍ. Až přijetím návrhu vznikne dočasný hold; u objednávky se
// zálohou ho Stripe potvrdí platbou. Při změně už zaplaceného termínu se znovu neplatí.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'
import { getFreeTimes } from '@/lib/actions/free-times'
import { releaseSlotAndMerge } from '@/lib/slot-merge'
import { claimMatchingAvailabilitySlot } from '@/lib/slot-claim'
import { BOOKING_POLICY } from '@/lib/booking/policy'
import { cas } from '@/lib/format'
import { bookingBufferMs } from '@/lib/booking/rules'
import { adminDb, checkNewBooking } from '@/lib/booking/payments'

// Stripe checkout běží 30 minut. Držíme o 5 minut déle kvůli zpoždění webhooku.
const HOLD_MINUTES = 35

// Model v2: termín jde měnit touto cestou jen před vznikem rezervace (nebo po vypršení platby).
// Změna potvrzené rezervace má vlastní pravidla (model v2 §10) a přijde samostatně.
function v2Locked(order: any): boolean {
  return order.booking_state != null && order.booking_state !== 'payment_expired'
}
const MAX_PROPOSALS = 6

export type Proposal = { id: string; starts_at: string; ends_at: string }

type Result = { success: true } | { success: false; error: string }
type AcceptResult =
  | { success: true; needsPayment: boolean }
  | { success: false; error: string }

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague',
  }).format(new Date(iso))

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * První objednávka poskytovatele, která se kryje s intervalem [startMs, endMs).
 * Kalendář je společný pro všechny nabídky poskytovatele – jeden člověk nemůže být na dvou místech.
 * Rozpracovaná platba s prošlým zámkem čas nedrží. Starší objednávky bez scheduled_end
 * dopočítáme z délky úkonu; u nového modelu se přičítá pauza za úkonem.
 */
async function findProviderClash(
  admin: ReturnType<typeof getAdminClient>,
  providerId: string,
  excludeOrderId: string,
  startMs: number,
  endMs: number,
  /** Nabídka objednávky – když má „samostatný kalendář“, kolidují jen její vlastní termíny (jako ve free-times). */
  serviceId?: string | null,
): Promise<{ name: string; startIso: string; endIso: string } | null> {
  let separateCalendar = false
  if (serviceId) {
    try {
      const { data: svc } = await admin.from('services').select('separate_calendar').eq('id', serviceId).maybeSingle()
      separateCalendar = (svc as { separate_calendar?: boolean } | null)?.separate_calendar === true
    } catch {
      // Sloupec nemusí existovat – pak platí společný kalendář.
    }
  }

  let query = admin
    .from('orders')
    .select('id, booking_state, offer_kind, scheduled_at, scheduled_end, deposit_status, hold_expires_at, service_items(name, duration_minutes, buffer_minutes), services(title)')
    .eq('provider_id', providerId)
    .neq('status', 'zruseno')
    .neq('id', excludeOrderId)
    .not('scheduled_at', 'is', null)
    .lt('scheduled_at', new Date(endMs).toISOString())
  if (separateCalendar && serviceId) query = query.eq('service_id', serviceId)
  const { data: rows } = await query as { data: any[] | null }

  for (const c of rows ?? []) {
    if (c.deposit_status === 'pending' && c.hold_expires_at && new Date(c.hold_expires_at).getTime() <= Date.now()) continue
    const s = new Date(c.scheduled_at).getTime()
    const fallbackDur = Number(c.service_items?.duration_minutes ?? 60) || 60
    const e = (c.scheduled_end ? new Date(c.scheduled_end).getTime() : s + fallbackDur * 60_000) + bookingBufferMs(c)
    if (startMs < e && endMs > s) {
      return {
        name: c.service_items?.name || c.services?.title || 'jiná rezervace',
        startIso: new Date(s).toISOString(),
        endIso: new Date(c.scheduled_end ? new Date(c.scheduled_end).getTime() : s + fallbackDur * 60_000).toISOString(),
      }
    }
  }
  return null
}

async function loadOrder(orderId: string) {
  const admin = getAdminClient()
  const { data } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, service_id, service_item_id, status, booking_state, offer_kind, location_lat, location_lng, scheduled_at, scheduled_end, slot_id, deposit_status, deposit_amount, hold_expires_at, pref_date_from, pref_date_to, pref_time, service_items(name, duration_minutes, buffer_minutes, deposit_amount, payment_model, offer_kind, quote_fee, deposit_type)')
    .eq('id', orderId)
    .single() as { data: any }
  return data
}

/**
 * Kandidátní volné časy pro panel poskytovatele.
 *
 * Dřív jsme vraceli jen první 3 termíny z 14 dnů. Když zákazník chtěl termín
 * až příští měsíc, provider si musel časy znovu ručně vypisovat. Teď:
 *  - respektujeme preferované datum od/do a denní dobu zákazníka,
 *  - díváme se až 60 dní dopředu (podle preference až 120),
 *  - vracíme více kandidátů, ale max. 4 z jednoho dne a 24 celkem.
 *
 * Kandidát je jen nabídka v UI. Jeho odškrtnutí ani neposlání NIC nemaže z
 * kalendáře; do order_time_proposals se uloží až skutečně vybrané časy.
 */
export async function suggestTimes(orderId: string): Promise<{ start: string; end: string }[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const order = await loadOrder(orderId)
  if (!order || order.provider_id !== user.id) return []
  if (!order.service_id || !order.service_item_id) return []

  const DAY_MS = 24 * 60 * 60 * 1000
  let daysAhead = 60
  if (order.pref_date_to) {
    const prefEnd = new Date(`${order.pref_date_to}T23:59:59Z`).getTime()
    if (Number.isFinite(prefEnd)) {
      daysAhead = Math.min(120, Math.max(14, Math.ceil((prefEnd - Date.now()) / DAY_MS) + 2))
    }
  }

  let days = await getFreeTimes(order.service_id, order.service_item_id, daysAhead)

  if (order.pref_date_from) days = days.filter((d) => d.date >= order.pref_date_from)
  if (order.pref_date_to) days = days.filter((d) => d.date <= order.pref_date_to)

  const timePref = order.pref_time as string | null
  const fitsTimePreference = (iso: string) => {
    if (!timePref || timePref === 'kdykoli') return true
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague', hour: '2-digit', hour12: false,
    }).format(new Date(iso)))
    if (timePref === 'rano') return hour >= 8 && hour < 12
    if (timePref === 'odpoledne') return hour >= 12 && hour < 17
    if (timePref === 'vecer') return hour >= 17 && hour < 20
    return true
  }

  const out: { start: string; end: string }[] = []
  const current = order.scheduled_at ? new Date(order.scheduled_at).toISOString() : null

  for (const day of days) {
    const candidates = day.times
      .filter((t) => !t.locked)
      .filter((t) => fitsTimePreference(t.start))
      .filter((t) => !current || new Date(t.start).toISOString() !== current)
      .slice(0, 4)

    for (const t of candidates) {
      out.push({ start: t.start, end: t.end })
      if (out.length >= 24) return out
    }
  }

  return out
}

/** Načte aktuální návrhy objednávky (pro obě strany). */
export async function getProposals(orderId: string): Promise<Proposal[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('order_time_proposals')
    .select('id, starts_at, ends_at')
    .eq('order_id', orderId)
    .order('starts_at', { ascending: true }) as { data: Proposal[] | null }
  return data ?? []
}

/** Poskytovatel odešle návrhy. Staré nahradí novými. */
export async function proposeTimes(
  orderId: string,
  starts: string[],
  /** Model B: délka okna příjezdu v minutách (jen hodnoty z policy) */
  arrivalWindowMinutes?: number,
): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const order = await loadOrder(orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.provider_id !== user.id) {
    return { success: false, error: 'Termín může navrhnout jen poskytovatel.' }
  }
  if (order.status === 'zruseno' || order.status === 'dokonceno' || order.status === 'ceka_potvrzeni') {
    return { success: false, error: 'U uzavřené objednávky termín navrhnout nelze.' }
  }
  if (order.deposit_status === 'pending' && order.booking_state == null) {
    return { success: false, error: 'Zákazník právě dokončuje platbu. Nejdřív musí platbu dokončit nebo zrušit.' }
  }
  if (v2Locked(order)) {
    return { success: false, error: 'Termín rezervace s platbou nelze touto cestou měnit.' }
  }
  if (order.scheduled_at && new Date(order.scheduled_at).getTime() <= Date.now()) {
    return { success: false, error: 'Probíhající nebo už proběhlý termín nelze tímto způsobem měnit.' }
  }

  const clean = Array.from(new Set(starts.filter(Boolean))).slice(0, MAX_PROPOSALS)
  if (clean.length === 0) return { success: false, error: 'Vyberte alespoň jeden termín.' }
  if (order.scheduled_at && clean.some((x) => new Date(x).toISOString() === new Date(order.scheduled_at).toISOString())) {
    return { success: false, error: 'Nový návrh je stejný jako současný termín.' }
  }

  // Model B (výjezd): termín je okno příjezdu, které zvolí poskytovatel (korekce 4).
  // Ostatní: délka z úkonu; když ji nemá, počítáme hodinu, ať má termín konec.
  const isArrivalWindow = order.service_items?.offer_kind === 'B'
  const windowOptions = BOOKING_POLICY.arrivalWindow.optionsMinutes
  if (isArrivalWindow && arrivalWindowMinutes != null && !windowOptions.includes(arrivalWindowMinutes)) {
    return { success: false, error: 'Neplatná délka okna příjezdu.' }
  }
  const duration = isArrivalWindow
    ? (arrivalWindowMinutes ?? BOOKING_POLICY.arrivalWindow.defaultMinutes)
    : Number(order.service_items?.duration_minutes ?? 0) || 60

  const rows: { order_id: string; starts_at: string; ends_at: string }[] = []
  for (const s of clean) {
    const d = new Date(s)
    if (isNaN(d.getTime())) return { success: false, error: 'Neplatný termín.' }
    if (d.getTime() < Date.now()) return { success: false, error: 'Termín nemůže být v minulosti.' }
    if (d.getTime() < Date.now() + BOOKING_POLICY.minLeadMinutes * 60000) {
      return { success: false, error: `Termín musí začínat nejdříve za ${BOOKING_POLICY.minLeadMinutes} minut.` }
    }
    rows.push({
      order_id: orderId,
      starts_at: d.toISOString(),
      ends_at: new Date(d.getTime() + duration * 60000).toISOString(),
    })
  }

  const admin = getAdminClient()

  // Poskytovatel nesmí nabídnout čas, kdy už má jinou rezervaci (kontrola i při přijetí zákazníkem).
  const ownBufferMs = order.service_items?.offer_kind
    ? Math.max(0, Number(order.service_items?.buffer_minutes ?? 0)) * 60_000
    : 0
  for (const r of rows) {
    const clash = await findProviderClash(
      admin,
      order.provider_id,
      orderId,
      new Date(r.starts_at).getTime(),
      new Date(r.ends_at).getTime() + ownBufferMs,
      order.service_id,
    )
    if (clash) {
      return {
        success: false,
        error: `Termín ${fmtWhen(r.starts_at)} se kryje s vaší rezervací „${clash.name}“ (${fmtWhen(clash.startIso)}–${cas(clash.endIso)}). Vyberte prosím jiný čas.`,
      }
    }
  }

  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  const { error } = await (admin.from('order_time_proposals') as any).insert(rows)
  if (error) {
    console.error('[proposeTimes]', error)
    return { success: false, error: 'Návrh se nepodařilo odeslat.' }
  }

  const isReschedule = !!order.scheduled_at
  // U výjezdu je termín okno příjezdu – ukázat i jeho konec.
  const navrhyText = rows
    .map((r) => (isArrivalWindow ? `${fmtWhen(r.starts_at)}–${cas(r.ends_at)}` : fmtWhen(r.starts_at)))
    .join(', ')

  // Zákazník dostane oznámení do zvonečku i push do telefonu.
  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: isReschedule
        ? 'Poskytovatel navrhl změnu termínu'
        : rows.length === 1 ? 'Poskytovatel navrhl termín' : `Poskytovatel navrhl ${rows.length} termíny`,
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[proposeTimes] notifikace:', err)
  }

  // Důležitou historii necháváme i v chatu. Proposal řádky jsou jen aktuální nabídka.
  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: isReschedule
        ? `Navrhuji změnu termínu z ${fmtWhen(order.scheduled_at)} na: ${navrhyText}. Původní termín zatím zůstává platný.`
        : rows.length === 1
          ? `Navrhuji termín ${navrhyText}. Potvrďte ho prosím nahoře v objednávce.`
          : `Navrhuji termíny: ${navrhyText}. Vyberte si prosím jeden nahoře v objednávce.`,
    })
  } catch (err) {
    console.error('[proposeTimes] zpráva:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}


/**
 * Zákazník přijal jeden z návrhů. Termín se zapíše na objednávku a když je
 * záloha, nasadí se dočasný zámek po dobu checkoutu. U změny už zaplaceného termínu se znovu neplatí.
 */
export async function acceptProposal(orderId: string, start: string): Promise<AcceptResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const order = await loadOrder(orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Termín může přijmout jen zákazník.' }
  }
  if (order.status === 'zruseno' || order.status === 'dokonceno' || order.status === 'ceka_potvrzeni') {
    return { success: false, error: 'U této objednávky už termín změnit nelze.' }
  }

  const isReschedule = !!order.scheduled_at
  if (isReschedule && new Date(order.scheduled_at).getTime() <= Date.now()) {
    return { success: false, error: 'Probíhající nebo už proběhlý termín nelze změnit.' }
  }
  if (isReschedule && order.deposit_status === 'pending' && order.booking_state == null) {
    return { success: false, error: 'Nejdřív dokončete nebo zrušte probíhající platbu.' }
  }
  if (v2Locked(order)) {
    return { success: false, error: 'Termín rezervace s platbou nelze touto cestou měnit.' }
  }

  const admin = getAdminClient()

  // Návrh musí opravdu existovat — klientovi se nevěří.
  const { data: proposal } = await admin
    .from('order_time_proposals')
    .select('id, starts_at, ends_at')
    .eq('order_id', orderId)
    .eq('starts_at', new Date(start).toISOString())
    .maybeSingle() as { data: any }

  if (!proposal) return { success: false, error: 'Tento termín už není v nabídce. Obnovte stránku.' }
  if (new Date(proposal.starts_at).getTime() < Date.now()) {
    return { success: false, error: 'Tento termín už proběhl. Požádejte o nový.' }
  }
  // Konec okna potřebuje no-show i check-in; bez něj rezervace nevznikne.
  if (!proposal.ends_at || new Date(proposal.ends_at).getTime() <= new Date(proposal.starts_at).getTime()) {
    return { success: false, error: 'Návrh termínu nemá platný konec. Požádejte poskytovatele o nový.' }
  }

  // Stará už zaplacená objednávka (přeplánování) se neplatí znovu. Jinak model v2:
  // každá rezervace se předautorizuje – i Cena výjezdu u Modelu B.
  const alreadyPaid = order.booking_state == null && (order.deposit_status === 'paid' || order.deposit_status === 'released')
  let v2Charge: { offerKind: string; chargeKc: number } | null = null
  // Výjezd (B): přesná adresa se souřadnicemi musí být před potvrzením termínu a platbou (korekce 5).
  if (!alreadyPaid && order.service_items?.offer_kind === 'B' && (order.location_lat == null || order.location_lng == null)) {
    return {
      success: false,
      error: 'Nejdřív prosím doplňte přesnou adresu výjezdu níže (vyberte ji ze seznamu). Pak můžete termín potvrdit.',
    }
  }
  if (!alreadyPaid) {
    const check = await checkNewBooking(adminDb(), {
      item: order.service_items ?? { offer_kind: null, deposit_amount: null, quote_fee: null },
      providerId: order.provider_id,
      start: new Date(proposal.starts_at),
      end: new Date(proposal.ends_at),
    })
    if (!check.ok) return { success: false, error: check.error }
    v2Charge = { offerKind: check.offerKind, chargeKc: check.commission.chargeHalere / 100 }
  }
  const ownBufferMs = v2Charge ? Math.max(0, Number(order.service_items?.buffer_minutes ?? 0)) * 60_000 : 0

  // Nekoliduje termín s jinou rezervací poskytovatele (sdílený kalendář všech jeho nabídek)?
  const clash = await findProviderClash(
    admin,
    order.provider_id,
    orderId,
    new Date(proposal.starts_at).getTime(),
    new Date(proposal.ends_at).getTime() + ownBufferMs,
    order.service_id,
  )
  if (clash) {
    return { success: false, error: 'Tento termín už není volný. Požádejte prosím poskytovatele o jiný.' }
  }

  const needsPayment = v2Charge !== null
  const oldScheduledAt = order.scheduled_at as string | null
  const oldSlotId = order.slot_id as string | null

  // Když už se nebude čekat na platbu, zkusíme potvrzený čas rovnou vyříznout i
  // z fyzického availability_slotu. Když provider čas navrhl ručně mimo své volné
  // okno, helper vrátí null a blokace zůstane jen přes orders.scheduled_at.
  const claimedNewSlotId = !needsPayment && order.service_id
    ? await claimMatchingAvailabilitySlot(admin, {
        orderId,
        providerId: order.provider_id,
        serviceId: order.service_id,
        startsAt: proposal.starts_at,
        endsAt: proposal.ends_at,
      })
    : null

  const update: Record<string, any> = {
    status: 'prijato',
    scheduled_at: proposal.starts_at,
    scheduled_end: proposal.ends_at,
    slot_id: claimedNewSlotId ?? (isReschedule ? null : (order.slot_id ?? null)),
    deposit_amount: v2Charge ? v2Charge.chargeKc : order.deposit_amount ?? null,
    ...(v2Charge ? { offer_kind: v2Charge.offerKind } : {}),
    deposit_status: needsPayment
      ? 'pending'
      : alreadyPaid
        ? order.deposit_status
        : order.deposit_status ?? 'none',
    hold_expires_at: needsPayment
      ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString()
      : null,
  }

  const { error } = await (admin.from('orders') as any)
    .update(update)
    .eq('id', orderId)
    .eq('customer_id', user.id)

  if (error) {
    console.error('[acceptProposal]', error)
    if (claimedNewSlotId) await releaseSlotAndMerge(admin, claimedNewSlotId, orderId)
    return { success: false, error: 'Termín se nepodařilo potvrdit.' }
  }

  // Když původní termín vznikl přímou rezervací availability_slotu, po úspěšném
  // přepnutí objednávky ho uvolníme. Když se merge nepovede, nový termín zůstává
  // platný a chybu zalogujeme — lepší ghost slot než přijít o potvrzenou objednávku.
  if (isReschedule && oldSlotId) {
    const released = await releaseSlotAndMerge(admin, oldSlotId, orderId)
    if (!released) console.warn('[acceptProposal] původní slot se nepodařilo uvolnit', oldSlotId)
  }

  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  // Historie změny v chatu.
  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: isReschedule && oldScheduledAt
        ? `Potvrzuji změnu termínu z ${fmtWhen(oldScheduledAt)} na ${fmtWhen(proposal.starts_at)}.`
        : `Potvrzuji termín ${fmtWhen(proposal.starts_at)}.`,
    })
  } catch (err) {
    console.error('[acceptProposal] zpráva:', err)
  }

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: isReschedule
        ? 'Zákazník potvrdil nový termín'
        : needsPayment ? 'Zákazník vybral termín — čeká na platbu' : 'Zákazník přijal termín',
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[acceptProposal] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  return { success: true, needsPayment }
}

/** Zákazník odmítl všechny návrhy — poskytovatel to má vědět a nabídnout jiné. */
export async function declineProposals(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const order = await loadOrder(orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Návrh může odmítnout jen zákazník.' }
  }

  const isReschedule = !!order.scheduled_at
  const admin = getAdminClient()
  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: isReschedule
        ? `Navrženou změnu termínu odmítám. Původní termín ${fmtWhen(order.scheduled_at)} zůstává platný.`
        : 'Navržené termíny mi nevyhovují. Prosím o jiné možnosti.',
    })
  } catch (err) {
    console.error('[declineProposals] zpráva:', err)
  }

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: isReschedule
        ? 'Zákazník odmítl změnu termínu — původní termín platí'
        : 'Zákazníkovi nevyhovuje žádný z termínů',
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[declineProposals] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}