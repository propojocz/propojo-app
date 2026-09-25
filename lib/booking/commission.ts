// lib/booking/commission.ts
// Provize Propojo = application fee ve Stripe.
// 10 % z Rezervačního poplatku / Ceny výjezdu, minimum 29 Kč, maximum 89 Kč (bez DPH);
// pokud se DPH uplatní, připočte se. Nikdy se nepočítá z ceny Hlavní smlouvy.
// Vše v celých haléřích, zaokrouhlení matematicky (0,5 nahoru).

import { BOOKING_POLICY, type CommissionPolicy } from './policy'

export interface CommissionBreakdown {
  chargeHalere: number
  /** Provize bez DPH */
  baseHalere: number
  vatRateBps: number
  vatHalere: number
  /** Částka pro Stripe application_fee_amount (provize + DPH) */
  applicationFeeHalere: number
}

export type CommissionResult =
  | { ok: true; commission: CommissionBreakdown }
  | { ok: false; error: string }

/** a × bps / 10 000, zaokrouhleno na celé haléře (0,5 nahoru) */
function applyBps(amountHalere: number, bps: number): number {
  return Math.floor((amountHalere * bps + 5000) / 10000)
}

export function computeCommission(
  chargeHalere: number,
  commission: CommissionPolicy = BOOKING_POLICY.commission,
  minChargeHalere: number = BOOKING_POLICY.minChargeHalere,
): CommissionResult {
  if (!Number.isInteger(chargeHalere) || chargeHalere <= 0) {
    return { ok: false, error: 'Částka musí být kladná a v celých haléřích.' }
  }
  if (chargeHalere < minChargeHalere) {
    return { ok: false, error: `Minimální placená částka je ${minChargeHalere / 100} Kč.` }
  }

  const raw = applyBps(chargeHalere, commission.rateBps)
  const baseHalere = Math.min(commission.maxBaseHalere, Math.max(commission.minBaseHalere, raw))
  const vatHalere = applyBps(baseHalere, commission.vatRateBps)
  const applicationFeeHalere = baseHalere + vatHalere

  if (applicationFeeHalere >= chargeHalere) {
    return { ok: false, error: 'Provize nesmí dosáhnout placené částky.' }
  }

  return {
    ok: true,
    commission: {
      chargeHalere,
      baseHalere,
      vatRateBps: commission.vatRateBps,
      vatHalere,
      applicationFeeHalere,
    },
  }
}
