// lib/booking/rules.ts
// Pravidla, podle kterých se hýbou peníze. Čisté funkce: dostanou fakta, vrátí rozhodnutí.
// Volající (server action, webhook, plánovač) podle výsledku zavolá Stripe a zapíše stav.
//
// Zásady:
// - Propojo nikdy nerozhoduje, kdo má pravdu. Rozhodují jen předem definované systémové události.
// - Automatický refund z účtu providera jde jen ve spouštěčích, které pokrývá jeho pokyn (consents).
// - Stav refundu se vždy bere ze Stripe, ne z vlastního předpokladu.

import { BOOKING_POLICY, type BookingPolicy, type OfferKind } from './policy'
import { earliestBookableStart, noShowReportWindow, type BookingEvent, type BookingState } from './state'

// ─── Okno rezervace ───────────────────────────────────────────────────────

export type BookingWindowIssue = 'no_window' | 'invalid_window' | 'too_soon'

/**
 * Každá rezervace má začátek i konec okna (no-show i check-in počítají s koncem)
 * a začíná aspoň minLeadMinutes od teď – jinak by preautorizace mohla dorazit až po začátku.
 */
export function bookingWindowIssue(
  start: Date | null,
  end: Date | null,
  now: Date,
  policy: BookingPolicy = BOOKING_POLICY,
): BookingWindowIssue | null {
  if (start === null || end === null) return 'no_window'
  if (end.getTime() <= start.getTime()) return 'invalid_window'
  if (start.getTime() < earliestBookableStart(now, policy).getTime()) return 'too_soon'
  return null
}

export function bookingWindowMessage(issue: BookingWindowIssue, policy: BookingPolicy = BOOKING_POLICY): string {
  switch (issue) {
    case 'no_window':
      return 'Nejdřív musí být domluvený termín (začátek i konec).'
    case 'invalid_window':
      return 'Termín má neplatný konec.'
    case 'too_soon':
      return `Termín musí začínat nejdříve za ${policy.minLeadMinutes} minut. Vyberte prosím pozdější čas.`
  }
}

// ─── Obsazenost kalendáře ─────────────────────────────────────────────────

/**
 * Nová rezervace ukládá do scheduled_end konec rezervovaného okna (bez pauzy).
 * Kalendář ale za ní musí držet i pauzu úkonu, proto se u nového toku přičítá.
 * U staré objednávky už scheduled_end pauzu obsahuje nebo se počítá postaru.
 */
export function bookingBufferMs(order: {
  booking_state?: string | null
  offer_kind?: string | null
  service_items?: { buffer_minutes?: number | null } | null
}): number {
  // Nová rezervace má offer_kind od založení, booking_state až od otevření platby.
  if (!order.booking_state && !order.offer_kind) return 0
  const buf = Number(order.service_items?.buffer_minutes ?? 0)
  return buf > 0 ? buf * 60_000 : 0
}

// ─── Automatické refundy a pokyn providera ────────────────────────────────

export const AUTO_REFUND_TRIGGERS = [
  'provider_cancelled',
  'reschedule_rejected',
  'reschedule_expired',
  'no_show_agreed',
  'no_show_no_response',
  'customer_cancelled', // jen před hranicí podle customerCancellationOutcome
] as const

export type AutoRefundTrigger = (typeof AUTO_REFUND_TRIGGERS)[number]

/**
 * Rozsah pokynu, který provider výslovně odsouhlasí při onboardingu.
 * Ukládá se do consents spolu s verzí VOP; engine refund nespustí mimo odsouhlasený rozsah.
 */
export const PROVIDER_INSTRUCTION_SCOPE: readonly AutoRefundTrigger[] = AUTO_REFUND_TRIGGERS

export const CONSENT_KINDS = [
  'provider_auto_refund_instruction',
  'customer_early_performance_request',
] as const

export type ConsentKind = (typeof CONSENT_KINDS)[number]

export function isAutoRefundTrigger(event: BookingEvent): event is AutoRefundTrigger {
  return (AUTO_REFUND_TRIGGERS as readonly string[]).includes(event)
}

