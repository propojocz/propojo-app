// lib/booking/request-selection.ts
// Objednávka z veřejné poptávky (10. 10. 2026, Matej): poskytovatele jde vybrat jen spolu s termínem
// a poptávka se ostatním poskytovatelům uzavře až ZAPLACENÍM (preautorizací), ne výběrem.
//
// Průběh:
//   1) zákazník v chatu jednání klikne „Vybrat a rezervovat“ u navrženého termínu
//      → createDraftOrderFromResponse: rozpracovaná objednávka + návrh termínu, poptávka zůstává otevřená,
//        ostatní jednání běží dál; vazbu objednávka → poptávka drží order_events ('created_from_request');
//   2) zákazník projde shrnutí (adresa, kontakt, souhlasy) a zaplatí;
//   3) preautorizace (handleAuthorized) → requestStillAvailable ověří, že poptávku mezitím nevyřídila
//      jiná platba, a finalizeRequestSelection ji uzavře: chat se přenese do objednávky, vybraná reakce
//      'selected', ostatní 'not_selected', jiné rozpracované objednávky z téže poptávky se zruší.
// Volá se jen ze serveru (server actions, webhook) s ověřenými účastníky.

import type { Db } from './payments'
import { applyTransition, expireCheckoutIfOpen, loadBookingOrder, logOrderEvent } from './payments'

const ACTIVE = ['interested', 'negotiating']

type Link = { requestId: string; responseId: string; conversationId: string | null }

/** Z které poptávky / reakce objednávka vznikla (null = nevznikla z poptávky) */
export async function requestLinkOf(db: Db, orderId: string): Promise<Link | null> {
  const { data } = await db
    .from('order_events')
    .select('payload')
    .eq('order_id', orderId)
    .eq('type', 'created_from_request')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const p = (data as { payload: any } | null)?.payload
  if (!p?.request_id || !p?.response_id) return null
  return { requestId: p.request_id, responseId: p.response_id, conversationId: p.conversation_id ?? null }
}

type DraftResult = { ok: true; orderId: string } | { ok: false; error: string }

/**
 * Rozpracovaná objednávka z reakce na poptávku. Poptávka i ostatní jednání zůstávají otevřené.
 * Když už pro tutéž reakci rozpracovaná (nezaplacená) objednávka existuje, použije se znovu.
 */
