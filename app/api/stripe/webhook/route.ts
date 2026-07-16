// app/api/stripe/webhook/route.ts
//
// Stripe webhook — Stripe sem POSÍLÁ události (platba proběhla, předplatné
// zrušeno, karta selhala…). Bez tohoto endpointu se po zaplacení NIC nestane:
// předplatné se neaktivuje, zálohy se nepotvrdí. Proto je nezbytný před spuštěním.
//
// BEZPEČNOST: každou událost ověřujeme podpisem (STRIPE_WEBHOOK_SECRET).
// Bez ověření by kdokoli mohl poslat falešné „předplatné aktivováno" bez placení.
//
// Zapisujeme přes SERVICE ROLE (webhook nemá přihlášeného uživatele) — a navíc
// service role obchází ochranný trigger na profiles.

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import {
  subscriptionStartedEmail,
  subscriptionCanceledEmail,
  paymentFailedEmail,
} from '@/lib/email/templates'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function sendMail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: 'Propojo <notifikace@propojo.cz>', to, subject, html })
  } catch (err) {
    console.error('[webhook] e-mail:', err)
  }
}

// Formát ceny do e-mailu podle období
function priceText(billing: string | null): string {
  return billing === 'yearly' ? '2 990 Kč/rok' : '299 Kč/měsíc'
}

// Najde e-mail a jméno poskytovatele podle user_id
async function getProvider(db: ReturnType<typeof admin>, userId: string) {
  const { data } = await db.from('profiles').select('full_name').eq('id', userId).single() as { data: any }
  const { data: authUser } = await db.auth.admin.getUserById(userId)
  return {
    name: (data?.full_name as string) ?? 'Poskytovatel',
    email: authUser?.user?.email ?? null,
  }
}

// Z Stripe subscription objektu složí řádek pro naši tabulku
function subRow(sub: Stripe.Subscription, userId: string, billing: string | null) {
  const item = sub.items.data[0]
  return {
    user_id: userId,
    status: sub.status, // 'trialing' | 'active' | 'past_due' | 'canceled' …
    billing_period: billing,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  }
}

// Období odvodíme z ceny (interval), ať to nemusíme tahat z metadat
function billingFromSub(sub: Stripe.Subscription): string {
  const interval = sub.items.data[0]?.price?.recurring?.interval
  return interval === 'year' ? 'yearly' : 'monthly'
}

// Uloží/aktualizuje předplatné. Když řádek pro subscription existuje, přepíše ho;
// jinak založí nový. (upsert podle stripe_subscription_id)
async function upsertSubscription(db: ReturnType<typeof admin>, sub: Stripe.Subscription, userId: string) {
  const billing = billingFromSub(sub)
  const row = subRow(sub, userId, billing)

  // Existuje už řádek pro tohle subscription?
  const { data: existing } = await db
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle() as { data: { id: string } | null }

  if (existing) {
    await (db.from('subscriptions') as any).update(row).eq('id', existing.id)
  } else {
    await (db.from('subscriptions') as any).insert(row)
  }
  return billing
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = headers().get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret || !sig) {
    console.error('[webhook] Chybí STRIPE_WEBHOOK_SECRET nebo podpis')
    return NextResponse.json({ error: 'Konfigurace webhooku chybí' }, { status: 400 })
  }

  // 1) OVĚŘENÍ PODPISU — bez tohoto by šlo podvrhnout jakoukoli událost
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    console.error('[webhook] Neplatný podpis:', err)
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 400 })
  }

  const db = admin()

  try {
    switch (event.type) {
      // ── Předplatné zaplaceno (Checkout dokončen) ──────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const userId = session.metadata?.supabase_user_id
        if (!userId || !session.subscription) break

        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const billing = await upsertSubscription(db, sub, userId)

        // Uvítací e-mail k předplatnému
        const p = await getProvider(db, userId)
        if (p.email) {
          const isTrial = sub.status === 'trialing'
          const { subject, html } = subscriptionStartedEmail({
            providerName: p.name,
            isTrial,
            trialEndsAt: sub.trial_end
              ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long' }).format(new Date(sub.trial_end * 1000))
              : undefined,
            priceText: priceText(billing),
            dashboardUrl: `${APP_URL}/dashboard/predplatne`,
          })
          await sendMail(p.email, subject, html)
        }
        break
      }

      // ── Změna předplatného (obnovení, konec trialu, změna karty…) ──
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.supabase_user_id
        if (userId) await upsertSubscription(db, sub, userId)
        break
      }

      // ── Zrušení předplatného ──────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.supabase_user_id
        if (!userId) break

        // Status na 'canceled' → nabídky zmizí z marketplace (filtr bere jen active/trialing)
        await (db.from('subscriptions') as any)
          .update({ status: 'canceled', cancel_at_period_end: true, updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id)

        const p = await getProvider(db, userId)
        if (p.email) {
          const { subject, html } = subscriptionCanceledEmail({
            providerName: p.name,
            activeUntil: new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long' }).format(
              new Date(sub.current_period_end * 1000)
            ),
            subscriptionUrl: `${APP_URL}/dashboard/predplatne`,
          })
          await sendMail(p.email, subject, html)
        }
        break
      }

      // ── Platba předplatného selhala ───────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break

        // Najdeme uživatele podle customer ID
        const { data: sub } = await db
          .from('subscriptions')
          .select('user_id, billing_period')
          .eq('stripe_customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle() as { data: { user_id: string; billing_period: string | null } | null }

        if (!sub) break
        const p = await getProvider(db, sub.user_id)
        if (p.email) {
          const { subject, html } = paymentFailedEmail({
            providerName: p.name,
            priceText: priceText(sub.billing_period),
            retryDate: invoice.next_payment_attempt
              ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long' }).format(new Date(invoice.next_payment_attempt * 1000))
              : undefined,
            subscriptionUrl: `${APP_URL}/dashboard/predplatne`,
          })
          await sendMail(p.email, subject, html)
        }
        break
      }

      // ── Connect účet dokončen (napojení banky) ────────────────────
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const userId = account.metadata?.supabase_user_id
        if (!userId) break

        await (db.from('profiles') as any)
          .update({
            stripe_onboarding_done: account.details_submitted === true,
            stripe_payouts_enabled: account.payouts_enabled === true,
          })
          .eq('id', userId)
        break
      }

      default:
        // Ostatní události ignorujeme (Stripe jich posílá spoustu)
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhook] Chyba při zpracování:', event.type, err)
    // 200 i při chybě zpracování — ať Stripe událost nezkouší donekonečna.
    // (Chybu si zalogujeme a vyřešíme sami.)
    return NextResponse.json({ received: true, warning: 'processing error' })
  }
}