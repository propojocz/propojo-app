// lib/booking/state.ts
// Stavy rezervace, povolené přechody a výpočty lhůt. Čisté funkce bez DB a Stripe.
//
// orders.booking_state je nový sloupec a jediný zdroj pravdy pro nový tok; stará objednávka
// ho má prázdný. Kalendář a staré obrazovky ale dál čtou status / deposit_status /
// hold_expires_at, proto nový tok k booking_state zapisuje i jejich odvozené zrcadlo
// (lib/booking/legacy.ts). Zrcadlo zmizí s odstraněním legacy logiky.

import { BOOKING_POLICY, type BookingPolicy } from './policy'

export const BOOKING_STATES = [
  'pending_payment', // objednávka založena, zákazník je ve Stripe Checkoutu, termín je držen
  'payment_expired', // Checkout vypršel nebo ho zákazník opustil, termín uvolněn
  'awaiting_confirmation', // preautorizace hotová, běží lhůta na potvrzení
  'capture_in_progress', // provider potvrdil, probíhá capture (zámek proti souběhu)
  'confirmed', // capture úspěšný = Rezervační smlouva vznikla, provize stržena
  'capture_failed', // capture selhal = rezervace není potvrzená
  'declined', // provider odmítl před potvrzením, preautorizace uvolněna
  'expired', // lhůta na potvrzení uplynula, preautorizace uvolněna
  'cancelled', // zrušeno, důvod v cancel_reason
  'no_show_reported', // zákazník nahlásil nedostavení, běží lhůta na reakci providera
  'no_show_disputed', // zaznamenán rozpor, peníze se automaticky nehýbou
] as const

export type BookingState = (typeof BOOKING_STATES)[number]

export const TERMINAL_STATES: readonly BookingState[] = [
  'payment_expired',
  'capture_failed',
  'declined',
  'expired',
  'cancelled',
  'no_show_disputed',
]

export const CANCEL_REASONS = [
  'customer_cancelled',
  'provider_cancelled',
  'reschedule_rejected',
  'reschedule_expired',
  'no_show_agreed',
  'no_show_no_response',
] as const

export type CancelReason = (typeof CANCEL_REASONS)[number]

export const BOOKING_EVENTS = [
  'checkout_started', // zákazník otevřel Stripe Checkout (i opakovaný pokus)
  'checkout_expired', // Checkout vypršel / zákazník odešel
  'authorized', // preautorizace hotová (PaymentIntent requires_capture)
  'confirm_started', // provider klikl Potvrdit, jde se na capture
  'capture_succeeded',
  'capture_failed',
  'capture_reset', // obnova po pádu uprostřed capture (PaymentIntent je pořád requires_capture)
  'external_capture', // provider strhl platbu ve Stripe Dashboardu = potvrzení
  'external_cancel', // provider zrušil preautorizaci ve Stripe Dashboardu = odmítnutí
  'authorization_lapsed', // autorizace vypršela sama (např. po odpojení účtu)
  'provider_declined',
  'confirmation_expired',
  'customer_cancelled',
  'provider_cancelled',
  'reschedule_accepted',
  'reschedule_rejected', // jen u „Původní termín nemohu dodržet“
  'reschedule_expired', // jen u „Původní termín nemohu dodržet“
  'no_show_reported',
  'no_show_agreed',
  'no_show_disputed',
  'no_show_no_response',
  'no_show_conflict', // provider nereagoval, ale existuje validní check-in před reportem
] as const

export type BookingEvent = (typeof BOOKING_EVENTS)[number]

type TransitionTable = { [S in BookingState]?: { [E in BookingEvent]?: BookingState } }

// Objednávka bez booking_state (domluva, stará objednávka) může vstoupit jen založením checkoutu.
const INITIAL_TRANSITIONS: { [E in BookingEvent]?: BookingState } = {
  checkout_started: 'pending_payment',
}

const TRANSITIONS: TransitionTable = {
  pending_payment: {
    checkout_started: 'pending_payment',
    checkout_expired: 'payment_expired',
    authorized: 'awaiting_confirmation',
  },
  // Jen domluvený termín se po vypršení vrací do domluvy a jde zaplatit znovu.
  payment_expired: {
    checkout_started: 'pending_payment',
  },
  awaiting_confirmation: {
    confirm_started: 'capture_in_progress',
    external_capture: 'confirmed',
    provider_declined: 'declined',
    external_cancel: 'declined',
    confirmation_expired: 'expired',
    authorization_lapsed: 'expired',
    customer_cancelled: 'cancelled',
  },
  capture_in_progress: {
    capture_succeeded: 'confirmed',
    external_capture: 'confirmed',
    capture_failed: 'capture_failed',
    capture_reset: 'awaiting_confirmation',
  },
  confirmed: {
    provider_cancelled: 'cancelled',
    customer_cancelled: 'cancelled',
    reschedule_accepted: 'confirmed',
    reschedule_rejected: 'cancelled',
    reschedule_expired: 'cancelled',
    no_show_reported: 'no_show_reported',
  },
  no_show_reported: {
    no_show_agreed: 'cancelled',
    no_show_no_response: 'cancelled',
    no_show_disputed: 'no_show_disputed',
    no_show_conflict: 'no_show_disputed',
  },
}

