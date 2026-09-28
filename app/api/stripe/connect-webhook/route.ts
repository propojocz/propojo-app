// app/api/stripe/connect-webhook/route.ts
// Model v2: události z PŘIPOJENÝCH účtů providerů (Connect Standard, Direct Charges).
// Checkout i PaymentIntent vznikají na účtu providera, takže jejich události sem chodí
// zvlášť od webhooku platformy (/api/stripe/webhook) a mají vlastní signing secret.
//
// Stav plateb se řídí jen těmito událostmi – včetně toho, co provider udělá sám
// ve svém Stripe Dashboardu (capture = potvrzení, zrušení preautorizace = odmítnutí, refund).
//
// Každá událost se zpracuje nejvýš jednou (tabulka stripe_events). Při chybě vracíme 500,
// aby Stripe událost poslal znovu – všechny kroky jsou opakovatelné.

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import {
  adminDb,
  handleAuthorized,
  handleAuthorizationCanceled,
  handleCaptured,
  handleChargeRefunded,
  handleCheckoutExpired,
  handleDispute,
  handleRefund,
  syncStripeAccount,
  type Db,
} from '@/lib/booking/payments'

export const dynamic = 'force-dynamic'

async function processEvent(db: Db, event: Stripe.Event, accountId: string) {
  const opts = { stripeAccount: accountId }

  switch (event.type) {
    // U manual capture chodí completed s payment_status 'unpaid' – rozhoduje stav PaymentIntentu.
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const id = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
      if (!id) break
      const pi = await stripe.paymentIntents.retrieve(id, undefined, opts)
      await handleAuthorized(db, accountId, pi, session.id)
      break
    }

    case 'payment_intent.amount_capturable_updated':
      await handleAuthorized(db, accountId, event.data.object as Stripe.PaymentIntent)
      break

    case 'checkout.session.expired':
      await handleCheckoutExpired(db, event.data.object as Stripe.Checkout.Session)
      break

    case 'payment_intent.succeeded':
      await handleCaptured(db, accountId, event.data.object as Stripe.PaymentIntent, new Date(event.created * 1000))
      break

    case 'payment_intent.canceled':
      await handleAuthorizationCanceled(db, event.data.object as Stripe.PaymentIntent)
      break

    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
      await handleRefund(db, accountId, event.data.object as Stripe.Refund)
      break

    case 'charge.refunded':
      await handleChargeRefunded(db, accountId, event.data.object as Stripe.Charge)
      break

    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
      await handleDispute(db, event.data.object as Stripe.Dispute)
      break

    // Stav účtu se vždy načte čerstvě ze Stripe – událost může dorazit pozdě,
    // mimo pořadí nebo znovu (resend) a nesmí přepsat novější stav starým.
    case 'account.updated':
    case 'capability.updated':
      await syncStripeAccount(db, await stripe.accounts.retrieve(accountId))
      break

    case 'account.application.deauthorized': {
      const now = new Date().toISOString()
      await db
        .from('stripe_accounts')
        .update({ deauthorized_at: now, charges_enabled: false, updated_at: now })
        .eq('stripe_account_id', accountId)
      break
    }

    default:
      // payment_intent.payment_failed apod.: stav rezervace nemění
      break
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = headers().get('stripe-signature')
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET

  // Ping bez podpisu při ukládání endpointu – musí dostat 2xx, nic se nezpracuje.
  if (!sig) return NextResponse.json({ received: true, note: 'ping without signature' })

  if (!secret) {
    console.error('[connect-webhook] Chybí STRIPE_CONNECT_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'Konfigurace webhooku chybí' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    console.error('[connect-webhook] Neplatný podpis:', err)
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 400 })
  }

  const accountId = event.account
  if (!accountId) {
    // Událost platformy sem nepatří (má vlastní endpoint)
    return NextResponse.json({ received: true, note: 'not a connected account event' })
  }

  const db = adminDb()

  // Idempotence: stejná událost se zpracuje jen jednou
  const { error: insertError } = await db
    .from('stripe_events')
    .insert({ event_id: event.id, account_id: accountId, type: event.type })
  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('[connect-webhook] stripe_events:', insertError.message)
      return NextResponse.json({ error: 'DB' }, { status: 500 })
    }
    const { data: seen } = await db
      .from('stripe_events')
      .select('processed_at')
      .eq('event_id', event.id)
      .maybeSingle()
    if ((seen as { processed_at: string | null } | null)?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true })
    }
    // Předchozí pokus selhal – zpracujeme znovu (kroky jsou opakovatelné)
  }

  try {
    await processEvent(db, event, accountId)
    await db
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('event_id', event.id)
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[connect-webhook] Chyba při zpracování:', event.type, event.id, err)
    await db.from('stripe_events').update({ error: message.slice(0, 1000) }).eq('event_id', event.id)
    return NextResponse.json({ error: 'processing error' }, { status: 500 })
  }
}
