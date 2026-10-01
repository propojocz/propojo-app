// lib/booking/legacy.ts
// Odvozené zrcadlo starých sloupců orders.status / deposit_status / hold_expires_at.
//
// Nový tok řídí jen booking_state. Kalendář (free-times, slots, kontroly kolizí) a staré
// obrazovky ale obsazenost pořád počítají ze starých sloupců, takže je k booking_state
// dopisujeme. Používají se jen hodnoty, které už v DB existují. Zmizí s legacy logikou.

import type { BookingState } from './state'

export interface LegacyMirror {
  status: 'prijato' | 'zruseno' | 'cekajici'
  deposit_status: 'pending' | 'paid' | 'none'
  /** undefined = sloupec neměnit */
  hold_expires_at?: string | null
  /** Termín se uvolňuje (slot zpět mezi volné) */
  releasesSlot: boolean
  /** Návrat do domluvy: smazat nepotvrzený termín */
  clearsSchedule: boolean
}

export interface LegacyContext {
  /** Objednávka vznikla přímou rezervací okna / času (ne domluvou přes návrhy) */
  directBooking: boolean
  /** Do kdy drží rozpracovaný checkout termín (jen pro pending_payment) */
  holdUntil?: Date | null
  /** Platba byla opravdu stržena (capture proběhl, orders.confirmed_at) */
  captured?: boolean
}

export function legacyMirror(state: BookingState, ctx: LegacyContext): LegacyMirror {
  switch (state) {
    case 'pending_payment':
      return {
        status: 'prijato',
        deposit_status: 'pending',
        hold_expires_at: ctx.holdUntil ? ctx.holdUntil.toISOString() : undefined,
        releasesSlot: false,
        clearsSchedule: false,
      }
    // Předautorizováno: termín je obsazený natrvalo (bez holdu), peníze ještě nestrženy.
    case 'awaiting_confirmation':
    case 'capture_in_progress':
      return { status: 'prijato', deposit_status: 'pending', hold_expires_at: null, releasesSlot: false, clearsSchedule: false }
    case 'confirmed':
    case 'no_show_reported':
    case 'no_show_disputed':
      return { status: 'prijato', deposit_status: 'paid', hold_expires_at: null, releasesSlot: false, clearsSchedule: false }
    case 'payment_expired':
      // Jen z payment_expired vede cesta zpět (checkout_started) – domluvený termín se vrací do domluvy.
      return ctx.directBooking
        ? { status: 'zruseno', deposit_status: 'none', hold_expires_at: null, releasesSlot: true, clearsSchedule: false }
        : { status: 'cekajici', deposit_status: 'none', hold_expires_at: null, releasesSlot: true, clearsSchedule: true }
    case 'declined':
    case 'expired':
    case 'capture_failed':
      return { status: 'zruseno', deposit_status: 'none', hold_expires_at: null, releasesSlot: true, clearsSchedule: false }
    case 'cancelled':
      // Zrušit jde před platbou, před potvrzením i po něm. „paid“ jen když se opravdu strhlo;
      // stav vrácení peněz se sleduje v order_refunds, ne tady.
      return {
        status: 'zruseno',
        deposit_status: ctx.captured ? 'paid' : 'none',
        hold_expires_at: null,
        releasesSlot: true,
        clearsSchedule: false,
      }
  }
}
