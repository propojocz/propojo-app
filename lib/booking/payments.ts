// lib/booking/payments.ts
// Model v2: Stripe Connect Standard + Direct Charges + manual capture.
// Jediné místo, kde nový tok volá Stripe a mění booking_state. Jen pro server
// (server actions, webhooky, cron) – obsahuje service role a Stripe secret.
//
// Peníze nikdy neleží na Propoju: Checkout i PaymentIntent vznikají přímo na Standard
// účtu providera ({ stripeAccount }), Propojo si bere jen application fee při capture.
// Stav plateb se bere ze Stripe (webhook z připojených účtů), ne z vlastního předpokladu.

import type Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { prazskyMesic, terminDlouze } from '@/lib/format'
import { releaseSlotAndMerge } from '@/lib/slot-merge'
import { claimMatchingAvailabilitySlot } from '@/lib/slot-claim'
import { createNotification } from '@/lib/actions/notifications'
import { BOOKING_POLICY, policyFromSnapshot, type OfferKind } from './policy'
import { bookingCharge, type ChargeableItem, type CommissionBreakdown } from './commission'
import { legacyMirror } from './legacy'
import { isPlaceKnown, type KnownPlace } from '@/lib/geo'
import {
  confirmationDeadline,
  isAuthorizationTooLate,
  transition,
  toDate,
  type BookingEvent,
  type BookingState,
  type OrderEventType,
} from './state'
import {
  accountBlocks,
  bookingWindowIssue,
  bookingWindowMessage,
  fromStripeRefundStatus,
  type AccountBlock,
} from './rules'

export const BOOKING_KIND = 'booking_v2'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type Db = ReturnType<typeof adminDb>

type Actor = { type: 'customer' | 'provider' | 'system' | 'stripe' | 'admin'; id?: string | null }

// ─── Objednávka ───────────────────────────────────────────────────────────

export const BOOKING_ORDER_COLUMNS =
  'id, booking_state, customer_id, provider_id, slot_id, service_id, service_item_id, status, ' +
  'scheduled_at, scheduled_end, offer_kind, stripe_account_id, stripe_payment_intent_id, ' +
  'stripe_checkout_session_id, stripe_charge_id, charge_halere, application_fee_halere, ' +
  'commission_base_halere, commission_vat_halere, vat_rate_bps, policy_snapshot, authorized_at, confirmed_at, confirm_deadline_at, ' +
  'refunded_halere, hold_expires_at, state_changed_at, ' +
  'service_items(name, duration_minutes, buffer_minutes), services(title)'

export interface BookingOrder {
  id: string
  booking_state: BookingState | null
  customer_id: string
  provider_id: string
  slot_id: string | null
  service_id: string | null
  service_item_id: string | null
  status: string | null
  scheduled_at: string | null
  scheduled_end: string | null
  offer_kind: OfferKind | null
  stripe_account_id: string | null
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  stripe_charge_id: string | null
  charge_halere: number | null
  application_fee_halere: number | null
  commission_base_halere: number | null
  commission_vat_halere: number | null
  vat_rate_bps: number | null
  policy_snapshot: unknown
  authorized_at: string | null
  confirmed_at: string | null
  confirm_deadline_at: string | null
  refunded_halere: number | null
  hold_expires_at: string | null
  state_changed_at: string | null
  service_items?: { name: string | null; duration_minutes: number | null; buffer_minutes: number | null } | null
  services?: { title: string | null } | null
}

export async function loadBookingOrder(db: Db, orderId: string): Promise<BookingOrder | null> {
  const { data } = await db.from('orders').select(BOOKING_ORDER_COLUMNS).eq('id', orderId).maybeSingle()
  return (data as unknown as BookingOrder | null) ?? null
}

function orderName(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || 'Rezervace'
}

async function notify(params: Parameters<typeof createNotification>[0]) {
  try {
    await createNotification(params)
  } catch (err) {
    console.error('[booking] notifikace:', err)
  }
}

// ─── Log událostí (evidence) ──────────────────────────────────────────────

export async function logOrderEvent(
  db: Db,
  orderId: string,
  type: OrderEventType,
  actor: Actor,
  payload: Record<string, unknown> = {},
) {
  const { error } = await db.from('order_events').insert({
    order_id: orderId,
    type,
    actor_type: actor.type,
    actor_id: actor.id ?? null,
    payload,
  })
  if (error) console.error('[booking] order_events:', error.message)
}

// ─── Přechody stavu ───────────────────────────────────────────────────────

export type ApplyResult = { ok: true; next: BookingState } | { ok: false }

/**
 * Jediná zapisovací cesta booking_state. Přechod se zapíše jen tehdy, když objednávka
 * pořád je ve stavu `order.booking_state` (zámek proti souběhu a duplicitním webhookům).
 * K němu se zapíše legacy zrcadlo (kalendář, staré obrazovky) a záznam do order_events.
 */