export interface PaymentFacts {
  captured: boolean
  chargeHalere: number
  /** Ze Stripe: charge.amount_refunded */
  refundedHalere: number
  /** Existuje refund ve stavu requested / pending / requires_action */
  refundInFlight: boolean
  /** Status Stripe dispute, pokud existuje */
  disputeStatus: string | null
}

export type RefundDecision =
  | { action: 'refund'; amountHalere: number }
  | { action: 'release_authorization' }
  | { action: 'skip'; reason: 'not_covered_by_instruction' | 'disputed' | 'in_flight' | 'nothing_left' }

// U formálního sporu Stripe refund nedovolí (charge_disputed); u dotazu (warning_*) ano.
const DISPUTE_BLOCKING_STATUSES = ['needs_response', 'under_review', 'lost']

export function disputeBlocksRefund(disputeStatus: string | null): boolean {
  return disputeStatus !== null && DISPUTE_BLOCKING_STATUSES.includes(disputeStatus)
}

/**
 * Co udělat s penězi při automatickém spouštěči.
 * Full refund = celá dosud nevrácená částka (provider mohl část vrátit sám ve Stripe).
 */
export function decideAutoRefund(
  trigger: AutoRefundTrigger,
  payment: PaymentFacts,
  instructionScope: readonly AutoRefundTrigger[],
): RefundDecision {
  // Nestrženou preautorizaci jen uvolníme; z účtu providera se nic nevrací.
  if (!payment.captured) return { action: 'release_authorization' }
  if (!instructionScope.includes(trigger)) return { action: 'skip', reason: 'not_covered_by_instruction' }
  if (disputeBlocksRefund(payment.disputeStatus)) return { action: 'skip', reason: 'disputed' }
  if (payment.refundInFlight) return { action: 'skip', reason: 'in_flight' }
  const remaining = payment.chargeHalere - payment.refundedHalere
  if (remaining <= 0) return { action: 'skip', reason: 'nothing_left' }
  return { action: 'refund', amountHalere: remaining }
}

// ─── Stav refundu ─────────────────────────────────────────────────────────

export const REFUND_STATUSES = [
  'requested', // záznam u nás, Stripe refund ještě nevznikl (nebo volání selhalo a čeká na opakování)
  'pending',
  'requires_action',
  'succeeded',
  'failed',
  'canceled',
] as const

export type RefundStatus = (typeof REFUND_STATUSES)[number]

export function fromStripeRefundStatus(status: string | null | undefined): RefundStatus {
  switch (status) {
    case 'pending':
    case 'requires_action':
    case 'succeeded':
    case 'failed':
    case 'canceled':
      return status
    default:
      return 'requested'
  }
}

export function isRefundInFlight(status: RefundStatus): boolean {
  return status === 'requested' || status === 'pending' || status === 'requires_action'
}

export const REFUND_STATUS_TEXT: Record<RefundStatus, string> = {
  requested: 'Vrácení peněz bylo zahájeno.',
  pending: 'Vrácení peněz bylo zahájeno.',
  requires_action: 'Vrácení peněz bylo zahájeno.',
  succeeded: 'Refund byl úspěšně zpracován; banka může částku připsat až za několik pracovních dnů.',
  failed: 'Vrácení peněz se nezdařilo.',
  canceled: 'Vrácení peněz bylo zrušeno.',
}

// ─── Zrušení zákazníkem ───────────────────────────────────────────────────

export interface CustomerCancellationContext {
  offerKind: OfferKind
  state: BookingState
  now: Date
  windowStart: Date | null
  offerDeliveredAt: Date | null
  hasValidCheckIn: boolean
}

export type CustomerCancellationOutcome =
  | { allowed: false }
  | { allowed: true; money: 'release_authorization' }
  | { allowed: true; money: 'auto_refund' }
  | { allowed: true; money: 'no_auto_refund'; reason: 'offer_delivered' | 'window_started' | 'valid_check_in' | 'no_window' }

