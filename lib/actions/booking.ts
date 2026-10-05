'use server'
// lib/actions/booking.ts
// Model v2: akce nad rezervací z obrazovky objednávky. Pravidla peněz jsou v lib/booking,
// tady jen ověření, kdo akci dělá, a notifikace.
//
// cancelBeforePayment – zrušení (zákazník) / odmítnutí (poskytovatel) dokud se nic nestrhlo:
//   domluva termínu, přijatý termín čekající na platbu, rozpracovaná platba
//   a u zákazníka i předautorizovaná rezervace čekající na potvrzení (jen uvolní blokaci, §8).
// confirmBooking – poskytovatel potvrdí = capture. Teprve úspěšný capture znamená „potvrzeno“ (§4).
// declineBooking – poskytovatel odmítne předautorizovanou rezervaci = uvolnění blokace.

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createDepositCheckout } from '@/lib/actions/deposit'
import { bookingCharge, isOfferKind, itemPriceKc } from '@/lib/booking/commission'
import {
  OFFER_KIND_TITLE,
  PAYMENT_NOTE,
  PAYMENT_SHORT,
  RECAP_DOCUMENT_VERSION,
  cancellationRules,
  recapCheckbox,
  recapCheckboxWhy,
  submitLabel,
  withdrawalNote,
  paymentLabel,
  paymentMeaning,
  quoteFeeDeductionNote,
} from '@/lib/booking/texts'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/actions/notifications'
import { updateOrderStatus } from '@/lib/actions/orders'
import {
  adminDb,
  cancelPendingPayment,
  logOrderEvent,
  captureBooking,
  loadBookingOrder,
  releaseAuthorization,
  type BookingOrder,
} from '@/lib/booking/payments'

type Result = { success: true } | { success: false; error: string }

function revalidateOrder(orderId: string) {
  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  revalidatePath(`/dashboard/objednavky/${orderId}`)
}

function orderName(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || 'Objednávka'
}

async function loadForUser(orderId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Nejste přihlášeni.' }
  const db = adminDb()
  const order = await loadBookingOrder(db, orderId)
  if (!order) return { ok: false as const, error: 'Objednávka nenalezena.' }
  const by = order.customer_id === user.id ? 'customer' : order.provider_id === user.id ? 'provider' : null
  if (!by) return { ok: false as const, error: 'K této objednávce nemáte přístup.' }
  return { ok: true as const, db, order, by: by as 'customer' | 'provider', userId: user.id }
}

const REASON_MAX = 500

/** Nepovinná zpráva poskytovatele zákazníkovi, proč rezervaci ruší / odmítá – jde do chatu objednávky. */
async function postReason(db: ReturnType<typeof adminDb>, orderId: string, senderId: string, reason?: string | null) {
  const text = (reason ?? '').trim().slice(0, REASON_MAX)
  if (!text) return null
  const { error } = await (db.from('messages') as any).insert({ order_id: orderId, sender_id: senderId, content: text })
  if (error) console.error('[booking] zpráva s důvodem:', error.message)
  return text
}

function withReason(base: string, reason: string | null): string {
  return reason ? `${base} Zpráva: „${reason.length > 80 ? `${reason.slice(0, 80)}…` : reason}“` : base
}

