// app/api/stripe/webhook/route.ts
// Stripe webhook – zpracovává PŘEDPLATNÉ (subscriptions) i ZÁLOHY za objednávky (deposit).
// Rozlišuje podle metadata.kind a typu události. Ověřuje podpis.
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const PLAN_ID = 'd9df919b-ac0d-4a71-bf24-f3ee5cbefed3'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── PŘEDPLATNÉ ────────────────────────────────────────────
async function upsertSubscription(sub: Stripe.Subscription) {
  const admin = getAdminClient()
  const userId = sub.metadata?.supabase_user_id

  if (!userId) {
    console.error('[webhook] Subscription bez supabase_user_id v metadata:', sub.id)
    return
  }

  const item = sub.items.data[0]
  const periodEnd = item?.current_period_end ?? null

  const row = {
    user_id: userId,
    plan_id: PLAN_ID,
    status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    billing_period: item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
    updated_at: new Date().toISOString(),
  }

  const { error } = await (admin.from('subscriptions') as any)
    .upsert(row, { onConflict: 'stripe_subscription_id' })

  if (error) console.error('[webhook] subscription upsert error:', error)
}

// ── ZÁLOHA ZA OBJEDNÁVKU ──────────────────────────────────
async function markDepositPaid(orderId: string, paymentIntentId: string | null) {
  const admin = getAdminClient()

  const { error } = await (admin.from('orders') as any)
    .update({
      deposit_status: 'paid',
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq('id', orderId)

  if (error) {
    console.error('[webhook] deposit update error:', error)
    return
  }

  // Upozornění poskytovateli – se jménem zákazníka pro rychlý přehled
  try {
    const { data: order } = await admin
      .from('orders')
      .select('provider_id, customer_id, deposit_amount, services(title, payment_model)')
      .eq('id', orderId)
      .single() as { data: any }

    if (order?.provider_id) {
      const isModelB = order.services?.payment_model === 'B'
      const castka = order.deposit_amount ? `${Number(order.deposit_amount).toLocaleString('cs-CZ')} Kč` : ''

      // Jméno zákazníka (plátce)
      let jmeno = 'Zákazník'
      if (order.customer_id) {
        const { data: cust } = await admin
          .from('profiles').select('full_name').eq('id', order.customer_id).single() as { data: { full_name: string | null } | null }
        if (cust?.full_name) jmeno = cust.full_name
      }

      const titulek = isModelB
        ? `${jmeno} uhradil poplatek za výjezd ${castka}`
        : `${jmeno} uhradil zálohu ${castka}`

      await (admin.from('notifications') as any).insert({
        user_id: order.provider_id,
        type: 'status_change',
        order_id: orderId,
        actor_id: order.customer_id,
        title: titulek,
        preview: order.services?.title ?? null,
      })
    }
  } catch (err) {
    console.error('[webhook] deposit notifikace error:', err)
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[webhook] Chybí STRIPE_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Neplatný podpis:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await upsertSubscription(sub)
        break
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const kind = session.metadata?.kind

        if (kind === 'deposit') {
          const orderId = session.metadata?.order_id
          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null
          if (orderId) {
            await markDepositPaid(orderId, paymentIntentId)
          }
        } else if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          await upsertSubscription(sub)
        }
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[webhook] Chyba zpracování:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}