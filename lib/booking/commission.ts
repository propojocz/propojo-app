// lib/booking/commission.ts
// Provize Propojo = application fee ve Stripe.
// 10 % z Rezervačního poplatku / Ceny výjezdu, minimum 29 Kč, maximum 89 Kč (bez DPH),
// k tomu přirážka 2 % z části platby nad 3 000 Kč (bez stropu);
// pokud se DPH uplatní, připočte se. Nikdy se nepočítá z ceny Hlavní smlouvy.
// Vše v celých haléřích, zaokrouhlení matematicky (0,5 nahoru).

import { BOOKING_POLICY, OFFER_KINDS, type BookingPolicy, type CommissionPolicy, type OfferKind } from './policy'

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
  const capped = Math.min(commission.maxBaseHalere, Math.max(commission.minBaseHalere, raw))
  // Přirážka jen z části nad hranicí – provize roste plynule, bez skoku na hranici.
  const over = Math.max(0, chargeHalere - commission.surcharge.thresholdHalere)
  const baseHalere = capped + applyBps(over, commission.surcharge.rateBps)
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

// ─── Placená částka rezervace ─────────────────────────────────────────────

/** Položka (service_items), ze které se bere Rezervační poplatek / Cena výjezdu */
export interface ChargeableItem {
  offer_kind: string | null
  /** Rezervační poplatek (A, C) v Kč */
  deposit_amount: number | string | null
  /** Cena výjezdu (B) v Kč */
  quote_fee: number | string | null
  deposit_type?: string | null
  /** Cena upravená poskytovatelem u konkrétní objednávky a přijatá zákazníkem (v haléřích); má přednost */
  agreed_charge_halere?: number | null
}

export type BookingChargeResult =
  | { ok: true; offerKind: OfferKind; commission: CommissionBreakdown }
  | { ok: false; error: string }

/** Cena z nabídky (bez úpravy u objednávky) v Kč, nebo null */
export function itemPriceKc(item: Pick<ChargeableItem, 'offer_kind' | 'deposit_amount' | 'quote_fee'>): number | null {
  const kc = Number(item.offer_kind === 'B' ? item.quote_fee : item.deposit_amount)
  return Number.isFinite(kc) && kc > 0 ? kc : null
}

export function isOfferKind(value: unknown): value is OfferKind {
  return typeof value === 'string' && (OFFER_KINDS as readonly string[]).includes(value)
}

/**
 * Kolik se předautorizuje: A a C Rezervační poplatek, B Cena výjezdu (včetně dopravy).
 * Nikdy plná cena, kusy × cena ani konečná cena Hlavní smlouvy.
 */
export function bookingCharge(item: ChargeableItem, policy: BookingPolicy = BOOKING_POLICY): BookingChargeResult {
  if (!isOfferKind(item.offer_kind)) {
    return { ok: false, error: 'Tuto položku nelze v novém modelu rezervovat.' }
  }
  if (item.deposit_type === 'plna_platba') {
    return { ok: false, error: 'Tuto položku nelze v novém modelu rezervovat (platba celé ceny předem už není možná).' }
  }
  const agreed = item.agreed_charge_halere != null ? Number(item.agreed_charge_halere) : null
  if (agreed != null) {
    if (!Number.isInteger(agreed) || agreed > policy.maxAgreedChargeHalere) {
      return { ok: false, error: 'Upravená cena není platná.' }
    }
    const result = computeCommission(agreed, policy.commission, policy.minChargeHalere)
    if (!result.ok) return result
    return { ok: true, offerKind: item.offer_kind, commission: result.commission }
  }
  const kc = Number(item.offer_kind === 'B' ? item.quote_fee : item.deposit_amount)
  if (!Number.isFinite(kc) || kc <= 0) {
    return {
      ok: false,
      error: item.offer_kind === 'B'
        ? 'U této položky není nastavená Cena výjezdu.'
        : 'U této položky není nastavený Rezervační poplatek.',
    }
  }
  const result = computeCommission(Math.round(kc * 100), policy.commission, policy.minChargeHalere)
  if (!result.ok) return result
  return { ok: true, offerKind: item.offer_kind, commission: result.commission }
}