export async function cancelBeforePayment(orderId: string, reason?: string | null): Promise<Result> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx

  // Rozpracovaná platba: ukončit checkout a posunout stav rezervace.
  if (order.booking_state === 'pending_payment') {
    const ok = await cancelPendingPayment(db, order, by, userId)
    if (!ok) {
      return { success: false, error: 'Objednávku se nepodařilo zrušit – platba mezitím nejspíš proběhla. Obnovte stránku.' }
    }
    const text = by === 'provider' ? await postReason(db, orderId, userId, reason) : null
    await createNotification({
      userId: by === 'customer' ? order.provider_id : order.customer_id,
      type: 'status_change',
      orderId,
      actorId: userId,
      title: by === 'customer' ? 'Zákazník objednávku zrušil' : 'Poskytovatel objednávku zrušil',
      preview: withReason(`${orderName(order)} · nic nebylo strženo.`, text),
    })
    revalidateOrder(orderId)
    return { success: true }
  }

  // Zákazník ruší předautorizovanou rezervaci, kterou poskytovatel ještě nepotvrdil:
  // jen se uvolní blokace na kartě, nic se nevrací (§8). Poskytovatel tady odmítá přes declineBooking.
  if (order.booking_state === 'awaiting_confirmation' && by === 'customer') {
    const ok = await releaseAuthorization(db, order, 'customer_cancelled', { type: 'customer', id: userId })
    if (!ok) {
      return { success: false, error: 'Rezervaci se nepodařilo zrušit – poskytovatel ji mezitím nejspíš potvrdil. Obnovte stránku.' }
    }
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: userId,
      title: 'Zákazník rezervaci zrušil',
      preview: `${orderName(order)} · před vaším potvrzením, blokace na kartě se uvolnila.`,
    })
    revalidateOrder(orderId)
    return { success: true }
  }

  // Rezervace ještě nevznikla (domluva, přijatý termín bez otevřené platby) nebo platba vypršela:
  // obyčejné zrušení objednávky bez peněz (uvolní termín a dá vědět druhé straně).
  if (order.booking_state === null || order.booking_state === 'payment_expired') {
    if (order.status !== 'cekajici' && order.status !== 'prijato') {
      return { success: false, error: 'Tuto objednávku už nelze zrušit.' }
    }
    const res = await updateOrderStatus(orderId, 'zruseno' as any)
    if (res.success && by === 'provider') await postReason(db, orderId, userId, reason)
    return res.success ? { success: true } : { success: false, error: res.error ?? 'Nepodařilo se zrušit.' }
  }

  return { success: false, error: 'Potvrzenou rezervaci zatím nelze zrušit v aplikaci – tato možnost bude doplněna.' }
}

export async function confirmBooking(orderId: string): Promise<Result> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx
  if (by !== 'provider') return { success: false, error: 'Rezervaci potvrzuje poskytovatel.' }
  if (order.booking_state !== 'awaiting_confirmation') {
    return { success: false, error: 'Rezervaci teď nelze potvrdit. Obnovte stránku.' }
  }
  // Lhůta: 48 h od předautorizace, vždy ale nejpozději začátek termínu (§4).
  if (order.confirm_deadline_at && new Date(order.confirm_deadline_at).getTime() <= Date.now()) {
    return { success: false, error: 'Lhůta na potvrzení už uplynula, rezervaci nelze potvrdit.' }
  }

  // captureBooking zapíše stav a provizi; notifikaci zákazníkovi pošle handleCaptured.
  const res = await captureBooking(db, order, { type: 'provider', id: userId })
  revalidateOrder(orderId)
  if (!res.ok) return { success: false, error: res.error }
  return { success: true }
}

export async function declineBooking(orderId: string, reason?: string | null): Promise<Result> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx
  if (by !== 'provider') return { success: false, error: 'Rezervaci odmítá poskytovatel.' }
  if (order.booking_state !== 'awaiting_confirmation') {
    return { success: false, error: 'Rezervaci teď nelze odmítnout. Obnovte stránku.' }
  }

  const ok = await releaseAuthorization(db, order, 'provider_declined', { type: 'provider', id: userId })
  if (!ok) return { success: false, error: 'Rezervaci se nepodařilo odmítnout. Zkuste to prosím znovu.' }
  const text = await postReason(db, orderId, userId, reason)
  await createNotification({
    userId: order.customer_id,
    type: 'status_change',
    orderId,
    actorId: userId,
    title: 'Poskytovatel rezervaci nepotvrdil',
    preview: withReason(`${orderName(order)} · blokace na kartě se uvolnila, nic nebylo strženo.`, text),
  })
  revalidateOrder(orderId)
  return { success: true }
}


// ─── Krokový průvodce před platbou (model §15, §17) ──────────────────────

