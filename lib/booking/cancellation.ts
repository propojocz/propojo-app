// lib/booking/cancellation.ts
// Vrstva 4, část 2: kdo a kdy smí zrušit potvrzenou (zaplacenou) rezervaci a co se stane s penězi,
// a kdy jde odstoupit od Rezervační smlouvy. Jen čte fakta z DB a ptá se pravidel v rules.ts.
//
// - Poskytovatel: zrušení potvrzené rezervace do začátku termínu → plný refund (AUTOREF-001).
// - Zákazník: před hranicí (§8: A/C před začátkem a před předáním Závazné nabídky, B před začátkem
//   a bez platného check-inu) → plný refund (AUTOREF-004); za hranicí se automaticky nic neděje.
// - Odstoupení (VOP 9.1): samostatná funkce 14 dní od vzniku rezervace (capture), i po předání nabídky.
//   Peníze automaticky nehýbe – vrací je poskytovatel (VOP 9.4). U výrobku na míru právo nevzniká.

import { BOOKING_POLICY, policyFromSnapshot, type OfferKind } from './policy'
import { customerCancellationOutcome, type CustomerCancellationOutcome } from './rules'
import { toDate } from './state'
import { sendEmail } from '@/lib/email/send'
import { withdrawalConfirmationEmail, withdrawalNoticeEmail } from '@/lib/email/templates'
import { datumCas, terminDlouze } from '@/lib/format'
import { loadBookingOrder, logOrderEvent, type BookingOrder, type Db } from './payments'

/** Zákonná lhůta pro odstoupení (dny od vzniku Rezervační smlouvy) */
export const WITHDRAWAL_DAYS = 14

export type ProviderCancelCheck = { allowed: true } | { allowed: false; reason: 'state' | 'started' }

export function providerCancelCheck(order: Pick<BookingOrder, 'booking_state' | 'scheduled_at'>, now = new Date()): ProviderCancelCheck {
  if (order.booking_state !== 'confirmed') return { allowed: false, reason: 'state' }
  const start = toDate(order.scheduled_at)
  if (start && now.getTime() >= start.getTime()) return { allowed: false, reason: 'started' }
  return { allowed: true }
}

/** Pravidla platná v době rezervace; starší snapshot bez hranic zrušení → aktuální pravidla */
function cancellationPolicy(snapshot: unknown) {
  const snap = policyFromSnapshot(snapshot)
  return snap.customerCancellation ? snap : BOOKING_POLICY
}

/** Co se stane, když zákazník potvrzenou rezervaci teď zruší */
export async function customerCancelOutcome(db: Db, order: BookingOrder, now = new Date()): Promise<CustomerCancellationOutcome> {
  if (!order.booking_state || !order.offer_kind) return { allowed: false }
  const { data } = await db.from('orders').select('offer_delivered_at').eq('id', order.id).maybeSingle()
  const { data: checkIns } = await db.from('check_ins').select('id').eq('order_id', order.id).eq('is_valid', true).limit(1)
  return customerCancellationOutcome({
    offerKind: order.offer_kind as OfferKind,
    state: order.booking_state,
    now,
    windowStart: toDate(order.scheduled_at),
    offerDeliveredAt: toDate((data as { offer_delivered_at: string | null } | null)?.offer_delivered_at ?? null),
    hasValidCheckIn: (checkIns ?? []).length > 0,
  }, cancellationPolicy(order.policy_snapshot))
}

/** Proč automatické vrácení už nejde – text pro zákazníka */
export function noAutoRefundText(reason: 'offer_delivered' | 'window_started' | 'valid_check_in' | 'no_window'): string {
  switch (reason) {
    case 'offer_delivered':
      return 'Poskytovatel vám už předal Závaznou nabídku, proto rezervaci nejde zrušit s automatickým vrácením peněz.'
    case 'window_started':
      return 'Termín už začal, proto rezervaci nejde zrušit s automatickým vrácením peněz.'
    case 'valid_check_in':
      return 'Poskytovatel už je na místě (zaznamenal příjezd), proto výjezd nejde zrušit s automatickým vrácením peněz.'
    case 'no_window':
      return 'Rezervace nemá termín, proto ji nejde zrušit s automatickým vrácením peněz.'
  }
}

export type WithdrawalInfo =
  | { available: true; until: Date }
  | { available: false; reason: 'not_applicable' | 'not_confirmed' | 'expired' | 'already'; at?: Date }