export async function applyTransition(
  db: Db,
  order: BookingOrder,
  event: BookingEvent,
  actor: Actor,
  opts: { extra?: Record<string, unknown>; holdUntil?: Date | null; payload?: Record<string, unknown> } = {},
): Promise<ApplyResult> {
  const from = order.booking_state
  const t = transition(from, event)
  if (!t.ok) return { ok: false }

  const directBooking = await isDirectBooking(db, order)
  const captured = !!(opts.extra?.confirmed_at ?? order.confirmed_at)
  const mirror = legacyMirror(t.next, { directBooking, holdUntil: opts.holdUntil ?? null, captured })
  const now = new Date().toISOString()

  const update: Record<string, unknown> = {
    booking_state: t.next,
    state_changed_at: now,
    status: mirror.status,
    deposit_status: mirror.deposit_status,
    ...(mirror.hold_expires_at !== undefined ? { hold_expires_at: mirror.hold_expires_at } : {}),
    ...(t.cancelReason ? { cancel_reason: t.cancelReason, cancelled_at: now } : {}),
    ...(mirror.clearsSchedule ? { scheduled_at: null, scheduled_end: null, slot_id: null } : {}),
    ...(mirror.releasesSlot ? { stripe_checkout_session_id: null } : {}),
    ...(opts.extra ?? {}),
  }

  let q = db.from('orders').update(update).eq('id', order.id)
  // .eq s null v Supabase nic nenajde – prázdný stav se hlídá přes .is
  q = from === null ? q.is('booking_state', null) : q.eq('booking_state', from)
  const { data, error } = await q.select('id')
  if (error) {
    console.error('[booking] přechod', from, '→', t.next, error.message)
    throw new Error(`Přechod ${from} → ${t.next} se nezapsal: ${error.message}`)
  }
  if (!data || data.length === 0) return { ok: false }

  if (mirror.releasesSlot && order.slot_id) {
    await releaseSlotAndMerge(db, order.slot_id, order.id)
  }

  if (from !== t.next) {
    await logOrderEvent(db, order.id, 'state_changed', actor, { from, to: t.next, event, ...(opts.payload ?? {}) })
  }
  Object.assign(order, update)
  return { ok: true, next: t.next }
}

/** Přímá rezervace času / okna (ne domluva) – po vypršení platby se ruší, nevrací do domluvy */
async function isDirectBooking(db: Db, order: BookingOrder): Promise<boolean> {
  if (order.slot_id) return true
  const { data } = await db
    .from('order_events')
    .select('id')
    .eq('order_id', order.id)
    .eq('type', 'booking_created')
    .limit(1)
  return (data ?? []).length > 0
}

/**
 * Termín nabídl sám poskytovatel – vypsané okno, jeho návrh termínu nebo termín domluvený v chatu.
 * Tím je potvrzení dané předem a platba se po autorizaci hned strhne (rozhodnutí 6. 10. 2026).
 * Ručně se potvrzují jen rezervace z otevírací doby, kde si čas vybral zákazník.
 */
export async function isProviderOfferedTime(db: Db, order: BookingOrder): Promise<boolean> {
  const { data } = await db
    .from('order_events')
    .select('payload')
    .eq('order_id', order.id)
    .eq('type', 'booking_created')
    .limit(1)
  const created = ((data ?? []) as { payload: { source?: string } | null }[])[0]
  if (!created) return true // termín z návrhu poskytovatele
  const source = created.payload?.source
  if (source === 'slot') return true
  if (source === 'opening_hours') return false
  return !!order.slot_id // starší záznam bez zdroje: vypsané okno má slot od založení
}

/** Souřadnice obce podle názvu (text může obsahovat i číslo domu, „Prostřední Bečva 14“) */
async function obecCoords(db: Db, text: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const name = String(text ?? '').split(',')[0].replace(/\s+\d+[a-zA-Z/\d]*$/, '').trim()
  if (!name) return null
  const { data } = await db.from('obce').select('latitude, longitude').ilike('obec', name).limit(1).maybeSingle()
  const o = data as { latitude: number; longitude: number } | null
  return o ? { lat: o.latitude, lng: o.longitude } : null
}

/** Místo, se kterým poskytovatel počítal: obec z objednávky a dosah karty (pojistka auto-potvrzení) */
export async function knownPlaceOf(db: Db, orderId: string): Promise<KnownPlace> {
  const { data } = await db
    .from('orders')
    .select('service_location, location_city, services(location_type, city, city_lat, city_lng, radius_km)')
    .eq('id', orderId)
    .maybeSingle()
  const o = data as {
    service_location: string | null; location_city: string | null
    services: { location_type: string | null; city: string | null; city_lat: number | null; city_lng: number | null; radius_km: number | null } | null
  } | null
  const atCustomer = o?.service_location ? o.service_location === 'u_zakaznika' : o?.services?.location_type !== 'u_poskytovatele'
  const card = o?.services
  const base = card?.city_lat != null && card?.city_lng != null ? { lat: Number(card.city_lat), lng: Number(card.city_lng) } : await obecCoords(db, card?.city)
  return { atCustomer, obec: await obecCoords(db, o?.location_city), base, radiusKm: card?.radius_km ?? null }
}

/**
 * Potvrdit hned po preautorizaci? Jen když termín nabídl sám poskytovatel A adresa zákazníka
 * leží tam, kde počítal (do ~15 km od obce v objednávce nebo v dosahu karty). Jinak ručně.
 */
export async function shouldAutoConfirm(db: Db, order: BookingOrder): Promise<boolean> {
  if (!(await isProviderOfferedTime(db, order))) return false
  const { data } = await db.from('orders').select('location_lat, location_lng').eq('id', order.id).maybeSingle()
  const c = data as { location_lat: number | null; location_lng: number | null } | null
  return isPlaceKnown(await knownPlaceOf(db, order.id), c?.location_lat, c?.location_lng)
}

// ─── Stripe účet providera ────────────────────────────────────────────────

interface StripeAccountRow {
  stripe_account_id: string
  account_type: string
  charges_enabled: boolean
  card_payments: string | null
  deauthorized_at: string | null
}