export type BookingRecap = {
  orderId: string
  /** Karta nabídky – návrat k výběru termínu po vypršení zámku */
  serviceId: string | null
  offerKindTitle: string
  itemName: string
  paymentLabel: string
  chargeKc: number
  /** Cena z nabídky, když ji poskytovatel u této objednávky upravil (jinak null) */
  originalChargeKc: number | null
  /** Důvod úpravy ceny od poskytovatele */
  priceNote: string | null
  paymentMeaning: string
  /** Výjezd: slib poskytovatele odečíst Cenu výjezdu z ceny zakázky – viditelně nad tlačítkem */
  deductionNote: string | null
  cancellationRules: string[]
  paymentNote: string
  paymentShort: string
  /** Zaškrtávací pole podle typu (VOP čl. 9); null = nic se nepotvrzuje */
  consentText: string | null
  consentWhy: string | null
  /** Poučení bez zaškrtávání (služba) */
  withdrawalNote: string | null
  submitLabel: string
  /** Termín je už na objednávce (přímá rezervace / přijatý termín) */
  scheduledAt: string | null
  scheduledEnd: string | null
  /** Výjezd: termín je okno příjezdu */
  arrivalWindow: boolean
  /** Do kdy drží přímá rezervace termín (odpočet v průvodci) */
  holdExpiresAt: string | null
  /** Služba u zákazníka / výjezd: krok Adresa */
  atCustomer: boolean
  /** Výjezd: adresa musí mít souřadnice (korekce 5) */
  addressRequiresCoords: boolean
  address: { text: string; lat: number | null; lng: number | null } | null
  /** Adresa z poslední objednávky zákazníka – k potvrzení */
  suggestedAddress: { text: string; lat: number; lng: number } | null
  /** Místo u poskytovatele (provozovna) */
  placeText: string | null
  /** Kontakt poskytovatele – zákazník ho poprvé vidí tady (model §15) */
  provider: { name: string; phone: string | null; email: string | null }
}

type RecapResult = { success: true; recap: BookingRecap } | { success: false; error: string }