export function customerCancellationOutcome(
  ctx: CustomerCancellationContext,
  policy: BookingPolicy = BOOKING_POLICY,
): CustomerCancellationOutcome {
  if (ctx.state === 'awaiting_confirmation') return { allowed: true, money: 'release_authorization' }
  if (ctx.state !== 'confirmed') return { allowed: false }

  const rule = policy.customerCancellation[ctx.offerKind]

  if (rule.beforeOfferDelivered && ctx.offerDeliveredAt !== null) {
    return { allowed: true, money: 'no_auto_refund', reason: 'offer_delivered' }
  }
  if (rule.beforeWindowStart) {
    // Model B má termín vždy; bez něj hranici nelze ověřit, takže bez automatického refundu.
    if (ctx.windowStart === null) {
      if (ctx.offerKind === 'B') return { allowed: true, money: 'no_auto_refund', reason: 'no_window' }
    } else if (ctx.now.getTime() >= ctx.windowStart.getTime()) {
      return { allowed: true, money: 'no_auto_refund', reason: 'window_started' }
    }
  }
  if (rule.requireNoValidCheckIn && ctx.hasValidCheckIn) {
    return { allowed: true, money: 'no_auto_refund', reason: 'valid_check_in' }
  }
  return { allowed: true, money: 'auto_refund' }
}

// ─── Nedostavení providera ────────────────────────────────────────────────

export interface NoShowReportContext {
  offerKind: OfferKind
  state: BookingState
  now: Date
  windowEnd: Date | null
  alreadyReported: boolean
}

export type NoShowReportCheck =
  | { allowed: true }
  | { allowed: false; reason: 'not_applicable' | 'state' | 'no_window' | 'too_early' | 'too_late' | 'already_reported' }

export function canReportProviderNoShow(
  ctx: NoShowReportContext,
  policy: BookingPolicy = BOOKING_POLICY,
): NoShowReportCheck {
  if (!policy.providerNoShow.appliesTo.includes(ctx.offerKind)) return { allowed: false, reason: 'not_applicable' }
  if (ctx.alreadyReported) return { allowed: false, reason: 'already_reported' }
  if (ctx.state !== 'confirmed') return { allowed: false, reason: 'state' }
  if (ctx.windowEnd === null) return { allowed: false, reason: 'no_window' }
  const { opensAt, closesAt } = noShowReportWindow(ctx.windowEnd, policy)
  if (ctx.now.getTime() < opensAt.getTime()) return { allowed: false, reason: 'too_early' }
  if (ctx.now.getTime() > closesAt.getTime()) return { allowed: false, reason: 'too_late' }
  return { allowed: true }
}

/**
 * Provider na výzvu nereagoval. U Modelu B s validním check-inem před reportem
 * existují dva protichůdné systémové záznamy → peníze se nehýbou.
 */
export function noShowNoResponseOutcome(ctx: {
  offerKind: OfferKind
  reportedAt: Date
  validCheckInAt: Date | null
}): 'no_show_no_response' | 'no_show_conflict' {
  if (
    ctx.offerKind === 'B' &&
    ctx.validCheckInAt !== null &&
    ctx.validCheckInAt.getTime() < ctx.reportedAt.getTime()
  ) {
    return 'no_show_conflict'
  }
  return 'no_show_no_response'
}

// ─── Změna termínu ────────────────────────────────────────────────────────

export type RescheduleKind = 'alternative' | 'cannot_keep_original'
export type RescheduleResolution = 'accepted' | 'rejected' | 'expired'

/** Událost pro stav rezervace; null = nic se nemění (u alternativy platí původní termín) */
export function rescheduleEvent(kind: RescheduleKind, resolution: RescheduleResolution): BookingEvent | null {
  if (resolution === 'accepted') return 'reschedule_accepted'
  if (kind === 'alternative') return null
  return resolution === 'rejected' ? 'reschedule_rejected' : 'reschedule_expired'
}

// ─── Check-in (Model B) ───────────────────────────────────────────────────

export type CheckInIssue =
  | 'not_applicable'
  | 'outside_time_window'
  | 'no_location'
  | 'low_accuracy'
  | 'no_target_address'
  | 'too_far'

export interface CheckInInput {
  offerKind: OfferKind
  windowStart: Date
  windowEnd: Date
  /** Čas přijetí na serveru, nikdy čas z prohlížeče */
  recordedAt: Date
  permission: 'granted' | 'denied' | 'unavailable'
  lat: number | null
  lng: number | null
  accuracyM: number | null
  /** Souřadnice přesné adresy zákazníka */
  targetLat: number | null
  targetLng: number | null
}

