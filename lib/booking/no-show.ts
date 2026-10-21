// lib/booking/no-show.ts
// Vrstva 5 (21. 10. 2026): nedostavení poskytovatele (model §7, AUTOREF-003) a check-in u výjezdu (model §9).
//
// Nedostavení: zákazník nahlásí po konci termínu, nejpozději do 48 h. Poskytovatel dostane systémovou
// výzvu (aplikace, e-mail, push); od jejího odeslání má 72 h, připomínka 24 h před koncem.
//   souhlasí → plné vrácení peněz z jeho účtu (pokyn AUTOREF-003);
//   nesouhlasí (s důvodem) → peníze se automaticky nehýbou, zákazník nárok řeší přímo s ním;
//   nereaguje → plné vrácení; u výjezdu s platným check-inem PŘED nahlášením ale nic (dva protichůdné
//   systémové záznamy = rozpor). Propojo nikdy nerozhoduje, kdo má pravdu.
//
// Check-in „Jsem na místě“ (jen výjezd): od 30 min před začátkem okna příjezdu do jeho konce + rezerva
// 15 min (Matej 21. 10. 2026). Platný = do 500 m od adresy zákazníka s přesností polohy do 200 m, v okně.
// Check-in v rezervě („pozdě“) nebo bez polohy se zapíše, ale automatické vrácení peněz neblokuje.
// Volitelná fotka (soukromé úložiště, vidí ji obě strany). Žádné průběžné sledování polohy.
// Poloha a fotka se po uplynutí všech lhůt (+30 dní) smažou; trvale zůstane výsledek (platný, čas,
// vzdálenost zaokrouhlená na 10 m). U rozporu se nechají (stanovisko AK, vrstva 5).

import { createNotification } from '@/lib/actions/notifications'
import { sendEmail } from '@/lib/email/send'
import { noShowDisputedEmail, noShowRefundEmail, noShowReportedEmail } from '@/lib/email/templates'
import { datumCas, terminDlouze } from '@/lib/format'
import { applyTransition, loadBookingOrder, logOrderEvent, type BookingOrder, type Db } from './payments'
import { BOOKING_POLICY, policyFromSnapshot, type BookingPolicy, type OfferKind } from './policy'
import { runAutoRefund } from './refunds'
import { canReportProviderNoShow, evaluateCheckIn, noShowNoResponseOutcome, type CheckInEvaluation } from './rules'
import { noShowReportWindow, noShowResponseDeadline, toDate } from './state'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
const MINUTE = 60_000
const DAY = 24 * 3_600_000

/** Soukromé úložiště fotek z check-inu (SQL docs/sql/vrstva5-check-in.sql) */
export const CHECK_IN_BUCKET = 'check-in-photos'
/** Poloha a fotka check-inu se mažou po termínu + 48 h + 72 h + ~30 dní (stanovisko AK) */
const CHECK_IN_PURGE_AFTER_DAYS = 35
const MAX_CHECK_INS_PER_ORDER = 5
const NOTE_MAX = 1000

export type NoShowReportRow = {
  id: string
  reported_at: string
  window_end_at: string
  customer_note: string | null
  notice_sent_at: string | null
  response_deadline_at: string | null
  reminder_sent_at: string | null
  outcome: string | null
  resolved_at: string | null
}

export type CheckInRow = {
  id: string
  recorded_at: string
  permission: string
  is_valid: boolean
  issues: string[]
  distance_m: number | null
  accuracy_m: number | null
  photo_path: string | null
}

function nazev(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || (order.offer_kind === 'B' ? 'Výjezd a nacenění' : 'Rezervace')
}

function kc(halere: number | null | undefined): string | null {
  const h = Number(halere ?? 0)
  return h > 0 ? `${(h / 100).toLocaleString('cs-CZ')} Kč` : null
}

