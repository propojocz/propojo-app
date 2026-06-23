// app/api/stripe/webhook/route.ts
// Stripe webhook – přijímá události o předplatném a zapisuje je do tabulky subscriptions.
// Ověřuje podpis (STRIPE_WEBHOOK_SECRET), aby nešlo podvrhnout falešnou událost.
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Náš jediný plán (Propojo Standard)
const PLAN_ID = 'd9df919b-ac0d-4a71-bf24-f3ee5cbefed3'

// Admin klient (service-role) – webhook běží mimo přihlášeného uživatele
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Zapíše/aktualizuje předplatné podle dat ze Stripe
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
    status: sub.status, // active, trialing, canceled, past_due, …
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    billing_period: 'monthly',
    updated_at: new Date().toISOString(),
  }

  // Máme už řádek pro tohle stripe_subscription_id? → update, jinak insert
  const { data: existing } = await admin
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle() as { data: { id: string } | null }

  if (existing) {
    await (admin.from('subscriptions') as any).update(row).eq('id', existing.id)
  } else {
    await (admin.from('subscriptions') as any).insert(row)
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

  // Ověření podpisu
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
        // Po dokončení checkoutu načteme předplatné a uložíme ho
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          await upsertSubscription(sub)
        }
        break
      }
      default:
        // Ostatní události ignorujeme
        break
    }
  } catch (err) {
    console.error('[webhook] Chyba zpracování:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}