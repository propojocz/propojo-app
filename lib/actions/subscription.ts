'use server'
// lib/actions/subscription.ts
// Vytvoření Stripe Checkout session pro předplatné poskytovatele.
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PRICE_MONTHLY = process.env.STRIPE_PRICE_STANDARD_MONTHLY

type CheckoutResult = { success: true; url: string } | { success: false; error: string }

export async function createCheckoutSession(): Promise<CheckoutResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  if (!PRICE_MONTHLY) {
    console.error('[checkout] Chybí STRIPE_PRICE_STANDARD_MONTHLY v .env.local')
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

  // Vytvoříme Checkout session – režim subscription, trial 30 dní (1. měsíc zdarma)
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_MONTHLY, quantity: 1 }],
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