export async function getProviderAccount(
  db: Db,
  providerId: string,
): Promise<{ accountId: string | null; blocks: AccountBlock[] }> {
  const { data } = await db
    .from('stripe_accounts')
    .select('stripe_account_id, account_type, charges_enabled, card_payments, deauthorized_at')
    .eq('provider_id', providerId)
    .maybeSingle()
  const row = data as StripeAccountRow | null
  const blocks = accountBlocks({
    accountId: row?.stripe_account_id ?? null,
    accountType: row?.account_type ?? null,
    deauthorizedAt: toDate(row?.deauthorized_at),
    chargesEnabled: row?.charges_enabled === true,
    cardPayments: row?.card_payments ?? null,
  })
  return { accountId: row?.stripe_account_id ?? null, blocks }
}

export const ACCOUNT_BLOCK_TEXT: Record<AccountBlock, string> = {
  not_connected: 'Stripe účet zatím není napojený.',
  not_standard: 'Stripe účet je starého typu a je potřeba ho napojit znovu.',
  deauthorized: 'Stripe účet byl od Propoja odpojen.',
  charges_disabled: 'Stripe zatím neumožňuje na účtu přijímat platby (nedokončené ověření nebo omezení účtu).',
  card_payments_inactive: 'Na Stripe účtu nejsou aktivní platby kartou.',
}

/** Zapíše stav účtu ze Stripe do stripe_accounts (jediný zdroj pro accountBlocks) */
export async function syncStripeAccount(db: Db, account: Stripe.Account, providerId?: string | null) {
  const row = {
    stripe_account_id: account.id,
    account_type: account.type ?? 'standard',
    charges_enabled: account.charges_enabled === true,
    card_payments: account.capabilities?.card_payments ?? null,
    details_submitted: account.details_submitted === true,
    disabled_reason: account.requirements?.disabled_reason ?? null,
    updated_at: new Date().toISOString(),
  }
  const owner = providerId ?? (account.metadata?.supabase_user_id as string | undefined) ?? null
  if (owner) {
    const { error } = await db.from('stripe_accounts').upsert({ provider_id: owner, ...row }, { onConflict: 'provider_id' })
    if (error) console.error('[booking] stripe_accounts upsert:', error.message)
    return
  }
  const { error } = await db.from('stripe_accounts').update(row).eq('stripe_account_id', account.id)
  if (error) console.error('[booking] stripe_accounts update:', error.message)
}

// Stripe v onboardingu jinak chce „Váš web“. Většina řemeslníků web nemá, proto
// posíláme veřejnou kartu na Propoju (na localhostu Stripe veřejnou adresu nevezme).
function profilUrl(userId: string): string | undefined {
  if (!APP_URL.startsWith('https://')) return undefined
  return `${APP_URL}/profil/${userId}`
}

const POPIS_CINNOSTI =
  'Řemeslné a osobní služby na objednávku. Zákazníci si přes Propojo.cz rezervují termín a platí Rezervační poplatek nebo Cenu výjezdu.'

/**
 * Najde nebo založí Standard účet providera. Starý Express účet (profiles.stripe_account_id)
 * zůstává jen pro staré objednávky – nový tok s ním nepracuje.
 */
export async function ensureStandardAccount(
  db: Db,
  user: { id: string; email?: string | null },
  name: string | null,
): Promise<string> {
  const { data } = await db
    .from('stripe_accounts')
    .select('stripe_account_id, account_type')
    .eq('provider_id', user.id)
    .maybeSingle()
  const existing = data as { stripe_account_id: string; account_type: string } | null
  if (existing && existing.account_type === 'standard') return existing.stripe_account_id

  const account = await stripe.accounts.create({
    type: 'standard',
    country: 'CZ',
    email: user.email ?? undefined,
    business_profile: {
      name: name ?? undefined,
      url: profilUrl(user.id),
      product_description: POPIS_CINNOSTI,
    },
    metadata: { supabase_user_id: user.id },
  })
  await syncStripeAccount(db, account, user.id)
  return account.id
}