export async function createDraftOrderFromResponse(
  db: Db,
  args: { requestId: string; responseId: string; conversationId: string; customerId: string },
): Promise<DraftResult> {
  const { data: req } = await db
    .from('requests')
    .select('id, customer_id, status, expires_at, description, city, address, address_lat, address_lng')
    .eq('id', args.requestId)
    .maybeSingle()
  const r = req as {
    id: string; customer_id: string | null; status: string; expires_at: string | null; description: string | null; city: string | null
    address: string | null; address_lat: number | null; address_lng: number | null
  } | null
  if (!r || r.customer_id !== args.customerId) return { ok: false, error: 'Poptávka nebyla nalezena.' }
  if (r.status !== 'open' || (r.expires_at && new Date(r.expires_at).getTime() < Date.now())) {
    return { ok: false, error: 'Tahle poptávka už není otevřená.' }
  }

  const { data: resp } = await db
    .from('request_responses')
    .select('id, request_id, provider_id, service_id, status, offer_kind, charge_halere, quote_fee_deductible, place, place_address, place_lat, place_lng')
    .eq('id', args.responseId)
    .maybeSingle()
  const rr = resp as {
    id: string; request_id: string; provider_id: string; service_id: string | null; status: string
    offer_kind: string | null; charge_halere: number | null; quote_fee_deductible: boolean | null
    place: string | null; place_address: string | null; place_lat: number | null; place_lng: number | null
  } | null
  if (!rr || rr.request_id !== args.requestId) return { ok: false, error: 'Reakce k této poptávce nepatří.' }
  if (!ACTIVE.includes(rr.status)) return { ok: false, error: 'Tento poskytovatel už není ve hře.' }
  if ((rr.offer_kind !== 'A' && rr.offer_kind !== 'B') || !rr.charge_halere) {
    return { ok: false, error: 'Tento poskytovatel zatím neuvedl, kolik se platí přes Propojo. Napište mu, ať nabídku doplní.' }
  }

  // Rozpracovaná objednávka k téže reakci (zákazník se vrací k jinému termínu) → znovu použít
  const { data: prev } = await db
    .from('order_events')
    .select('order_id, payload')
    .eq('type', 'created_from_request')
    .eq('payload->>response_id', rr.id)
    .order('occurred_at', { ascending: false })
    .limit(5)
  for (const e of (prev ?? []) as Array<{ order_id: string }>) {
    const { data: o } = await db.from('orders').select('id, status, booking_state').eq('id', e.order_id).maybeSingle()
    const ord = o as { id: string; status: string; booking_state: string | null } | null
    if (ord && ord.status !== 'zruseno' && (ord.booking_state === null || ord.booking_state === 'payment_expired' || ord.booking_state === 'pending_payment')) {
      // Zákazník se vrátil do chatu uprostřed platby (jiný termín) → rozpracovanou platbu uvolnit
      await resetDraftPayment(db, ord.id, args.customerId)
      // Adresa doplněná mezitím v chatu → do objednávky (jen u zákazníka a jen když tam ještě není)
      if (r.address && rr.place !== 'u_poskytovatele') {
        await db.from('orders')
          .update({ location_address: r.address, location_lat: r.address_lat, location_lng: r.address_lng })
          .eq('id', ord.id)
          .is('location_address', null)
      }
      return { ok: true, orderId: ord.id }
    }
  }

  const atProvider = rr.place === 'u_poskytovatele'
  const { data: order, error } = await db
    .from('orders')
    .insert({
      service_id: rr.service_id, // může být null – reakce bez karty (obecná nabídka)
      provider_id: rr.provider_id,
      customer_id: args.customerId,
      status: 'cekajici',
      is_inquiry: false,
      location_city: r.city ?? null,
      // Místo konání z nabídky; bez údaje se řídí kartou (u karty bez typu = u zákazníka)
      service_location: rr.place ?? null,
      // U zákazníka: přesná adresa z poptávky (ve shrnutí ji jen potvrdí). U provozovny: adresa z nabídky.
      location_address: atProvider ? null : (r.address ?? null),
      location_lat: atProvider ? null : (r.address ? r.address_lat : null),
      location_lng: atProvider ? null : (r.address ? r.address_lng : null),
      provider_place_address: atProvider ? rr.place_address : null,
      provider_place_lat: atProvider ? rr.place_lat : null,
      provider_place_lng: atProvider ? rr.place_lng : null,
      description: r.description ?? null,
      offer_kind: rr.offer_kind,
      agreed_charge_halere: rr.charge_halere,
      quote_fee_deductible: rr.offer_kind === 'B' ? rr.quote_fee_deductible === true : null,
    })
    .select('id')
    .single()
  if (error || !order) {
    console.error('[request-selection] objednávka', error)
    return { ok: false, error: 'Nepodařilo se vytvořit objednávku.' }
  }
  const orderId = (order as { id: string }).id
  await logOrderEvent(db, orderId, 'created_from_request', { type: 'customer', id: args.customerId }, {
    request_id: args.requestId, response_id: rr.id, conversation_id: args.conversationId,
  })
  return { ok: true, orderId }
}

/**
 * Rozpracované objednávky z poptávky (zákazník vybral termín, ale ještě nezaplatil).
 * Klíč = id poptávky / reakce, hodnota = id nejnovější takové objednávky. Pro odkazy „Dokončit rezervaci“.
 */
export async function draftOrdersBy(db: Db, key: 'request_id' | 'response_id', ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const { data: ev } = await db
    .from('order_events')
    .select('order_id, payload, occurred_at')
    .eq('type', 'created_from_request')
    .in(`payload->>${key}`, ids)
    .order('occurred_at', { ascending: false })
  const events = (ev ?? []) as Array<{ order_id: string; payload: any }>
  if (events.length === 0) return out
  const { data: ords } = await db
    .from('orders')
    .select('id, status, booking_state')
    .in('id', Array.from(new Set(events.map((e) => e.order_id))))
  const open = new Set(((ords ?? []) as Array<{ id: string; status: string; booking_state: string | null }>)
    .filter((o) => o.status !== 'zruseno' && (o.booking_state === null || o.booking_state === 'payment_expired' || o.booking_state === 'pending_payment'))
    .map((o) => o.id))
  for (const e of events) {
    const k = e.payload?.[key]
    if (k && open.has(e.order_id) && !out.has(k)) out.set(k, e.order_id)
  }
  return out
}

