// lib/booking/policy.ts
// Parametry rezervačního modelu Propojo (source of truth z 25. 9. 2026).
//
// Každá rezervace si při vzniku uloží snapshot těchto hodnot (orders.policy_version
// + orders.policy_snapshot). Změna parametrů tak platí jen pro nové rezervace
// a u existující rezervace se vždy rozhoduje podle pravidel, za kterých vznikla.
//
// Všechny částky jsou v haléřích (Stripe počítá CZK v nejmenší jednotce).

export type OfferKind = 'A' | 'B' | 'C'

export const OFFER_KINDS: readonly OfferKind[] = ['A', 'B', 'C']

export interface CommissionPolicy {
  /** Sazba v bazických bodech: 1000 = 10 % */
  rateBps: number
  /** Minimum provize bez DPH v haléřích */
  minBaseHalere: number
  /** Maximum provize bez DPH v haléřích (bez přirážky nad hranicí) */
  maxBaseHalere: number
  /** Přirážka z části platby nad hranicí – přičte se k provizi, strop se na ni nevztahuje */
  surcharge: {
    /** Hranice v haléřích (z částky do této výše se přirážka nepočítá) */
    thresholdHalere: number
    /** Sazba přirážky v bazických bodech: 200 = 2 % */
    rateBps: number
  }
  /** DPH v bazických bodech: 0 = neuplatňuje se, 2100 = 21 % */
  vatRateBps: number
}

export interface CustomerCancellationRule {
  /** Automatický refund jen před označením „Závazná nabídka předána“ */
  beforeOfferDelivered: boolean
  /** Automatický refund jen před začátkem termínu (pokud termín má konkrétní čas) */
  beforeWindowStart: boolean
  /** Automatický refund jen tehdy, když neexistuje validní check-in */
  requireNoValidCheckIn: boolean
}

export interface BookingPolicy {
  version: string
  currency: 'czk'
  /** Minimální placená částka (Rezervační poplatek / Cena výjezdu) */
  minChargeHalere: number
  /** Horní hranice ceny, kterou poskytovatel upraví u konkrétní objednávky (pojistka proti překlepu) */
  maxAgreedChargeHalere: number
  /** Minimální předstih rezervace před začátkem termínu (Stripe Checkout žije min. 30 min) */
  minLeadMinutes: number
  /** Platnost Stripe Checkout session (Stripe minimum je 30 min) */
  checkoutTtlMinutes: number
  /** Lhůta na potvrzení od preautorizace (vždy ale nejpozději do začátku termínu) */
  confirmationWindowHours: number
  /** Ruční potvrzení nejpozději tolik minut před začátkem termínu (rozhodnutí 6. 10. 2026: 2 h) */
  confirmBeforeStartMinutes: number
  /** …ale poskytovatel má od platby vždy aspoň tolik minut (last-minute rezervace) */
  minConfirmWindowMinutes: number
  /** Připomínka poskytovateli, že rezervace čeká na potvrzení (jednou) */
  confirmationReminder: {
    /** Pošle se, když do konce lhůty zbývá nejvýš tolik hodin */
    hoursBeforeDeadline: number
    /** …a od preautorizace uběhlo aspoň tolik hodin (ať nepřijde hned po oznámení o nové rezervaci) */
    minHoursAfterAuthorization: number
  }
  commission: CommissionPolicy
  /** Expirace návrhu „Původní termín nemohu dodržet“ (dřívější z této lhůty a začátku původního termínu) */
  cannotKeepExpiryHours: number
  providerNoShow: {
    appliesTo: readonly OfferKind[]
    /** Okno pro nahlášení po skončení rezervovaného okna */
    reportWindowHours: number
    /** Lhůta providera od odeslání systémové výzvy */
    responseHours: number
    /** Připomínka providerovi před koncem lhůty */
    reminderHoursBeforeDeadline: number
  }
  checkIn: {
    appliesTo: readonly OfferKind[]
    earliestMinutesBeforeStart: number
    maxDistanceM: number
    maxAccuracyM: number
  }
  customerCancellation: Record<OfferKind, CustomerCancellationRule>
  /** Model B: termín výjezdu je okno příjezdu (začátek–konec), ne délka prohlídky */
  arrivalWindow: {
    optionsMinutes: readonly number[]
    defaultMinutes: number
  }
}

export const BOOKING_POLICY: BookingPolicy = {
  version: '2026-10-06-v3',
  currency: 'czk',
  minChargeHalere: 20000, // 200 Kč
  maxAgreedChargeHalere: 2000000, // 20 000 Kč
  minLeadMinutes: 60, // parametr k potvrzení
  checkoutTtlMinutes: 30,
  confirmationWindowHours: 48,
  confirmBeforeStartMinutes: 120,
  minConfirmWindowMinutes: 30,
  confirmationReminder: { hoursBeforeDeadline: 12, minHoursAfterAuthorization: 2 },
  commission: {
    rateBps: 1000, // 10 %
    minBaseHalere: 2900, // 29 Kč
    maxBaseHalere: 8900, // 89 Kč
    // Rozhodnutí Mateje 4. 10. 2026: nad 3 000 Kč navíc 2 % z části nad hranicí (např. 5 450 Kč → 89 + 49 = 138 Kč)
    surcharge: { thresholdHalere: 300000, rateBps: 200 },
    vatRateBps: 0, // nastavit podle DPH statusu provozovatele (21 % = 2100)
  },
  cannotKeepExpiryHours: 24,
  providerNoShow: {
    appliesTo: ['A', 'B'],
    reportWindowHours: 48,
    responseHours: 72,
    reminderHoursBeforeDeadline: 24, // parametr k potvrzení
  },
  checkIn: {
    appliesTo: ['B'],
    earliestMinutesBeforeStart: 30,
    maxDistanceM: 500,
    maxAccuracyM: 200, // parametr k potvrzení
  },
  customerCancellation: {
    A: { beforeOfferDelivered: true, beforeWindowStart: true, requireNoValidCheckIn: false },
    B: { beforeOfferDelivered: false, beforeWindowStart: true, requireNoValidCheckIn: true },
    C: { beforeOfferDelivered: true, beforeWindowStart: true, requireNoValidCheckIn: false },
  },
  arrivalWindow: {
    optionsMinutes: [30, 60, 90, 120],
    defaultMinutes: 60,
  },
}

/** Hodnoty, které se ukládají k rezervaci (orders.policy_version + orders.policy_snapshot) */
export function policySnapshot(policy: BookingPolicy = BOOKING_POLICY): {
  version: string
  snapshot: BookingPolicy
} {
  return { version: policy.version, snapshot: JSON.parse(JSON.stringify(policy)) as BookingPolicy }
}

/** Načte snapshot uložený u rezervace; když chybí, použije aktuální pravidla */
export function policyFromSnapshot(snapshot: unknown): BookingPolicy {
  if (snapshot && typeof snapshot === 'object' && 'version' in snapshot) {
    return snapshot as BookingPolicy
  }
  return BOOKING_POLICY
}