const CANCEL_REASON_BY_EVENT: { [E in BookingEvent]?: CancelReason } = {
  customer_cancelled: 'customer_cancelled',
  provider_cancelled: 'provider_cancelled',
  reschedule_rejected: 'reschedule_rejected',
  reschedule_expired: 'reschedule_expired',
  no_show_agreed: 'no_show_agreed',
  no_show_no_response: 'no_show_no_response',
}

export type TransitionResult =
  | { ok: true; next: BookingState; cancelReason: CancelReason | null }
  | { ok: false }

/** Vrátí nový stav, nebo ok:false, pokud přechod není povolený (např. duplicitní webhook) */
export function transition(state: BookingState | null, event: BookingEvent): TransitionResult {
  const next = state === null ? INITIAL_TRANSITIONS[event] : TRANSITIONS[state]?.[event]
  if (!next) return { ok: false }
  return { ok: true, next, cancelReason: CANCEL_REASON_BY_EVENT[event] ?? null }
}

export function isTerminal(state: BookingState): boolean {
  return TERMINAL_STATES.includes(state)
}

export function isBookingState(value: unknown): value is BookingState {
  return typeof value === 'string' && (BOOKING_STATES as readonly string[]).includes(value)
}

/** Supabase vrací timestamptz jako text */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

function earlier(a: Date, b: Date | null): Date {
  return b && b.getTime() < a.getTime() ? b : a
}

/** Nejzazší okamžik potvrzení: 48 h od preautorizace, vždy ale nejpozději začátek termínu */
export function confirmationDeadline(
  authorizedAt: Date,
  windowStart: Date | null,
  policy: BookingPolicy = BOOKING_POLICY,
): Date {
  return earlier(new Date(authorizedAt.getTime() + policy.confirmationWindowHours * HOUR), windowStart)
}

/** Preautorizace dorazila v době, kdy už potvrdit nejde (termín začal) → okamžitě uvolnit */
export function isAuthorizationTooLate(authorizedAt: Date, windowStart: Date | null): boolean {
  return windowStart !== null && authorizedAt.getTime() >= windowStart.getTime()
}

/** Nejdřívější začátek termínu, který jde v tuto chvíli rezervovat */
export function earliestBookableStart(now: Date, policy: BookingPolicy = BOOKING_POLICY): Date {
  return new Date(now.getTime() + policy.minLeadMinutes * MINUTE)
}

/** Expirace návrhu „Původní termín nemohu dodržet“: dřívější z 24 h od návrhu a začátku původního termínu */
export function cannotKeepExpiry(
  proposedAt: Date,
  originalWindowStart: Date | null,
  policy: BookingPolicy = BOOKING_POLICY,
): Date {
  return earlier(new Date(proposedAt.getTime() + policy.cannotKeepExpiryHours * HOUR), originalWindowStart)
}

/** Okno, ve kterém zákazník může nahlásit nedostavení providera */
export function noShowReportWindow(
  windowEnd: Date,
  policy: BookingPolicy = BOOKING_POLICY,
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: windowEnd,
    closesAt: new Date(windowEnd.getTime() + policy.providerNoShow.reportWindowHours * HOUR),
  }
}

/** Lhůta providera na reakci (běží od odeslání systémové výzvy) a čas připomínky */
export function noShowResponseDeadline(
  noticeSentAt: Date,
  policy: BookingPolicy = BOOKING_POLICY,
): { deadline: Date; remindAt: Date } {
  const deadline = new Date(noticeSentAt.getTime() + policy.providerNoShow.responseHours * HOUR)
  const remind = deadline.getTime() - policy.providerNoShow.reminderHoursBeforeDeadline * HOUR
  return { deadline, remindAt: new Date(Math.max(remind, noticeSentAt.getTime())) }
}

/** Typy záznamů v logu událostí (orders → order_events); slouží jako evidence */
export const ORDER_EVENT_TYPES = [
  'booking_created', // payload.direct = přímá rezervace času / okna (ne domluva přes návrhy)
  'state_changed',
  'authorization_released', // preautorizace zrušena (payload.reason)
  'stripe_event',
  'provider_instruction_consent',
  'early_performance_request',
  'brief_submitted',
  'offer_delivered',
  'quote_proof_uploaded',
  'check_in_recorded',
  'reschedule_proposed',
  'reschedule_resolved',
  'no_show_reported',
  'no_show_notice_sent',
  'no_show_reminder_sent',
  'provider_responded',
  'refund_triggered',
  'refund_skipped',
  'withdrawal_requested',
  'withdrawal_confirmation_sent',
] as const

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number]