async function emailOf(db: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

async function notify(params: Parameters<typeof createNotification>[0]) {
  try {
    await createNotification(params)
  } catch (err) {
    console.error('[no-show] notifikace:', err)
  }
}

/** Pravidla z doby rezervace (starší snapshot bez těchto částí → aktuální) */
function policyOf(order: BookingOrder): BookingPolicy {
  const snap = policyFromSnapshot(order.policy_snapshot)
  return snap.providerNoShow && snap.checkIn ? snap : BOOKING_POLICY
}

const orderUrl = (orderId: string) => `${APP_URL}/dashboard/objednavky/${orderId}`

// ─── Načtení ──────────────────────────────────────────────────────────────

export async function noShowReportOf(db: Db, orderId: string): Promise<NoShowReportRow | null> {
  const { data } = await db
    .from('no_show_reports')
    .select('id, reported_at, window_end_at, customer_note, notice_sent_at, response_deadline_at, reminder_sent_at, outcome, resolved_at')
    .eq('order_id', orderId)
    .maybeSingle()
  return (data as NoShowReportRow | null) ?? null
}

export async function noShowResponseOf(db: Db, reportId: string): Promise<{ response: 'agree' | 'dispute'; provider_note: string | null; responded_at: string } | null> {
  const { data } = await db.from('no_show_responses').select('response, provider_note, responded_at').eq('report_id', reportId).maybeSingle()
  return (data as { response: 'agree' | 'dispute'; provider_note: string | null; responded_at: string } | null) ?? null
}

export async function checkInsOf(db: Db, orderId: string): Promise<CheckInRow[]> {
  const { data } = await db
    .from('check_ins')
    .select('id, recorded_at, permission, is_valid, issues, distance_m, accuracy_m, photo_path')
    .eq('order_id', orderId)
    .order('recorded_at', { ascending: true })
  return (data as CheckInRow[] | null) ?? []
}

// ─── Check-in ─────────────────────────────────────────────────────────────

/** Kdy jde „Jsem na místě“ zmáčknout (null = u této rezervace vůbec ne) */
export function checkInWindow(order: BookingOrder): { opensAt: Date; windowEnd: Date; closesAt: Date } | null {
  const policy = policyOf(order)
  if (!order.offer_kind || !policy.checkIn.appliesTo.includes(order.offer_kind as OfferKind)) return null
  const start = toDate(order.scheduled_at)
  const end = toDate(order.scheduled_end)
  if (!start || !end) return null
  return {
    opensAt: new Date(start.getTime() - policy.checkIn.earliestMinutesBeforeStart * MINUTE),
    windowEnd: end,
    closesAt: new Date(end.getTime() + (policy.checkIn.graceMinutesAfterEnd ?? 0) * MINUTE),
  }
}

export function canCheckInNow(order: BookingOrder, now = new Date()): boolean {
  if (order.booking_state !== 'confirmed') return false
  const w = checkInWindow(order)
  return !!w && now.getTime() >= w.opensAt.getTime() && now.getTime() <= w.closesAt.getTime()
}

export async function recordCheckIn(
  db: Db,
  order: BookingOrder,
  input: { permission: 'granted' | 'denied' | 'unavailable'; lat: number | null; lng: number | null; accuracyM: number | null; photoPath: string | null },
  now = new Date(),
): Promise<{ ok: true; evaluation: CheckInEvaluation } | { ok: false; error: string }> {
  if (!canCheckInNow(order, now)) return { ok: false, error: 'Příjezd teď zaznamenat nejde – jen od 30 minut před začátkem okna příjezdu do 15 minut po jeho konci.' }
  const { count } = await db.from('check_ins').select('id', { count: 'exact', head: true }).eq('order_id', order.id)
  if ((count ?? 0) >= MAX_CHECK_INS_PER_ORDER) return { ok: false, error: 'Příjezd už je zaznamenaný.' }

  const { data: o } = await db.from('orders').select('location_lat, location_lng').eq('id', order.id).maybeSingle()
  const target = o as { location_lat: number | null; location_lng: number | null } | null
  const policy = policyOf(order)
  const lat = input.permission === 'granted' && Number.isFinite(input.lat) ? Number(input.lat) : null
  const lng = input.permission === 'granted' && Number.isFinite(input.lng) ? Number(input.lng) : null
  const accuracyM = input.permission === 'granted' && Number.isFinite(input.accuracyM) ? Number(input.accuracyM) : null
  const evaluation = evaluateCheckIn({
    offerKind: order.offer_kind as OfferKind,
    windowStart: toDate(order.scheduled_at)!,
    windowEnd: toDate(order.scheduled_end)!,
    recordedAt: now,
    permission: input.permission,
    lat, lng, accuracyM,
    targetLat: target?.location_lat ?? null,
    targetLng: target?.location_lng ?? null,
  }, policy)
  // Fotka jen z úložiště této rezervace (cestu skládá server při vydání odkazu k nahrání)
  const photoPath = input.photoPath && input.photoPath.startsWith(`${order.id}/`) ? input.photoPath : null

  const { data: row, error } = await db
    .from('check_ins')
    .insert({
      order_id: order.id,
      provider_id: order.provider_id,
      recorded_at: now.toISOString(),
      permission: input.permission,
      lat, lng,
      accuracy_m: accuracyM,
      target_lat: target?.location_lat ?? null,
      target_lng: target?.location_lng ?? null,
      distance_m: evaluation.distanceM,
      is_valid: evaluation.valid,
      issues: evaluation.issues,
      policy_version: policy.version,
      photo_path: photoPath,
    })
    .select('id')
    .single()
  if (error || !row) {
    console.error('[no-show] check-in:', error?.message)
    // Fotka bez záznamu by v úložišti zůstala navždy (mazání jde podle záznamů)
    if (photoPath) await db.storage.from(CHECK_IN_BUCKET).remove([photoPath])
    return { ok: false, error: 'Příjezd se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
  await logOrderEvent(db, order.id, 'check_in_recorded', { type: 'provider', id: order.provider_id }, {
    check_in_id: (row as { id: string }).id, valid: evaluation.valid, issues: evaluation.issues, distance_m: evaluation.distanceM, photo: !!photoPath,
  })
  // Zákazníkovi jen první platný příjezd (neplatné pokusy, např. daleko od adresy, by ho mátly)
  if (evaluation.valid) {
    const { count: validCount } = await db.from('check_ins').select('id', { count: 'exact', head: true }).eq('order_id', order.id).eq('is_valid', true)
    if ((validCount ?? 0) <= 1) {
      await notify({
        userId: order.customer_id,
        type: 'status_change',
        orderId: order.id,
        actorId: order.provider_id,
        title: 'Poskytovatel je na místě',
        preview: `${nazev(order)} · poskytovatel zaznamenal příjezd na vaši adresu.`,
      })
    }
  }
  return { ok: true, evaluation }
}

// ─── Nahlášení nedostavení ────────────────────────────────────────────────

/** Smí zákazník teď nahlásit nedostavení? (+ do kdy) */
export function noShowReportWindowOf(order: BookingOrder): { opensAt: Date; closesAt: Date } | null {
  const end = toDate(order.scheduled_end)
  if (!end) return null
  return noShowReportWindow(end, policyOf(order))
}

export function canReportNoShowNow(order: BookingOrder, alreadyReported: boolean, now = new Date()): boolean {
  if (!order.offer_kind || !order.booking_state) return false
  return canReportProviderNoShow({
    offerKind: order.offer_kind as OfferKind,
    state: order.booking_state,
    now,
    windowEnd: toDate(order.scheduled_end),
    alreadyReported,
  }, policyOf(order)).allowed
}

/** Systémová výzva poskytovateli; od jejího odeslání běží lhůta 72 h */
async function sendNotice(db: Db, order: BookingOrder, report: { id: string; customer_note: string | null }, reminder: boolean, deadline: Date) {
  const deadlineText = datumCas(deadline)
  const castka = kc(order.charge_halere)
  await notify({
    userId: order.provider_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.customer_id,
    title: reminder ? 'Připomínka: zákazník hlásí, že jste se nedostavili' : 'Zákazník hlásí, že jste se nedostavili',
    preview: `${nazev(order)} · vyjádřete se do ${deadlineText}, jinak se zákazníkovi vrátí ${castka ?? 'celá částka'}.`,
  })
  const email = await emailOf(db, order.provider_id)
  if (email) {
    const mail = noShowReportedEmail({
      serviceTitle: nazev(order),
      termText: order.scheduled_at ? terminDlouze(order.scheduled_at) : null,
      customerNote: report.customer_note,
      deadlineText,
      amountText: castka,
      reminder,
      orderUrl: orderUrl(order.id),
    })
    await sendEmail(email, mail.subject, mail.html)
  }
}

export async function reportProviderNoShow(
  db: Db,
  order: BookingOrder,
  note: string | null,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await noShowReportOf(db, order.id)
  if (!canReportNoShowNow(order, !!existing, now)) {
    return { ok: false, error: existing ? 'Nedostavení už je nahlášené.' : 'Nedostavení jde nahlásit po skončení termínu, nejpozději do 48 hodin.' }
  }
  const customerNote = (note ?? '').trim().slice(0, NOTE_MAX) || null
  const { data: row, error } = await db
    .from('no_show_reports')
    .insert({ order_id: order.id, reported_by: order.customer_id, reported_at: now.toISOString(), window_end_at: order.scheduled_end, customer_note: customerNote })
    .select('id')
    .single()
  if (error || !row) {
    if (error?.code === '23505') return { ok: false, error: 'Nedostavení už je nahlášené.' }
    console.error('[no-show] report:', error?.message)
    return { ok: false, error: 'Nahlášení se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
  const reportId = (row as { id: string }).id
  const r = await applyTransition(db, order, 'no_show_reported', { type: 'customer', id: order.customer_id }, { payload: { report_id: reportId } })
  if (!r.ok) {
    await db.from('no_show_reports').delete().eq('id', reportId)
    return { ok: false, error: 'Rezervace se mezitím změnila. Obnovte stránku.' }
  }
  await logOrderEvent(db, order.id, 'no_show_reported', { type: 'customer', id: order.customer_id }, { report_id: reportId })
  await sendAndStampNotice(db, order, { id: reportId, customer_note: customerNote }, new Date())
  return { ok: true }
}

async function sendAndStampNotice(db: Db, order: BookingOrder, report: { id: string; customer_note: string | null }, at: Date) {
  const { deadline } = noShowResponseDeadline(at, policyOf(order))
  await sendNotice(db, order, report, false, deadline)
  await db.from('no_show_reports').update({ notice_sent_at: at.toISOString(), response_deadline_at: deadline.toISOString() }).eq('id', report.id)
  await logOrderEvent(db, order.id, 'no_show_notice_sent', { type: 'system' }, { report_id: report.id, deadline: deadline.toISOString() })
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: 'Nahlášení jsme předali poskytovateli',
    preview: `${nazev(order)} · poskytovatel se může vyjádřit do ${datumCas(deadline)}. Když souhlasí nebo nereaguje, peníze se vám vrátí samy.`,
  })
}

// ─── Reakce poskytovatele ─────────────────────────────────────────────────

async function finishWithRefund(db: Db, order: BookingOrder, reportId: string, agreed: boolean) {
  const event = agreed ? 'no_show_agreed' : 'no_show_no_response'
  const actor = agreed ? { type: 'provider' as const, id: order.provider_id } : { type: 'system' as const }
  const t = await applyTransition(db, order, event, actor, { payload: { report_id: reportId } })
  if (!t.ok) return false
  const refund = await runAutoRefund(db, order, event, agreed ? 'provider' : 'system')
  const outcome = refund.kind === 'skipped' && (refund.reason === 'disputed' || refund.reason === 'not_covered_by_instruction') ? 'refund_blocked' : 'refund_initiated'
  await db.from('no_show_reports').update({ outcome, resolved_at: new Date().toISOString() }).eq('id', reportId)
  const amount = refund.kind === 'skipped' ? null : kc(refund.amountHalere)
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: agreed ? 'Poskytovatel nahlášení uznal' : 'Poskytovatel se včas nevyjádřil',
    preview: `${nazev(order)} · ${amount ? `vrácení ${amount} bylo zahájeno.` : 'stav vrácení peněz najdete v objednávce.'}`,
  })
  if (!agreed) {
    await notify({
      userId: order.provider_id,
      type: 'status_change',
      orderId: order.id,
      actorId: order.customer_id,
      title: 'Lhůta k vyjádření uplynula',
      preview: `${nazev(order)} · k nahlášení nedostavení jste se nevyjádřili. ${amount ? `Zákazníkovi se z vašeho Stripe účtu vrací ${amount}.` : ''}`.trim(),
    })
  }
  const email = await emailOf(db, order.customer_id)
  if (email) {
    const mail = noShowRefundEmail({
      serviceTitle: nazev(order),
      termText: order.scheduled_at ? terminDlouze(order.scheduled_at) : null,
      agreed,
      amountText: amount,
      orderUrl: orderUrl(order.id),
    })
    await sendEmail(email, mail.subject, mail.html)
  }
  return true
}

async function finishDisputed(db: Db, order: BookingOrder, reportId: string, providerNote: string | null, byCheckIn: boolean) {
  const event = byCheckIn ? 'no_show_conflict' : 'no_show_disputed'
  const actor = byCheckIn ? { type: 'system' as const } : { type: 'provider' as const, id: order.provider_id }
  const t = await applyTransition(db, order, event, actor, { payload: { report_id: reportId } })
  if (!t.ok) return false
  await db.from('no_show_reports').update({ outcome: byCheckIn ? 'check_in_conflict' : 'disputed', resolved_at: new Date().toISOString() }).eq('id', reportId)
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: byCheckIn ? 'Peníze se automaticky nevrací' : 'Poskytovatel s nahlášením nesouhlasí',
    preview: `${nazev(order)} · Propojo nerozhoduje, kdo má pravdu. Nárok uplatněte přímo u poskytovatele.`,
  })
  if (byCheckIn) {
    await notify({
      userId: order.provider_id,
      type: 'status_change',
      orderId: order.id,
      actorId: order.customer_id,
      title: 'Lhůta k vyjádření uplynula',
      preview: `${nazev(order)} · máte zaznamenaný příjezd na místo, peníze se proto automaticky nevrací. Domluvte se se zákazníkem.`,
    })
  }
  const email = await emailOf(db, order.customer_id)
  if (email) {
    const mail = noShowDisputedEmail({
      serviceTitle: nazev(order),
      termText: order.scheduled_at ? terminDlouze(order.scheduled_at) : null,
      providerNote,
      byCheckIn,
      orderUrl: orderUrl(order.id),
    })
    await sendEmail(email, mail.subject, mail.html)
  }
  return true
}

