// lib/booking/labels.ts
// Štítek stavu objednávky pro seznamy a hlavičky. U nového modelu se řídí booking_state:
// „Potvrzeno“ jen po úspěšném stržení platby, nikdy dřív (CLAUDE.md, vrstva 3).
// Vrací null u staré objednávky – pak se použije původní štítek podle orders.status.

export type StatusBadge = { label: string; cls: string }

const AMBER = 'bg-amber-100 text-amber-700'
const GREEN = 'bg-emerald-100 text-emerald-700'
const GREY = 'bg-slate-100 text-slate-500'
const RED = 'bg-rose-100 text-rose-700'

export function bookingStatusBadge(order: {
  status: string
  booking_state?: string | null
  offer_kind?: string | null
}): StatusBadge | null {
  const s = order.booking_state ?? null
  if (s === null) {
    // Rezervace nového modelu před otevřením platby (držený termín / přijatý návrh)
    if (order.offer_kind && order.status === 'prijato') return { label: 'Čeká na platbu', cls: AMBER }
    return null
  }
  switch (s) {
    case 'pending_payment':
      return { label: 'Čeká na platbu', cls: AMBER }
    case 'awaiting_confirmation':
    case 'capture_in_progress':
      return { label: 'Čeká na potvrzení', cls: AMBER }
    case 'confirmed':
      return { label: 'Potvrzeno', cls: GREEN }
    case 'payment_expired':
      return order.status === 'cekajici'
        ? { label: 'Domlouvá se termín', cls: AMBER }
        : { label: 'Platba vypršela', cls: GREY }
    case 'declined':
    case 'expired':
    case 'capture_failed':
      return { label: 'Nepotvrzeno', cls: GREY }
    case 'cancelled':
      return { label: 'Zrušeno', cls: GREY }
    case 'no_show_reported':
    case 'no_show_disputed':
      return { label: 'Řeší se nedostavení', cls: RED }
    default:
      return null
  }
}
