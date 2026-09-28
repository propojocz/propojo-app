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
    .select('name, item_type, offer_kind, deposit_amount, quote_fee, deposit_type, buffer_minutes')
    .eq('id', order.service_item_id ?? '')
    .maybeSingle()
  const item = itemRow as {
    name: string | null; item_type: string | null; offer_kind: string | null
    deposit_amount: number | null; quote_fee: number | null; deposit_type: string | null; buffer_minutes: number | null
  } | null

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

  const start = order.scheduled_at ? new Date(order.scheduled_at) : null
  const end = order.scheduled_end ? new Date(order.scheduled_end) : null
  const check = await checkNewBooking(db, { item, providerId: order.provider_id, start, end })
  if (!check.ok) return { success: false, error: check.error }

  // ── Je termín pořád volný? ──────────────────────────────────
  // Rezervace drží čas jen krátce; mezitím ho mohl zabrat někdo jiný.
  const ownEnd = end!.getTime() + Math.max(0, Number(item.buffer_minutes ?? 0)) * 60_000
  const { data: kolize } = await db
    .from('orders')
    .select('id, booking_state, offer_kind, scheduled_at, scheduled_end, deposit_status, hold_expires_at, service_items(duration_minutes, buffer_minutes)')
    .eq('provider_id', order.provider_id)
    .neq('status', 'zruseno')
    .neq('id', orderId)
    .not('scheduled_at', 'is', null)
    .lt('scheduled_at', new Date(ownEnd).toISOString())
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