export async function createOnboardingLink(accountId: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${APP_URL}/dashboard/vyplaty?stav=obnova`,
    return_url: `${APP_URL}/dashboard/vyplaty?stav=hotovo`,
    type: 'account_onboarding',
  })
  return link.url
}

// ─── Kontrola nové rezervace ──────────────────────────────────────────────

export type NewBookingCheck =
  | { ok: true; offerKind: OfferKind; commission: CommissionBreakdown; accountId: string }
  | { ok: false; error: string }

/**
 * Společná kontrola před založením rezervace i před platbou:
 * typ nabídky a částka (min. 200 Kč), okno s předstihem, funkční Stripe účet providera.
 */
export async function checkNewBooking(
  db: Db,
  args: { item: ChargeableItem; providerId: string; start: Date | null; end: Date | null; now?: Date },
): Promise<NewBookingCheck> {
  const charge = bookingCharge(args.item)
  if (!charge.ok) return charge

  const issue = bookingWindowIssue(args.start, args.end, args.now ?? new Date())
  if (issue) return { ok: false, error: bookingWindowMessage(issue) }

  const account = await getProviderAccount(db, args.providerId)
  if (account.blocks.length > 0 || !account.accountId) {
    return { ok: false, error: 'Poskytovatel teď nemůže přijímat rezervace s platbou. Zkuste to prosím později.' }
  }
  return { ok: true, offerKind: charge.offerKind, commission: charge.commission, accountId: account.accountId }
}

// ─── Checkout (preautorizace) ─────────────────────────────────────────────

export async function createBookingCheckoutSession(args: {
  orderId: string
  accountId: string
  offerKind: OfferKind
  itemName: string
  commission: CommissionBreakdown
}): Promise<{ session: Stripe.Checkout.Session; holdUntil: Date }> {
  const policy = BOOKING_POLICY
  const expiresAt = Math.floor(Date.now() / 1000) + policy.checkoutTtlMinutes * 60
  const metadata = { order_id: args.orderId, kind: BOOKING_KIND, policy_version: policy.version }
  const label = args.offerKind === 'B' ? 'Cena výjezdu' : 'Rezervační poplatek'

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: policy.currency,
          product_data: { name: `${label} – ${args.itemName}` },
          unit_amount: args.commission.chargeHalere,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        capture_method: 'manual',
        application_fee_amount: args.commission.applicationFeeHalere,
        metadata,
      },
      expires_at: expiresAt,
      success_url: `${APP_URL}/dashboard/objednavky/${args.orderId}?platba=uspech`,
      // Návrat sem znamená jen „checkout nebyl dokončen“, ne zrušení objednávky.
      cancel_url: `${APP_URL}/dashboard/objednavky/${args.orderId}?platba=zruseno`,
      locale: 'cs',
      metadata,
    },
    { stripeAccount: args.accountId },
  )
  // Termín drží o pár minut déle než checkout kvůli zpoždění webhooku.
  return { session, holdUntil: new Date((expiresAt + 5 * 60) * 1000) }
}

/** Ukončí otevřený checkout na účtu providera (starý pokus / opuštěný termín) */
export async function expireCheckoutIfOpen(accountId: string | null, sessionId: string) {
  try {
    const opts = accountId ? { stripeAccount: accountId } : undefined
    const s = await stripe.checkout.sessions.retrieve(sessionId, undefined, opts)
    if (s.status === 'open') await stripe.checkout.sessions.expire(sessionId, undefined, opts)
  } catch (err) {
    console.warn('[booking] checkout se nepodařilo ukončit:', err)
  }
}

// ─── Preautorizace dokončena ──────────────────────────────────────────────

function piId(pi: string | { id: string } | null | undefined): string | null {
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id
}

async function cancelAuthorization(accountId: string, paymentIntentId: string): Promise<boolean> {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: 'abandoned' }, { stripeAccount: accountId })
    return true
  } catch (err) {
    // Už zrušená / vypršelá preautorizace je v pořádku.
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, undefined, { stripeAccount: accountId })
      if (pi.status === 'canceled') return true
    } catch { /* níž se zaloguje původní chyba */ }
    console.error('[booking] zrušení preautorizace selhalo:', paymentIntentId, err)
    return false
  }
}

/**
 * PaymentIntent je ve stavu requires_capture. Volá webhook (checkout.session.completed,
 * payment_intent.amount_capturable_updated) i záchranný cron. Opakované volání nic nezdvojí.
 */
export async function handleAuthorized(db: Db, accountId: string, pi: Stripe.PaymentIntent, sessionId?: string | null) {
  if (pi.metadata?.kind !== BOOKING_KIND) return
  if (pi.status !== 'requires_capture') return
  const orderId = pi.metadata.order_id
  const order = orderId ? await loadBookingOrder(db, orderId) : null

  if (!order) {
    console.error('[booking] preautorizace bez objednávky', orderId, pi.id)
    await cancelAuthorization(accountId, pi.id)
    return
  }
  // Duplicitní událost ke stejné platbě
  if (order.stripe_payment_intent_id === pi.id && order.booking_state !== 'pending_payment') return

  // Ke které session platba patří (webhook ji zná, u PaymentIntentu se dohledá)
  let session = sessionId ?? null
  if (!session) {
    try {
      const list = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 }, { stripeAccount: accountId })
      session = list.data[0]?.id ?? null
    } catch (err) {
      console.warn('[booking] session k PaymentIntentu nenalezena:', err)
    }
  }

  const reasons: string[] = []
  if (order.booking_state !== 'pending_payment') reasons.push(`stav ${order.booking_state}`)
  if (order.stripe_account_id !== accountId) reasons.push('jiný Stripe účet')
  if (session && order.stripe_checkout_session_id !== session) reasons.push('stará platební session')
  if (pi.amount !== order.charge_halere) reasons.push('nesedí částka')
  if ((pi.application_fee_amount ?? null) !== order.application_fee_halere) reasons.push('nesedí provize')
  if (order.slot_id) {
    const { data: slot } = await db
      .from('availability_slots')
      .select('status, order_id')
      .eq('id', order.slot_id)
      .maybeSingle()
    const s = slot as { status: string; order_id: string | null } | null
    if (!s || s.order_id !== order.id || s.status !== 'zabrano') reasons.push('termín už není držený')
  } else if (!order.scheduled_at || !order.scheduled_end) {
    reasons.push('chybí termín')
  }

  const nazev = orderName(order)

  if (reasons.length > 0) {
    // Nic nebylo strženo – preautorizaci jen uvolníme. Stav objednávky se nemění
    // (pokud je živá novější platba, ta platí dál).
    const released = await cancelAuthorization(accountId, pi.id)
    await logOrderEvent(db, order.id, 'authorization_released', { type: 'system' }, {
      payment_intent: pi.id, reason: reasons.join(', '), released,
    })
    await notify({
      userId: order.customer_id,
      type: 'status_change',
      orderId: order.id,
      actorId: order.customer_id,
      title: 'Rezervaci nešlo dokončit – platbu jsme uvolnili',
      preview: `${nazev} · peníze nebyly strženy, blokace na kartě zmizí podle banky. Zkuste prosím rezervovat znovu.`,
    })
    return
  }

  const now = new Date()
  const windowStart = toDate(order.scheduled_at)
  const policy = policyFromSnapshot(order.policy_snapshot)
  // Zjistit před vyříznutím slotu níž (to by u rezervace z otevírací doby doplnilo slot_id).
  const autoConfirm = await shouldAutoConfirm(db, order)
  const chargeId = piId(pi.latest_charge as string | Stripe.Charge | null)

  // Domluvený termín bez fyzického okna: vyřízneme ho z volného okna, ať se už nenabízí.
  let claimedSlotId: string | null = null
  if (!order.slot_id && order.scheduled_at && order.scheduled_end && order.service_id) {
    claimedSlotId = await claimMatchingAvailabilitySlot(db, {
      orderId: order.id,
      providerId: order.provider_id,
      serviceId: order.service_id,
      startsAt: order.scheduled_at,
      endsAt: order.scheduled_end,
    })
  }

  const authorized = await applyTransition(db, order, 'authorized', { type: 'stripe' }, {
    extra: {
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: chargeId,
      authorized_at: now.toISOString(),
      confirm_deadline_at: confirmationDeadline(now, windowStart, policy).toISOString(),
      ...(claimedSlotId ? { slot_id: claimedSlotId } : {}),
    },
    payload: { payment_intent: pi.id, auto_confirm: autoConfirm },
  })
  if (!authorized.ok) {
    if (claimedSlotId) await releaseSlotAndMerge(db, claimedSlotId, order.id)
    return
  }

  // Preautorizace dorazila po začátku termínu → potvrdit už nejde, hned uvolnit (korekce 3).
  if (isAuthorizationTooLate(now, windowStart)) {
    const released = await cancelAuthorization(accountId, pi.id)
    if (released) {
      await applyTransition(db, order, 'confirmation_expired', { type: 'system' }, { payload: { reason: 'authorized_after_start' } })
      await notify({
        userId: order.customer_id,
        type: 'status_change',
        orderId: order.id,
        actorId: order.customer_id,
        title: 'Rezervaci nešlo dokončit – termín už začal',
        preview: `${nazev} · platbu jsme uvolnili, peníze nebyly strženy.`,
      })
    }
    return
  }

  const kdy = terminDlouze(order.scheduled_at)

  // Termín nabídl sám poskytovatel a adresa sedí → potvrdit hned (capture). Zákazník dostane „Rezervace je
  // potvrzená“ z handleCaptured. Když capture nevyjde a rezervace zůstane čekat, jede ruční potvrzení.
  if (autoConfirm) {
    const res = await captureBooking(db, order, { type: 'system' })
    if (res.ok) {
      await notify({
        userId: order.provider_id,
        type: 'status_change',
        orderId: order.id,
        actorId: order.customer_id,
        title: '🎉 Nový termín díky Propoju',
        preview: `${nazev} · ${kdy} · zákazník zaplatil, rezervace je potvrzená (termín jste nabídli vy).`,
      })
      return
    }
    const fresh = await loadBookingOrder(db, order.id)
    if (fresh?.booking_state !== 'awaiting_confirmation') return
  }

  await notify({
    userId: order.provider_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.customer_id,
    title: 'Nová rezervace čeká na potvrzení',
    preview: `${nazev} · ${kdy}`,
  })
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.customer_id,
    title: 'Platba je předautorizovaná, čekáme na potvrzení poskytovatele',
    preview: `${nazev} · ${kdy}. Částka se strhne až po potvrzení.`,
  })
}

// ─── Checkout vypršel ─────────────────────────────────────────────────────

export async function handleCheckoutExpired(db: Db, session: Stripe.Checkout.Session) {
  if (session.metadata?.kind !== BOOKING_KIND) return
  const orderId = session.metadata.order_id
  const order = orderId ? await loadBookingOrder(db, orderId) : null
  if (!order || order.booking_state !== 'pending_payment') return
  // Starší session nesmí zabít novější pokus o platbu
  if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== session.id) return

  const r = await applyTransition(db, order, 'checkout_expired', { type: 'stripe' }, { payload: { session: session.id } })
  if (!r.ok) return

  const nazev = orderName(order)
  const zpetDoDomluvy = order.scheduled_at === null // applyTransition termín smazal = návrat do domluvy
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.customer_id,
    title: zpetDoDomluvy ? 'Platba vypršela – objednávka zůstává otevřená' : 'Rezervace vypršela – nebyla zaplacena',
    preview: zpetDoDomluvy
      ? `${nazev} · termín není potvrzený, můžete se domluvit na jiném.`
      : `${nazev} · termín jsme uvolnili. Rezervovat můžete znovu.`,
  })
}

// ─── Capture ──────────────────────────────────────────────────────────────

/** Provize vzniká při úspěšném capture → řádek v commission_ledger (jednou na objednávku) */
export async function recordCapture(db: Db, order: BookingOrder, accountId: string, pi: Stripe.PaymentIntent, capturedAt: Date) {
  let chargeId = piId(pi.latest_charge as string | Stripe.Charge | null)
  let feeId: string | null = null
  let chargeHalere = pi.amount_received || order.charge_halere || 0
  if (chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId, undefined, { stripeAccount: accountId })
      feeId = piId(charge.application_fee as string | Stripe.ApplicationFee | null)
      chargeHalere = charge.amount_captured || chargeHalere
    } catch (err) {
      console.warn('[booking] charge k provizi nenalezen:', err)
    }
  }

  const fee = pi.application_fee_amount ?? order.application_fee_halere ?? 0
  const vat = order.commission_vat_halere ?? 0
  const base = order.commission_base_halere != null && order.commission_base_halere + vat === fee
    ? order.commission_base_halere
    : fee - vat
  if (order.application_fee_halere != null && fee !== order.application_fee_halere) {
    console.warn('[booking] provize ve Stripe se liší od snapshotu', order.id, fee, order.application_fee_halere)
  }

  const { data: provider } = await db
    .from('profiles')
    .select('ico, company_name, full_name')
    .eq('id', order.provider_id)
    .maybeSingle()
  const p = provider as { ico: string | null; company_name: string | null; full_name: string | null } | null

  const { error } = await db.from('commission_ledger').insert({
    order_id: order.id,
    provider_id: order.provider_id,
    provider_ico: p?.ico ?? null,
    provider_billing_name: p?.company_name || p?.full_name || null,
    stripe_account_id: accountId,
    stripe_payment_intent_id: pi.id,
    stripe_charge_id: chargeId,
    application_fee_id: feeId,
    charge_halere: chargeHalere,
    base_halere: base,
    vat_rate_bps: order.vat_rate_bps ?? 0,
    vat_halere: vat,
    fee_halere: fee,
    captured_at: capturedAt.toISOString(),
    statement_month: prazskyMesic(capturedAt),
  })
  // 23505 = už zapsáno (duplicitní webhook / souběh capture a webhooku)
  if (error && error.code !== '23505') console.error('[booking] commission_ledger:', error.message)
}

/** PaymentIntent je succeeded: náš capture, nebo capture providera ve Stripe Dashboardu (korekce 6) */
export async function handleCaptured(db: Db, accountId: string, pi: Stripe.PaymentIntent, capturedAt: Date = new Date()) {
  if (pi.metadata?.kind !== BOOKING_KIND) return
  const order = pi.metadata.order_id ? await loadBookingOrder(db, pi.metadata.order_id) : null
  if (!order || order.stripe_payment_intent_id !== pi.id) return

  const event: BookingEvent | null =
    order.booking_state === 'capture_in_progress' ? 'capture_succeeded'
      : order.booking_state === 'awaiting_confirmation' ? 'external_capture'
        : null

  if (event) {
    const r = await applyTransition(db, order, event, { type: event === 'external_capture' ? 'stripe' : 'system' }, {
      extra: { confirmed_at: capturedAt.toISOString() },
      payload: { payment_intent: pi.id },
    })
    if (!r.ok) return
    await recordCapture(db, order, accountId, pi, capturedAt)
    const nazev = orderName(order)
    await notify({
      userId: order.customer_id,
      type: 'status_change',
      orderId: order.id,
      actorId: order.provider_id,
      title: '🎉 Rezervace je potvrzená',
      preview: `${nazev} · ${terminDlouze(order.scheduled_at)}. Den předem vám připomeneme.`,
    })
    if (event === 'external_capture') {
      await notify({
        userId: order.provider_id,
        type: 'status_change',
        orderId: order.id,
        actorId: order.provider_id,
        title: 'Rezervace potvrzena stržením platby ve Stripe',
        preview: nazev,
      })
    }
    return
  }

  // Potvrzeno už dřív – jen pojistka, že provize je zapsaná
  if (order.booking_state === 'confirmed') await recordCapture(db, order, accountId, pi, capturedAt)
}

/** PaymentIntent je canceled: odmítnutí ve Stripe Dashboardu, vypršelá autorizace, nebo naše vlastní akce */
export async function handleAuthorizationCanceled(db: Db, pi: Stripe.PaymentIntent) {
  if (pi.metadata?.kind !== BOOKING_KIND) return
  const order = pi.metadata.order_id ? await loadBookingOrder(db, pi.metadata.order_id) : null
  if (!order || order.stripe_payment_intent_id !== pi.id) return

  let event: BookingEvent | null = null
  if (order.booking_state === 'awaiting_confirmation') {
    event = pi.cancellation_reason === 'automatic' ? 'authorization_lapsed' : 'external_cancel'
  } else if (order.booking_state === 'capture_in_progress') {
    event = 'capture_failed'
  }
  // Jiný stav = zrušení vyvolala naše akce (stav už je posunutý) → nic
  if (!event) return

  const r = await applyTransition(db, order, event, { type: 'stripe' }, {
    payload: { payment_intent: pi.id, cancellation_reason: pi.cancellation_reason ?? null },
  })
  if (!r.ok) return

  const nazev = orderName(order)
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: event === 'external_cancel' ? 'Poskytovatel rezervaci nepotvrdil' : 'Rezervace nebyla potvrzena',
    preview: `${nazev} · platbu jsme uvolnili, peníze nebyly strženy.`,
  })
}

type CaptureOutcome =
  | { ok: true; state: 'confirmed' }
  | { ok: true; state: 'pending' } // dořeší webhook / cron
  | { ok: false; error: string }

/**
 * Po chybě capture (nebo v záchranném cronu) rozhodne podle skutečného stavu PaymentIntentu.
 * Nikdy nenechá stržené peníze u nepotvrzené rezervace.
 */
export async function resolveCaptureInProgress(db: Db, order: BookingOrder): Promise<CaptureOutcome> {
  if (!order.stripe_account_id || !order.stripe_payment_intent_id) return { ok: false, error: 'Chybí údaje o platbě.' }
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, undefined, { stripeAccount: order.stripe_account_id })
  } catch (err) {
    console.error('[booking] PaymentIntent nejde načíst, stav dořeší webhook / cron:', err)
    return { ok: true, state: 'pending' }
  }
  switch (pi.status) {
    case 'requires_capture':
      await applyTransition(db, order, 'capture_reset', { type: 'system' }, { payload: { payment_intent: pi.id } })
      return { ok: false, error: 'Platbu se nepodařilo strhnout. Zkuste to prosím znovu.' }
    case 'succeeded':
      await handleCaptured(db, order.stripe_account_id, pi)
      return { ok: true, state: 'confirmed' }
    case 'processing':
      return { ok: true, state: 'pending' }
    case 'canceled':
      await applyTransition(db, order, 'capture_failed', { type: 'system' }, { payload: { payment_intent: pi.id } })
      return { ok: false, error: 'Platbu už nelze strhnout, rezervace není potvrzená.' }
    default:
      return { ok: true, state: 'pending' }
  }
}

/** Potvrzení providerem = capture. Teprve úspěšný capture znamená confirmed. (UI přijde ve vrstvě 3) */
export async function captureBooking(db: Db, order: BookingOrder, actor: Actor): Promise<CaptureOutcome> {
  if (order.booking_state !== 'awaiting_confirmation') return { ok: false, error: 'Rezervaci teď nelze potvrdit.' }
  if (!order.stripe_account_id || !order.stripe_payment_intent_id) return { ok: false, error: 'Chybí údaje o platbě.' }

  const started = await applyTransition(db, order, 'confirm_started', actor)
  if (!started.ok) return { ok: false, error: 'Rezervaci mezitím změnil někdo jiný. Obnovte stránku.' }

  try {
    const pi = await stripe.paymentIntents.capture(
      order.stripe_payment_intent_id,
      {},
      { stripeAccount: order.stripe_account_id, idempotencyKey: `capture-${order.id}` },
    )
    if (pi.status === 'succeeded') {
      await handleCaptured(db, order.stripe_account_id, pi)
      return { ok: true, state: 'confirmed' }
    }
    return resolveCaptureInProgress(db, order)
  } catch (err) {
    console.error('[booking] capture selhal:', err)
    return resolveCaptureInProgress(db, order)
  }
}

/** Uvolnění nestržené preautorizace (odmítnutí, vypršení, zrušení před potvrzením) */
export async function releaseAuthorization(
  db: Db,
  order: BookingOrder,
  event: 'provider_declined' | 'confirmation_expired' | 'customer_cancelled',
  actor: Actor,
): Promise<boolean> {
  if (order.booking_state !== 'awaiting_confirmation') return false
  if (order.stripe_account_id && order.stripe_payment_intent_id) {
    const released = await cancelAuthorization(order.stripe_account_id, order.stripe_payment_intent_id)
    if (!released) return false
  }
  const r = await applyTransition(db, order, event, actor)
  return r.ok
}

/**
 * Zrušení rozpracované platby (zákazník ruší / poskytovatel odmítá) – nic nebylo předautorizováno.
 * Ukončí checkout na účtu providera a uvolní termín. Když platba mezitím doběhne,
 * handleAuthorized najde jiný stav a preautorizaci hned uvolní.
 */
export async function cancelPendingPayment(
  db: Db,
  order: BookingOrder,
  by: 'customer' | 'provider',
  actorId: string,
): Promise<boolean> {
  if (order.booking_state !== 'pending_payment') return false
  // Nejdřív zavřít platební stránku, ať už nejde zaplatit (applyTransition ID session vynuluje).
  if (order.stripe_checkout_session_id) {
    await expireCheckoutIfOpen(order.stripe_account_id, order.stripe_checkout_session_id)
  }
  const r = await applyTransition(
    db,
    order,
    by === 'customer' ? 'customer_cancelled' : 'provider_declined',
    { type: by, id: actorId },
    { payload: { phase: 'before_payment' } },
  )
  return r.ok
}

// ─── Refundy a spory (jen synchronizace ze Stripe) ───────────────────────

async function orderByPaymentIntent(db: Db, paymentIntentId: string | null): Promise<BookingOrder | null> {
  if (!paymentIntentId) return null
  const { data } = await db
    .from('orders')
    .select(BOOKING_ORDER_COLUMNS)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .not('booking_state', 'is', null)
    .maybeSingle()
  return (data as unknown as BookingOrder | null) ?? null
}

async function syncRefundedTotal(db: Db, order: BookingOrder, accountId: string, chargeId: string | null) {
  if (!chargeId) return
  try {
    const charge = await stripe.charges.retrieve(chargeId, undefined, { stripeAccount: accountId })
    await db.from('orders').update({ refunded_halere: charge.amount_refunded ?? 0 }).eq('id', order.id)
  } catch (err) {
    console.warn('[booking] refundovaná částka nenačtena:', err)
  }
}

/** Refund vytvořený kýmkoli (i providerem ručně v Dashboardu) → order_refunds + refunded_halere */
export async function handleRefund(db: Db, accountId: string, refund: Stripe.Refund) {
  const order = await orderByPaymentIntent(db, piId(refund.payment_intent as string | Stripe.PaymentIntent | null))
  if (!order) return

  const status = fromStripeRefundStatus(refund.status)
  const now = new Date().toISOString()
  const fields = {
    stripe_refund_id: refund.id,
    status,
    failure_reason: refund.failure_reason ?? null,
    updated_at: now,
    ...(status === 'succeeded' ? { succeeded_at: now } : {}),
  }

  // Refund zahájený naším enginem nese id svého řádku; jinak ho poznáme podle stripe_refund_id.
  const ownRowId = refund.metadata?.order_refund_id
  let updated = false
  if (ownRowId) {
    const { data } = await db.from('order_refunds').update(fields).eq('id', ownRowId).select('id')
    updated = (data ?? []).length > 0
  }
  if (!updated) {
    const { data } = await db.from('order_refunds').update(fields).eq('stripe_refund_id', refund.id).select('id')
    updated = (data ?? []).length > 0
  }
  if (!updated) {
    const { error } = await db.from('order_refunds').insert({
      order_id: order.id,
      stripe_account_id: accountId,
      amount_halere: refund.amount,
      refund_trigger: 'stripe_dashboard',
      initiated_by: 'stripe',
      ...fields,
    })
    if (error && error.code !== '23505') console.error('[booking] order_refunds:', error.message)
  }

  await syncRefundedTotal(db, order, accountId, piId(refund.charge as string | Stripe.Charge | null))
}

export async function handleChargeRefunded(db: Db, accountId: string, charge: Stripe.Charge) {
  const order = await orderByPaymentIntent(db, piId(charge.payment_intent as string | Stripe.PaymentIntent | null))
  if (!order) return
  await db.from('orders').update({ refunded_halere: charge.amount_refunded ?? 0 }).eq('id', order.id)
}

export async function handleDispute(db: Db, dispute: Stripe.Dispute) {
  const order = await orderByPaymentIntent(db, piId(dispute.payment_intent as string | Stripe.PaymentIntent | null))
  if (!order) return
  await db.from('orders').update({ stripe_dispute_status: dispute.status }).eq('id', order.id)
  await logOrderEvent(db, order.id, 'stripe_event', { type: 'stripe' }, { dispute: dispute.id, status: dispute.status })
}

// ─── Záchrana (když webhook nedorazil) ───────────────────────────────────

/**
 * Běží v denním cronu. Nikdy neruší objednávku, ke které existuje autorizace:
 * stav se vždy nejdřív ověří ve Stripe.
 */
/**
 * Dořeší rozpracovaný checkout podle skutečného stavu ve Stripe (webhook nemusel dorazit).
 * Vrací true, když se stav objednávky posunul. Nikdy nic neruší bez potvrzení ze Stripe.
 */
async function syncCheckoutFromStripe(db: Db, order: BookingOrder): Promise<boolean> {
  if (order.booking_state !== 'pending_payment') return false
  if (!order.stripe_account_id || !order.stripe_checkout_session_id) return false
  const opts = { stripeAccount: order.stripe_account_id }
  const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, undefined, opts)
  if (session.status === 'complete') {
    const id = piId(session.payment_intent as string | Stripe.PaymentIntent | null)
    if (!id) return false
    const pi = await stripe.paymentIntents.retrieve(id, undefined, opts)
    await handleAuthorized(db, order.stripe_account_id, pi, session.id)
    return true
  }
  if (session.status === 'expired') {
    await handleCheckoutExpired(db, session)
    return true
  }
  if (session.status === 'open' && (session.expires_at ?? 0) * 1000 < Date.now()) {
    await stripe.checkout.sessions.expire(session.id, undefined, opts)
  }
  return false
}

/**
 * Zákazník se vrátil ze Stripe (?platba=uspech): zeptat se Stripe hned, nečekat jen na webhook.
 * Stejná logika jako záchranný cron, opakované volání nic nezdvojí.
 */
export async function syncCheckoutOnReturn(db: Db, orderId: string): Promise<void> {
  const order = await loadBookingOrder(db, orderId)
  if (!order || order.booking_state !== 'pending_payment') return
  try {
    await syncCheckoutFromStripe(db, order)
  } catch (err) {
    console.error('[booking] ověření platby po návratu ze Stripe', orderId, err)
  }
}

export async function rescueBookings(db: Db): Promise<{ checked: number; fixed: number; failed: number }> {
  const now = Date.now()
  let checked = 0
  let fixed = 0
  let failed = 0

  // 1) Rozpracovaný checkout, kterému prošel hold
  const { data: pending } = await db
    .from('orders')
    .select(BOOKING_ORDER_COLUMNS)
    .eq('booking_state', 'pending_payment')
    .lt('hold_expires_at', new Date(now - 5 * 60_000).toISOString())
    .limit(50)

  for (const order of (pending ?? []) as unknown as BookingOrder[]) {
    checked++
    try {
      if (await syncCheckoutFromStripe(db, order)) fixed++
    } catch (err) {
      console.error('[booking] záchrana checkoutu', order.id, err)
      failed++
    }
  }

  // 2) Capture, který se nedokončil
  const { data: capturing } = await db
    .from('orders')
    .select(BOOKING_ORDER_COLUMNS)
    .eq('booking_state', 'capture_in_progress')
    .lt('state_changed_at', new Date(now - 2 * 60_000).toISOString())
    .limit(50)

  for (const order of (capturing ?? []) as unknown as BookingOrder[]) {
    checked++
    try {
      await resolveCaptureInProgress(db, order)
      fixed++
    } catch (err) {
      console.error('[booking] záchrana capture', order.id, err)
      failed++
    }
  }

  return { checked, fixed, failed }
}