export interface CheckInEvaluation {
  valid: boolean
  issues: CheckInIssue[]
  distanceM: number | null
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Validní check-in = systémový záznam splňující kritéria, ne důkaz přítomnosti.
 * Neověřený check-in se eviduje, ale nesmí blokovat automatický refund.
 */
export function evaluateCheckIn(input: CheckInInput, policy: BookingPolicy = BOOKING_POLICY): CheckInEvaluation {
  if (!policy.checkIn.appliesTo.includes(input.offerKind)) {
    return { valid: false, issues: ['not_applicable'], distanceM: null }
  }

  const issues: CheckInIssue[] = []
  const earliest = input.windowStart.getTime() - policy.checkIn.earliestMinutesBeforeStart * 60 * 1000
  const at = input.recordedAt.getTime()
  if (at < earliest || at > input.windowEnd.getTime()) issues.push('outside_time_window')

  const hasPosition = input.permission === 'granted' && input.lat !== null && input.lng !== null
  if (!hasPosition) issues.push('no_location')
  if (hasPosition && (input.accuracyM === null || input.accuracyM > policy.checkIn.maxAccuracyM)) {
    issues.push('low_accuracy')
  }

  const hasTarget = input.targetLat !== null && input.targetLng !== null
  if (!hasTarget) issues.push('no_target_address')

  let distanceM: number | null = null
  if (hasPosition && hasTarget) {
    distanceM = Math.round(
      distanceMeters(input.lat as number, input.lng as number, input.targetLat as number, input.targetLng as number),
    )
    if (distanceM > policy.checkIn.maxDistanceM) issues.push('too_far')
  }

  return { valid: issues.length === 0, issues, distanceM }
}

// ─── Otevřená rezervace (povinnost ponechat Stripe účet funkční) ─────────

export interface OpenCheckContext {
  offerKind: OfferKind
  state: BookingState
  now: Date
  windowStart: Date | null
  windowEnd: Date | null
  offerDeliveredAt: Date | null
  openRescheduleExpiresAt: Date | null
  refundInFlight: boolean
}

/** Otevřená = systém ještě může automaticky pohnout penězi nebo běží refund */
export function isBookingOpen(ctx: OpenCheckContext, policy: BookingPolicy = BOOKING_POLICY): boolean {
  if (ctx.refundInFlight) return true
  if (
    ctx.state === 'pending_payment' ||
    ctx.state === 'awaiting_confirmation' ||
    ctx.state === 'capture_in_progress' ||
    ctx.state === 'no_show_reported'
  ) {
    return true
  }
  if (ctx.state !== 'confirmed') return false

  const now = ctx.now.getTime()
  if (ctx.openRescheduleExpiresAt && now < ctx.openRescheduleExpiresAt.getTime()) return true

  if (policy.providerNoShow.appliesTo.includes(ctx.offerKind)) {
    if (ctx.windowEnd === null) return true
    return now <= noShowReportWindow(ctx.windowEnd, policy).closesAt.getTime()
  }

  // Model C: otevřená, dokud může zákazník zrušit s automatickým refundem
  if (ctx.offerDeliveredAt !== null) return false
  return ctx.windowStart === null || now < ctx.windowStart.getTime()
}

// ─── Stripe účet providera ────────────────────────────────────────────────

export interface StripeAccountFacts {
  accountId: string | null
  accountType: string | null
  deauthorizedAt: Date | null
  chargesEnabled: boolean
  cardPayments: string | null
}

export type AccountBlock =
  | 'not_connected'
  | 'not_standard'
  | 'deauthorized'
  | 'charges_disabled'
  | 'card_payments_inactive'

/** Prázdné pole = provider může přijímat nové rezervace */
export function accountBlocks(facts: StripeAccountFacts): AccountBlock[] {
  if (!facts.accountId) return ['not_connected']
  const blocks: AccountBlock[] = []
  if (facts.accountType !== 'standard') blocks.push('not_standard')
  if (facts.deauthorizedAt !== null) blocks.push('deauthorized')
  if (!facts.chargesEnabled) blocks.push('charges_disabled')
  if (facts.cardPayments !== 'active') blocks.push('card_payments_inactive')
  return blocks
}