export async function getBookingRecap(
  orderId: string,
  /** Návrh termínu, který zákazník právě potvrzuje – může nést cenu upravenou poskytovatelem */
  proposalStart?: string | null,
): Promise<RecapResult> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx
  if (by !== 'customer') return { success: false, error: 'Rekapitulace je pro zákazníka objednávky.' }

  const { data: row } = await db
    .from('orders')
    .select('service_location, location_address, location_lat, location_lng, location_city, agreed_charge_halere, service_items(name, offer_kind, deposit_amount, quote_fee, deposit_type, quote_fee_deductible), services(title, location_type, address, city, phone)')
    .eq('id', orderId)
    .maybeSingle()
  const o = row as any
  const item = o?.service_items
  if (!item || !isOfferKind(item.offer_kind)) {
    return { success: false, error: 'Tuto objednávku nelze v novém modelu rezervovat.' }
  }
  // Upravená cena: z návrhu, který zákazník právě potvrzuje, jinak z už přijatého termínu.
  let agreedChargeHalere: number | null = o.agreed_charge_halere ?? null
  let priceNote: string | null = null
  if (proposalStart) {
    const { data: prop } = await db
      .from('order_time_proposals')
      .select('charge_halere, price_note')
      .eq('order_id', orderId)
      .eq('starts_at', new Date(proposalStart).toISOString())
      .maybeSingle()
    const pp = prop as { charge_halere: number | null; price_note: string | null } | null
    if (!pp) return { success: false, error: 'Tento termín už není v nabídce. Obnovte stránku.' }
    agreedChargeHalere = pp.charge_halere ?? null
    priceNote = pp.price_note ?? null
  }
  const charge = bookingCharge({ ...item, agreed_charge_halere: agreedChargeHalere })
  if (!charge.ok) return { success: false, error: charge.error }
  const basePrice = itemPriceKc(item)
  const originalChargeKc = agreedChargeHalere != null && basePrice != null && basePrice * 100 !== agreedChargeHalere ? basePrice : null

  const atCustomer = o.service_location
    ? o.service_location === 'u_zakaznika'
    : o.services?.location_type !== 'u_poskytovatele'

  // Adresa z poslední jiné objednávky zákazníka s přesnými souřadnicemi – jen k potvrzení.
  let suggestedAddress: BookingRecap['suggestedAddress'] = null
  if (atCustomer && !o.location_address) {
    const { data: prev } = await db
      .from('orders')
      .select('location_address, location_lat, location_lng')
      .eq('customer_id', userId)
      .neq('id', orderId)
      .not('location_lat', 'is', null)
      .not('location_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const p = prev as { location_address: string; location_lat: number; location_lng: number } | null
    if (p) suggestedAddress = { text: p.location_address, lat: p.location_lat, lng: p.location_lng }
  }

  // Kontakt poskytovatele: telefon z karty nebo profilu, e-mail z účtu.
  const { data: prof } = await db
    .from('profiles')
    .select('full_name, company_name, phone')
    .eq('id', order.provider_id)
    .maybeSingle()
  const pr = prof as { full_name: string | null; company_name: string | null; phone: string | null } | null
  let email: string | null = null
  try {
    const { data: authUser } = await db.auth.admin.getUserById(order.provider_id)
    email = authUser?.user?.email ?? null
  } catch {
    email = null
  }

  // Zámek termínu drží jen přímá rezervace před zahájením platby.
  const holdExpiresAt = order.booking_state === null && order.hold_expires_at ? order.hold_expires_at : null

  return {
    success: true,
    recap: {
      orderId,
      serviceId: order.service_id,
      offerKindTitle: OFFER_KIND_TITLE[charge.offerKind],
      itemName: item.name ?? o.services?.title ?? 'Služba',
      paymentLabel: paymentLabel(charge.offerKind),
      chargeKc: charge.commission.chargeHalere / 100,
      originalChargeKc,
      priceNote: originalChargeKc != null ? priceNote : null,
      paymentMeaning: paymentMeaning(charge.offerKind, item.quote_fee_deductible === true),
      deductionNote: quoteFeeDeductionNote(charge.offerKind, item.quote_fee_deductible === true),
      cancellationRules: cancellationRules(charge.offerKind),
      paymentNote: PAYMENT_NOTE,
      paymentShort: PAYMENT_SHORT,
      consentText: recapCheckbox(charge.offerKind),
      consentWhy: recapCheckboxWhy(charge.offerKind),
      withdrawalNote: withdrawalNote(charge.offerKind),
      submitLabel: submitLabel(charge.commission.chargeHalere / 100),
      scheduledAt: order.scheduled_at,
      scheduledEnd: order.scheduled_end,
      arrivalWindow: charge.offerKind === 'B',
      holdExpiresAt,
      atCustomer,
      addressRequiresCoords: charge.offerKind === 'B',
      address: o.location_address ? { text: o.location_address, lat: o.location_lat, lng: o.location_lng } : null,
      suggestedAddress,
      placeText: atCustomer ? null : (o.services?.address ?? o.services?.city ?? null),
      provider: {
        name: pr?.company_name || pr?.full_name || 'Poskytovatel',
        phone: o.services?.phone || pr?.phone || null,
        email,
      },
    },
  }
}

/**
 * Poslední krok průvodce: zaeviduje, že zákazník viděl shrnutí v aktuálním znění (order_events
 * „recap_accepted“), u výjezdu uloží žádost o provedení před uplynutím lhůty pro odstoupení
 * (booking_consents, model §17, VOP 9.6) a spustí platbu. Bez potvrzení se platba nespustí ani na serveru.
 */