/** Smí zákazník teď odstoupit od Rezervační smlouvy? */
export async function withdrawalInfo(db: Db, order: BookingOrder, now = new Date()): Promise<WithdrawalInfo> {
  const { data } = await db.from('withdrawals').select('requested_at').eq('order_id', order.id).limit(1)
  const existing = ((data ?? [])[0] as { requested_at: string } | undefined) ?? null
  if (existing) return { available: false, reason: 'already', at: new Date(existing.requested_at) }
  // Výrobek na míru: právo odstoupit nevzniká (§ 1837 OZ, zákazník to potvrdil ve shrnutí)
  if (order.offer_kind !== 'A' && order.offer_kind !== 'B') return { available: false, reason: 'not_applicable' }
  const confirmedAt = toDate(order.confirmed_at)
  // Smlouva vzniká až stržením platby; zrušená rezervace už se řeší vrácením peněz
  if (!confirmedAt || order.booking_state !== 'confirmed') return { available: false, reason: 'not_confirmed' }
  const until = new Date(confirmedAt.getTime() + WITHDRAWAL_DAYS * 24 * 3600_000)
  if (now.getTime() > until.getTime()) return { available: false, reason: 'expired' }
  // Výjezd: zákazník ve shrnutí požádal o provedení před uplynutím lhůty → po skončení okna příjezdu
  // (výjezd proběhl) právo zaniká (§ 1837 OZ). Když poskytovatel nepřijel, slouží hlášení nedostavení.
  const end = toDate(order.scheduled_end)
  if (order.offer_kind === 'B' && end && now.getTime() >= end.getTime()) return { available: false, reason: 'expired' }
  return { available: true, until }
}

// ─── Potvrzení odstoupení e-mailem (VOP 9.1 – trvalý nosič s datem a časem) ─────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

async function emailOf(db: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

function orderTitle(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || (order.offer_kind === 'B' ? 'Výjezd a nacenění' : 'Rezervace')
}

/**
 * Pošle zákazníkovi potvrzení odstoupení a poskytovateli oznámení e-mailem.
 * Když potvrzení zákazníkovi nedojde (výpadek e-mailu), cron to zkusí znovu (confirmation_sent_at je null).
 */
export async function sendWithdrawalEmails(db: Db, withdrawalId: string, notifyProvider: boolean): Promise<boolean> {
  const { data: w } = await db.from('withdrawals').select('id, order_id, customer_id, requested_at, confirmation_sent_at').eq('id', withdrawalId).maybeSingle()
  const row = w as { id: string; order_id: string; customer_id: string | null; requested_at: string; confirmation_sent_at: string | null } | null
  if (!row) return false
  const order = await loadBookingOrder(db, row.order_id)
  if (!order) return false

  const requestedAtText = datumCas(row.requested_at)
  const termText = order.scheduled_at ? terminDlouze(order.scheduled_at) : null
  const amountText = order.charge_halere ? `${(Number(order.charge_halere) / 100).toLocaleString('cs-CZ')} Kč` : null
  const orderUrl = `${APP_URL}/dashboard/objednavky/${order.id}`

  let sent = !!row.confirmation_sent_at
  if (!sent) {
    const { data: prov } = await db.from('profiles').select('full_name, company_name, ico').eq('id', order.provider_id).maybeSingle()
    const p = prov as { full_name: string | null; company_name: string | null; ico: string | null } | null
    const providerName = [p?.company_name || p?.full_name || 'Poskytovatel', p?.ico ? `IČO ${p.ico}` : null].filter(Boolean).join(', ')
    const email = await emailOf(db, row.customer_id ?? order.customer_id)
    if (email) {
      const mail = withdrawalConfirmationEmail({ serviceTitle: orderTitle(order), providerName, termText, requestedAtText, amountText, orderUrl })
      sent = await sendEmail(email, mail.subject, mail.html)
      if (sent) {
        await db.from('withdrawals').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', row.id)
        await logOrderEvent(db, order.id, 'withdrawal_confirmation_sent', { type: 'system' }, { withdrawal_id: row.id })
      }
    }
  }

  if (notifyProvider) {
    const providerEmail = await emailOf(db, order.provider_id)
    if (providerEmail) {
      const mail = withdrawalNoticeEmail({ serviceTitle: orderTitle(order), termText, requestedAtText, amountText, orderUrl })
      await sendEmail(providerEmail, mail.subject, mail.html)
    }
  }
  return sent
}

/** Cron: potvrzení odstoupení, která se nepodařilo odeslat */
export async function retryWithdrawalConfirmations(db: Db, now = new Date()): Promise<{ sent: number }> {
  const { data } = await db
    .from('withdrawals')
    .select('id')
    .is('confirmation_sent_at', null)
    .lt('requested_at', new Date(now.getTime() - 5 * 60_000).toISOString())
    .gt('requested_at', new Date(now.getTime() - 7 * 24 * 3600_000).toISOString())
    .limit(20)
  let sent = 0
  for (const w of (data ?? []) as Array<{ id: string }>) {
    if (await sendWithdrawalEmails(db, w.id, false)) sent++
  }
  return { sent }
}
