'use server'
// lib/actions/subscription.ts
// Stripe: vytvoření Checkout session (aktivace, měsíčně/ročně) a Customer Portal (správa/zrušení).
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PRICE_MONTHLY = process.env.STRIPE_PRICE_STANDARD_MONTHLY
const PRICE_YEARLY = process.env.STRIPE_PRICE_STANDARD_YEARLY

type CheckoutResult = { success: true; url: string } | { success: false; error: string }
type Billing = 'monthly' | 'yearly'

export async function createCheckoutSession(billing: Billing = 'monthly'): Promise<CheckoutResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const priceId = billing === 'yearly' ? PRICE_YEARLY : PRICE_MONTHLY
  if (!priceId) {
    console.error('[checkout] Chybí price ID pro', billing, 'v .env.local')
    return { success: false, error: 'Předplatné není správně nastaveno.' }
  }

  // Ověříme, že je to poskytovatel (předplatné je jen pro ně)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider, full_name')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean; full_name: string | null } | null }

  if (profile?.is_provider !== true) {
    return { success: false, error: 'Předplatné je určeno pro poskytovatele.' }
  }

  // Máme už uložené Stripe customer ID? (ať nezakládáme duplicitního zákazníka)
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .not('stripe_customer_id', 'is', null)
    .limit(1)
    .maybeSingle() as { data: { stripe_customer_id: string | null } | null }

  let customerId = existingSub?.stripe_customer_id ?? undefined

  // Když ještě nemá Stripe zákazníka, vytvoříme ho
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: profile.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
  }

  // Vytvoříme Checkout session – režim subscription, trial 30 dní (1. měsíc/rok zdarma)
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { supabase_user_id: user.id },
      },
      success_url: `${APP_URL}/dashboard/predplatne?stav=uspech`,
      cancel_url: `${APP_URL}/dashboard/predplatne?stav=zruseno`,
      locale: 'cs',
      metadata: { supabase_user_id: user.id },
    })

    if (!session.url) return { success: false, error: 'Nepodařilo se vytvořit platbu.' }
    return { success: true, url: session.url }
  } catch (err) {
    console.error('[checkout] Stripe error:', err)
    return { success: false, error: 'Platbu se nepodařilo spustit. Zkuste to prosím znovu.' }
  }
}

// Vytvoří odkaz do Stripe Customer Portal (správa/zrušení předplatného, změna karty, faktury).
export async function createPortalSession(): Promise<CheckoutResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  // Najdeme Stripe customer ID uživatele
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { stripe_customer_id: string | null } | null }

  const customerId = sub?.stripe_customer_id
  if (!customerId) {
    return { success: false, error: 'Nemáte aktivní předplatné ke správě.' }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/dashboard/predplatne`,
      locale: 'cs',
    })
    return { success: true, url: session.url }
  } catch (err) {
    console.error('[portal] Stripe error:', err)
    return { success: false, error: 'Správu předplatného se nepodařilo otevřít. Zkuste to znovu.' }
  }
}