export async function startBookingPayment(
  orderId: string,
  consent: boolean,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, by, userId } = ctx
  if (by !== 'customer') return { success: false, error: 'Platbu dokončuje zákazník.' }

  const { data: row } = await db.from('orders').select('agreed_charge_halere, service_items(offer_kind, quote_fee_deductible)').eq('id', orderId).maybeSingle()
  const kind = (row as any)?.service_items?.offer_kind
  if (!isOfferKind(kind)) return { success: false, error: 'Tuto objednávku nelze v novém modelu rezervovat.' }
  if (recapCheckbox(kind) && !consent) {
    return { success: false, error: 'Pro pokračování prosím zaškrtněte políčko ve shrnutí.' }
  }

  const h = headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const userAgent = h.get('user-agent')

  if (kind === 'B') {
    const { error } = await db.from('booking_consents').insert({
      user_id: userId,
      kind: 'customer_early_performance_request',
      document_version: RECAP_DOCUMENT_VERSION,
      order_id: orderId,
      ip,
      user_agent: userAgent,
    })
    if (error) {
      console.error('[booking] booking_consents:', error.message)
      return { success: false, error: 'Potvrzení se nepodařilo uložit. Zkuste to prosím znovu.' }
    }
  }

  // Evidence: shrnutí v tomto znění se zobrazilo a zákazník ho odeslal (VOP 7.8, 9.3).
  await logOrderEvent(db, orderId, 'recap_accepted', { type: 'customer', id: userId }, {
    document_version: RECAP_DOCUMENT_VERSION,
    offer_kind: kind,
    checkbox: recapCheckbox(kind),
    confirmed: consent,
    // Cena upravená poskytovatelem, kterou zákazník přijal (null = cena z nabídky)
    agreed_charge_halere: (row as any)?.agreed_charge_halere ?? null,
    // Výjezd: slib odečíst Cenu výjezdu z ceny zakázky, jak ho zákazník viděl (VOP 11.6)
    quote_fee_deductible: kind === 'B' ? (row as any)?.service_items?.quote_fee_deductible === true : null,
    ip,
    user_agent: userAgent,
  })

  return createDepositCheckout(orderId)
}

// ─── Nadcházející rezervace (výsuvný panel, lišta „Dorazte…“) ─────────────

export type UpcomingBooking = {
  orderId: string
  role: 'customer' | 'provider'
  itemName: string
  startIso: string
  endIso: string | null
  /** Výjezd: termín je okno příjezdu */
  arrivalWindow: boolean
  state: string
  /** Druhá strana (jméno zákazníka / poskytovatele) */
  counterpart: string
  /** Kam: u zákazníka jeho adresa (poskytovatel ji vidí po předautorizaci), jinak provozovna */
  place: string | null
}

/** Rezervace nového modelu, které ještě neskončily – pro přihlášeného uživatele v obou rolích. */
export async function getUpcomingBookings(): Promise<UpcomingBooking[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const db = adminDb()

  const { data } = await db
    .from('orders')
    .select('id, customer_id, provider_id, booking_state, offer_kind, scheduled_at, scheduled_end, service_location, location_address, location_city, service_items(name), services(title, address, city, location_type)')
    .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
    .in('booking_state', ['pending_payment', 'awaiting_confirmation', 'capture_in_progress', 'confirmed'])
    .not('scheduled_at', 'is', null)
    .gte('scheduled_end', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  // Jména druhých stran jedním dotazem
  const otherIds = Array.from(new Set(rows.map((r) => (r.customer_id === user.id ? r.provider_id : r.customer_id))))
  const { data: profs } = await db.from('profiles').select('id, full_name, company_name').in('id', otherIds)
  const names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.company_name || p.full_name || 'Uživatel']))

  return rows.map((r) => {
    const role: 'customer' | 'provider' = r.customer_id === user.id ? 'customer' : 'provider'
    const atCustomer = r.service_location
      ? r.service_location === 'u_zakaznika'
      : r.services?.location_type !== 'u_poskytovatele'
    // Přesnou adresu zákazníka poskytovatel uvidí až u předautorizované rezervace.
    const providerSeesAddress = r.booking_state !== 'pending_payment'
    const place = atCustomer
      ? (role === 'customer' || providerSeesAddress ? (r.location_address ?? r.location_city ?? null) : (r.location_city ?? null))
      : (r.services?.address ?? r.services?.city ?? null)
    return {
      orderId: r.id,
      role,
      itemName: r.service_items?.name || r.services?.title || 'Rezervace',
      startIso: r.scheduled_at,
      endIso: r.scheduled_end,
      arrivalWindow: r.offer_kind === 'B',
      state: r.booking_state,
      counterpart: names.get(role === 'customer' ? r.provider_id : r.customer_id) ?? 'Uživatel',
      place,
    }
  })
}