'use server'
// lib/actions/deposit.ts
// Model v2: platba rezervace = preautorizace Rezervačního poplatku (A, C) / Ceny výjezdu (B)
// přímo na Stripe účtu providera (Direct Charge, manual capture). Propojo peníze nedrží;
// provize (application fee) vznikne až při capture po potvrzení providerem.
//
// Název funkce zůstává kvůli volajícím (rezervace času, okna, návrhy termínů, detail objednávky).
// Opakovaný pokus o platbu je podporovaný: nový checkout nahradí předchozí session a obnoví hold.

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { policySnapshot } from '@/lib/booking/policy'
import { RECAP_DOCUMENT_VERSION } from '@/lib/booking/texts'
import { bookingBufferMs } from '@/lib/booking/rules'
import {
  adminDb,
  applyTransition,
  checkNewBooking,
  createBookingCheckoutSession,
  expireCheckoutIfOpen,
  loadBookingOrder,
} from '@/lib/booking/payments'

type Result = { success: true; url: string } | { success: false; error: string }

export async function createDepositCheckout(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const db = adminDb()
  const order = await loadBookingOrder(db, orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) return { success: false, error: 'K této objednávce nemáte přístup.' }

  // Platit jde jen objednávku, kde rezervace ještě nevznikla nebo je rozpracovaná platba.
  const state = order.booking_state
  if (state !== null && state !== 'pending_payment' && state !== 'payment_expired') {
    return { success: false, error: 'Platba k této rezervaci už proběhla nebo už není možná.' }
  }

  const { data: itemRow } = await db
    .from('service_items')
    .select('name, item_type, offer_kind, deposit_amount, quote_fee, deposit_type, buffer_minutes, quote_fee_deductible')
    .eq('id', order.service_item_id ?? '')
    .maybeSingle()
  type ItemRow = {
    name: string | null; item_type: string | null; offer_kind: string | null
    deposit_amount: number | null; quote_fee: number | null; deposit_type: string | null; buffer_minutes: number | null
    quote_fee_deductible: boolean | null
  }
  // Objednávka z veřejné poptávky nemá položku z ceníku – typ a částku určila nabídka
  // poskytovatele (orders.offer_kind + agreed_charge_halere, 3d).
  let offerDeductible = false
  if (!itemRow && !order.service_item_id) {
    const { data: od } = await db.from('orders').select('quote_fee_deductible').eq('id', orderId).maybeSingle()
    offerDeductible = (od as { quote_fee_deductible: boolean | null } | null)?.quote_fee_deductible === true
  }
  const item: ItemRow | null = (itemRow as ItemRow | null) ?? (!order.service_item_id && (order.offer_kind === 'A' || order.offer_kind === 'B')
    ? {
        name: order.services?.title ?? null, item_type: 'service', offer_kind: order.offer_kind,
        deposit_amount: null, quote_fee: null, deposit_type: null, buffer_minutes: 0, quote_fee_deductible: offerDeductible,
      }
    : null)

  if (order.status !== 'prijato') {
    // U výrobku čekajícího na vyjádření poskytovatele je to očekávaný stav, ne chyba.
    const cekaNaPotvrzeni = order.status === 'cekajici' && item?.item_type === 'product'
    return {
      success: false,
      error: cekaNaPotvrzeni
        ? 'Platba se zpřístupní, jakmile poskytovatel objednávku potvrdí.'
        : 'Platbu lze dokončit až po domluvení termínu.',
    }
  }
  if (!item) return { success: false, error: 'Tuto objednávku nelze v novém modelu rezervovat.' }

  // Zákazník musel projít shrnutí v aktuálním znění (VOP 7.8) – eviduje ho krokový průvodce
  // (startBookingPayment). U výjezdu navíc výslovná žádost o provedení před uplynutím lhůty
  // pro odstoupení (model §17, VOP 9.6) v booking_consents.
  const { data: recapRows } = await db
    .from('order_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('type', 'recap_accepted')
    .eq('payload->>document_version', RECAP_DOCUMENT_VERSION)
    .limit(1)
  if (!recapRows || recapRows.length === 0) {
    return { success: false, error: 'Před platbou prosím projděte shrnutí objednávky a potvrďte ho.' }
  }
  if (item.offer_kind === 'B') {
    const { data: consentRows } = await db
      .from('booking_consents')
      .select('id')
      .eq('order_id', orderId)
      .eq('user_id', order.customer_id)
      .eq('kind', 'customer_early_performance_request')
      .eq('document_version', RECAP_DOCUMENT_VERSION)
      .limit(1)
    if (!consentRows || consentRows.length === 0) {
      return { success: false, error: 'Před platbou prosím ve shrnutí potvrďte žádost o provedení výjezdu.' }
    }
  }

  // Přímá rezervace času drží termín jen krátce. Po vypršení se musí vybrat znovu
  // (mezitím ho mohl dostat někdo jiný a stránka mohla zůstat otevřená).
  if (state === null && order.hold_expires_at && new Date(order.hold_expires_at).getTime() <= Date.now()) {
    const { data: created } = await db
      .from('order_events')
      .select('id')
      .eq('order_id', orderId)
      .eq('type', 'booking_created')
      .limit(1)
    if (order.slot_id || (created ?? []).length > 0) {
      return { success: false, error: 'Čas na dokončení rezervace vypršel. Vyberte prosím termín znovu.' }
    }
  }

  // Adresa: když se jede k zákazníkovi, musí být vyplněná – jinak by poskytovatel nevěděl kam.
  // Výjezd (B) navíc se souřadnicemi, jinak nejde ověřit check-in (korekce 5).
  {
    const { data: addr } = await db
      .from('orders')
      .select('service_location, location_address, location_lat, location_lng, services(location_type, city_lat, city_lng, radius_km)')
      .eq('id', orderId)
      .maybeSingle()
    const a = addr as {
      service_location: string | null
      location_address: string | null
      location_lat: number | null
      location_lng: number | null
      services: { location_type: string | null; city_lat: number | null; city_lng: number | null; radius_km: number | null } | null
    } | null
    const atCustomer = a?.service_location
      ? a.service_location === 'u_zakaznika'
      : a?.services?.location_type !== 'u_poskytovatele'
    if (item.offer_kind === 'B' && (a?.location_lat == null || a?.location_lng == null)) {
      return { success: false, error: 'Nejdřív prosím doplňte přesnou adresu výjezdu (vyberte ji ze seznamu).' }
    }
    if (atCustomer && !a?.location_address?.trim()) {
      return { success: false, error: 'Nejdřív prosím doplňte adresu, kam má poskytovatel přijet.' }
    }
    // Dosah poskytovatele podle přesné adresy – jen u přímé rezervace času, kde poskytovatel nic
    // nepotvrzoval. U domluveného termínu o vzdálenosti rozhodl poskytovatel sám (viděl ji v objednávce).
    const card = a?.services
    let primaRezervace = !!order.slot_id
    if (!primaRezervace) {
      const { data: created } = await db.from('order_events').select('id').eq('order_id', orderId).eq('type', 'booking_created').limit(1)
      primaRezervace = (created ?? []).length > 0
    }
    if (primaRezervace && atCustomer && a?.location_lat != null && a?.location_lng != null && card?.radius_km && card.city_lat != null && card.city_lng != null) {
      const R = 6371
      const dLat = ((a.location_lat - card.city_lat) * Math.PI) / 180
      const dLng = ((a.location_lng - card.city_lng) * Math.PI) / 180
      const x = Math.sin(dLat / 2) ** 2
        + Math.cos((card.city_lat * Math.PI) / 180) * Math.cos((a.location_lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
      const dist = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
      if (dist > card.radius_km) {
        return {
          success: false,
          error: `Adresa je mimo dosah poskytovatele (jezdí do ${card.radius_km} km, tahle je asi ${Math.round(dist)} km daleko).`,
        }
      }
    }
  }

  const start = order.scheduled_at ? new Date(order.scheduled_at) : null
  const end = order.scheduled_end ? new Date(order.scheduled_end) : null
  // Cena, kterou poskytovatel u této objednávky upravil a zákazník přijal s termínem (jinak cena z nabídky).
  const { data: agreedRow } = await db.from('orders').select('agreed_charge_halere').eq('id', orderId).maybeSingle()
  const agreedChargeHalere = (agreedRow as { agreed_charge_halere: number | null } | null)?.agreed_charge_halere ?? null
  const check = await checkNewBooking(db, {
    item: { ...item, agreed_charge_halere: agreedChargeHalere },
    providerId: order.provider_id,
    start,
    end,
  })
  if (!check.ok) return { success: false, error: check.error }

  // ── Je termín pořád volný? ──────────────────────────────────
  // Rezervace drží čas jen krátce; mezitím ho mohl zabrat někdo jiný.
  const ownEnd = end!.getTime() + Math.max(0, Number(item.buffer_minutes ?? 0)) * 60_000
  // Nabídka se „samostatným kalendářem“ koliduje jen se svými termíny (stejně jako free-times).
  let separateCalendar = false
  if (order.service_id) {
    try {
      const { data: svc } = await db.from('services').select('separate_calendar').eq('id', order.service_id).maybeSingle()
      separateCalendar = (svc as { separate_calendar?: boolean } | null)?.separate_calendar === true
    } catch { /* sloupec nemusí existovat */ }
  }
  let kolizeQuery = db
    .from('orders')
    .select('id, booking_state, offer_kind, scheduled_at, scheduled_end, deposit_status, hold_expires_at, service_items(duration_minutes, buffer_minutes)')
    .eq('provider_id', order.provider_id)
    .neq('status', 'zruseno')
    .neq('id', orderId)
    .not('scheduled_at', 'is', null)
    .lt('scheduled_at', new Date(ownEnd).toISOString())
  if (separateCalendar && order.service_id) kolizeQuery = kolizeQuery.eq('service_id', order.service_id)
  const { data: kolize } = await kolizeQuery
  const ted = Date.now()
  const zive = ((kolize ?? []) as any[]).filter((o) => {
    // Cizí rozpracovaná platba s prošlým zámkem termín nedrží.
    if (o.deposit_status === 'pending' && o.hold_expires_at && new Date(o.hold_expires_at).getTime() <= ted) return false
    const s = new Date(o.scheduled_at).getTime()
    const fallback = (Number(o.service_items?.duration_minutes ?? 60) || 60) * 60_000
    const e = (o.scheduled_end ? new Date(o.scheduled_end).getTime() : s + fallback) + bookingBufferMs(o)
    return s < ownEnd && e > start!.getTime()
  })
  if (zive.length > 0) {
    return { success: false, error: 'Tento termín byl mezitím zabraný. Vyberte prosím jiný – nic jsme vám neúčtovali.' }
  }

  // ── Předchozí checkout ──────────────────────────────────────
  // Když byl dokončený a jen ještě nedorazil webhook, druhou platbu nezakládáme.
  const previousSessionId = order.stripe_checkout_session_id
  const previousAccountId = order.stripe_account_id
  if (previousSessionId) {
    try {
      const previous = await stripe.checkout.sessions.retrieve(
        previousSessionId,
        undefined,
        previousAccountId ? { stripeAccount: previousAccountId } : undefined,
      )
      if (previous.status === 'complete') {
        return {
          success: false,
          error: 'Platba už byla odeslána. Chvíli počkejte a obnovte stránku – potvrzení se právě zpracovává.',
        }
      }
    } catch (err) {
      console.warn('[deposit] předchozí checkout nelze načíst:', err)
    }
  }

  const nazev = item.name || order.services?.title || 'služba'
  const { version, snapshot } = policySnapshot()

  try {
    const { session, holdUntil } = await createBookingCheckoutSession({
      orderId,
      accountId: check.accountId,
      offerKind: check.offerKind,
      itemName: nazev,
      commission: check.commission,
    })
    if (!session.url) return { success: false, error: 'Nepodařilo se vytvořit platbu.' }

    // Nejdřív označíme NOVOU session jako aktuální. Webhook staré session pak objednávku neukončí.
    const c = check.commission
    const started = await applyTransition(db, order, 'checkout_started', { type: 'customer', id: user.id }, {
      holdUntil,
      extra: {
        offer_kind: check.offerKind,
        stripe_account_id: check.accountId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: null,
        charge_halere: c.chargeHalere,
        application_fee_halere: c.applicationFeeHalere,
        commission_base_halere: c.baseHalere,
        commission_vat_halere: c.vatHalere,
        vat_rate_bps: c.vatRateBps,
        policy_version: version,
        policy_snapshot: snapshot,
        // Výjezd: slib započtení Ceny výjezdu tak, jak ho zákazník viděl před platbou (VOP 11.6)
        quote_fee_deductible: check.offerKind === 'B' ? item.quote_fee_deductible === true : null,
        // Legacy sloupec pro staré obrazovky (v Kč)
        deposit_amount: c.chargeHalere / 100,
      },
      payload: { session: session.id, charge_halere: c.chargeHalere },
    })

    if (!started.ok) {
      await expireCheckoutIfOpen(check.accountId, session.id)
      return { success: false, error: 'Platbu se nepodařilo připravit. Obnovte stránku a zkuste to znovu.' }
    }

    // Starý otevřený checkout zneplatníme, aby nešlo zaplatit dvakrát.
    if (previousSessionId && previousSessionId !== session.id) {
      await expireCheckoutIfOpen(previousAccountId, previousSessionId)
    }

    return { success: true, url: session.url }
  } catch (err) {
    console.error('[deposit] Stripe error:', err)
    return { success: false, error: 'Platbu se nepodařilo spustit. Zkuste to znovu.' }
  }
}