export async function respondToNoShow(
  db: Db,
  order: BookingOrder,
  response: 'agree' | 'dispute',
  note: string | null,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await noShowReportOf(db, order.id)
  if (!report || report.resolved_at || order.booking_state !== 'no_show_reported') {
    return { ok: false, error: 'Nahlášení už je vyřízené. Obnovte stránku.' }
  }
  if (report.response_deadline_at && new Date(report.response_deadline_at).getTime() < now.getTime()) {
    return { ok: false, error: 'Lhůta k vyjádření už uplynula. Obnovte stránku.' }
  }
  const providerNote = (note ?? '').trim().slice(0, NOTE_MAX) || null
  if (response === 'dispute' && (!providerNote || providerNote.length < 10)) {
    return { ok: false, error: 'Napište prosím, proč s nahlášením nesouhlasíte (aspoň pár slov).' }
  }
  // Zámek: jedna odpověď na nahlášení (unikátní report_id) – i proti souběhu s cronem
  const { error } = await db.from('no_show_responses').insert({
    report_id: report.id, order_id: order.id, provider_id: order.provider_id, response, provider_note: providerNote, responded_at: now.toISOString(),
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Na nahlášení už jste odpověděli.' }
    console.error('[no-show] odpověď:', error.message)
    return { ok: false, error: 'Odpověď se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
  await logOrderEvent(db, order.id, 'provider_responded', { type: 'provider', id: order.provider_id }, { report_id: report.id, response })
  const done = response === 'agree'
    ? await finishWithRefund(db, order, report.id, true)
    : await finishDisputed(db, order, report.id, providerNote, false)
  return done ? { ok: true } : { ok: false, error: 'Rezervace se mezitím změnila. Obnovte stránku.' }
}

// ─── Cron ─────────────────────────────────────────────────────────────────

/** Výzvy, připomínky, konec lhůty bez reakce a mazání polohy / fotek z check-inu */
export async function tickNoShows(db: Db, now = new Date()): Promise<{ resolved: number; reminded: number; purged: number }> {
  let resolved = 0
  let reminded = 0
  const { data } = await db
    .from('no_show_reports')
    .select('id, order_id, reported_at, customer_note, notice_sent_at, response_deadline_at, reminder_sent_at')
    .is('resolved_at', null)
    .limit(100)
  for (const r of (data ?? []) as Array<Pick<NoShowReportRow, 'id' | 'reported_at' | 'customer_note' | 'notice_sent_at' | 'response_deadline_at' | 'reminder_sent_at'> & { order_id: string }>) {
    const order = await loadBookingOrder(db, r.order_id)
    if (!order) continue
    if (order.booking_state !== 'no_show_reported') {
      // Rezervace mezitím skončila jinak (např. odstoupení) – nahlášení jen uzavřít
      await db.from('no_show_reports').update({ resolved_at: now.toISOString() }).eq('id', r.id).is('resolved_at', null)
      continue
    }
    // Výzva se při nahlášení nepodařila odeslat → odeslat teď (lhůta běží až od odeslání)
    if (!r.notice_sent_at || !r.response_deadline_at) {
      await sendAndStampNotice(db, order, { id: r.id, customer_note: r.customer_note }, now)
      continue
    }
    const deadline = new Date(r.response_deadline_at)
    if (deadline.getTime() <= now.getTime()) {
      // Zámek proti souběhu s odpovědí poskytovatele: odpověď už existuje → nic
      const { data: resp } = await db.from('no_show_responses').select('id').eq('report_id', r.id).maybeSingle()
      if (resp) continue
      const { data: ci } = await db
        .from('check_ins').select('recorded_at').eq('order_id', order.id).eq('is_valid', true)
        .order('recorded_at', { ascending: true }).limit(1)
      const validAt = (ci ?? [])[0] ? new Date((ci as Array<{ recorded_at: string }>)[0].recorded_at) : null
      const outcome = noShowNoResponseOutcome({ offerKind: order.offer_kind as OfferKind, reportedAt: new Date(r.reported_at), validCheckInAt: validAt })
      const ok = outcome === 'no_show_conflict'
        ? await finishDisputed(db, order, r.id, null, true)
        : await finishWithRefund(db, order, r.id, false)
      if (ok) resolved++
      continue
    }
    const { remindAt } = noShowResponseDeadline(new Date(r.notice_sent_at), policyOf(order))
    if (!r.reminder_sent_at && now.getTime() >= remindAt.getTime()) {
      await sendNotice(db, order, { id: r.id, customer_note: r.customer_note }, true, deadline)
      await db.from('no_show_reports').update({ reminder_sent_at: now.toISOString() }).eq('id', r.id)
      await logOrderEvent(db, order.id, 'no_show_reminder_sent', { type: 'system' }, { report_id: r.id })
      reminded++
    }
  }
  const purged = await purgeCheckInLocations(db, now)
  return { resolved, reminded, purged }
}

/** Po uplynutí všech lhůt smazat polohu, adresu cíle a fotku; nechat výsledek a vzdálenost po 10 m */
async function purgeCheckInLocations(db: Db, now: Date): Promise<number> {
  const before = new Date(now.getTime() - CHECK_IN_PURGE_AFTER_DAYS * DAY).toISOString()
  const { data } = await db
    .from('check_ins')
    .select('id, order_id, distance_m, photo_path, orders(booking_state)')
    .is('purged_at', null)
    .lt('recorded_at', before)
    .limit(200)
  let purged = 0
  for (const c of (data ?? []) as unknown as Array<{ id: string; distance_m: number | null; photo_path: string | null; orders: { booking_state: string | null } | null }>) {
    // Rozporované nahlášení: záznam zůstává jako doklad
    if (c.orders?.booking_state === 'no_show_disputed') continue
    if (c.photo_path) {
      const { error } = await db.storage.from(CHECK_IN_BUCKET).remove([c.photo_path])
      if (error) { console.error('[no-show] mazání fotky:', error.message); continue }
    }
    await db.from('check_ins').update({
      lat: null, lng: null, accuracy_m: null, target_lat: null, target_lng: null, photo_path: null,
      distance_m: c.distance_m != null ? Math.round(c.distance_m / 10) * 10 : null,
      purged_at: now.toISOString(),
    }).eq('id', c.id)
    purged++
  }
  return purged
}

/** Odkaz k nahrání fotky z check-inu přímo do soukromého úložiště (obejde limit velikosti server action) */
export async function checkInPhotoUploadUrl(db: Db, order: BookingOrder): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  if (!canCheckInNow(order)) return { ok: false, error: 'Příjezd teď zaznamenat nejde.' }
  const path = `${order.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { data, error } = await db.storage.from(CHECK_IN_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[no-show] upload url:', error?.message)
    return { ok: false, error: 'Fotku teď nejde nahrát.' }
  }
  return { ok: true, path: data.path, token: data.token }
}

/** Dočasné odkazy na fotky z check-inu pro detail rezervace (obě strany) */
export async function checkInPhotoUrls(db: Db, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out
  const { data } = await db.storage.from(CHECK_IN_BUCKET).createSignedUrls(paths, 3600)
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}