/**
 * Rozpracovaná objednávka z poptávky uprostřed platby (Stripe Checkout otevřený nebo opuštěný) →
 * zavřít platební stránku a vrátit ji do domluvy (payment_expired), ať jde zvolit termín znovu.
 */
export async function resetDraftPayment(db: Db, orderId: string, customerId: string): Promise<void> {
  const order = await loadBookingOrder(db, orderId)
  if (!order || order.booking_state !== 'pending_payment') return
  if (order.stripe_checkout_session_id) await expireCheckoutIfOpen(order.stripe_account_id, order.stripe_checkout_session_id)
  await applyTransition(db, order, 'checkout_expired', { type: 'customer', id: customerId }, { payload: { reason: 'back_to_chat' } })
}

/** Objednávka z poptávky, která ještě není zaplacená (předautorizovaná) – žije jen v chatu jednání */
export function isUnpaidDraftState(bookingState: string | null | undefined): boolean {
  return bookingState == null || bookingState === 'payment_expired' || bookingState === 'pending_payment'
}

/** Smí se platba této objednávky přijmout? (Poptávku mezitím nevyřídila jiná platba.) */
export async function requestStillAvailable(db: Db, orderId: string): Promise<boolean> {
  const link = await requestLinkOf(db, orderId)
  if (!link) return true
  const { data } = await db.from('requests').select('status, selected_response_id').eq('id', link.requestId).maybeSingle()
  const r = data as { status: string; selected_response_id: string | null } | null
  if (!r) return false
  if (r.status === 'selected') return r.selected_response_id === link.responseId
  return r.status === 'open'
}

/**
 * Zaplaceno (preautorizováno) → poptávka je vyřízená. Přenese chat do objednávky, vybraná reakce
 * 'selected', ostatní aktivní 'not_selected', jiné rozpracované objednávky z téže poptávky zruší.
 * Opakované volání nic nezdvojí.
 */
export async function finalizeRequestSelection(db: Db, orderId: string): Promise<void> {
  const link = await requestLinkOf(db, orderId)
  if (!link) return
  const now = new Date().toISOString()

  const { data: reqRow } = await db.from('requests').select('status, selected_response_id, customer_id').eq('id', link.requestId).maybeSingle()
  const req = reqRow as { status: string; selected_response_id: string | null; customer_id: string | null } | null
  if (!req) return
  if (req.status === 'selected' && req.selected_response_id === link.responseId) return // už hotovo

  // Chat jednání → do objednávky (i dosavadní zprávy), s předělem v historii
  if (link.conversationId) {
    await db.from('conversations').update({ order_id: orderId }).eq('id', link.conversationId)
    await db.from('messages').update({ order_id: orderId }).eq('conversation_id', link.conversationId).is('order_id', null)
    await db.from('messages').insert({
      conversation_id: link.conversationId,
      order_id: orderId,
      sender_id: req.customer_id,
      type: 'order_created',
      content: 'Zákazník vybral termín a zaplatil – vznikla rezervace. Propojo vás propojilo, teď už je domluva na vás. Psát si můžete dál tady.',
    })
  }

  await db.from('requests').update({ status: 'selected', selected_response_id: link.responseId, updated_at: now }).eq('id', link.requestId)
  await db.from('request_responses').update({ status: 'selected', updated_at: now }).eq('id', link.responseId)
  await db.from('request_responses')
    .update({ status: 'not_selected', updated_at: now })
    .eq('request_id', link.requestId)
    .neq('id', link.responseId)
    .in('status', ACTIVE)

  // Jiné rozpracované (nezaplacené) objednávky z téže poptávky zrušit
  const { data: others } = await db
    .from('order_events')
    .select('order_id')
    .eq('type', 'created_from_request')
    .eq('payload->>request_id', link.requestId)
  for (const e of (others ?? []) as Array<{ order_id: string }>) {
    if (e.order_id === orderId) continue
    await db.from('orders')
      .update({ status: 'zruseno' })
      .eq('id', e.order_id)
      .neq('status', 'zruseno')
      .or('booking_state.is.null,booking_state.eq.payment_expired')
  }

  await logOrderEvent(db, orderId, 'request_selection_finalized', { type: 'system' }, {
    request_id: link.requestId, response_id: link.responseId,
  })
}
