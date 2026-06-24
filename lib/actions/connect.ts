'use server'
// lib/actions/connect.ts
// Stripe Connect (Express) – napojení poskytovatele, aby mohl dostávat peníze ze záloh.
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type LinkResult = { success: true; url: string } | { success: false; error: string }

// Vytvoří (nebo najde) Express účet poskytovatele a vrátí odkaz na onboarding.
export async function createConnectOnboardingLink(): Promise<LinkResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider, stripe_account_id, full_name, ico')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean; stripe_account_id: string | null; full_name: string | null; ico: string | null } | null }

  if (profile?.is_provider !== true) {
    return { success: false, error: 'Napojení účtu je určeno pro poskytovatele.' }
  }

  let accountId = profile.stripe_account_id ?? undefined

  // Když ještě nemá Connect účet, vytvoříme Express účet pro Česko
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CZ',
        email: user.email ?? undefined,
        business_type: 'individual',
        capabilities: {
          transfers: { requested: true }, // chceme mu posílat peníze (transfery)
        },
        business_profile: {
          name: profile.full_name ?? undefined,
        },
        metadata: { supabase_user_id: user.id },
      })
      accountId = account.id

      // Uložíme account ID (přes admin klienta, ať to projde RLS)
      const admin = getAdminClient()
      await (admin.from('profiles') as any)
        .update({ stripe_account_id: accountId })
        .eq('id', user.id)
    } catch (err) {
      console.error('[connect] accounts.create error:', err)
      return { success: false, error: 'Nepodařilo se založit účet pro výplaty.' }
    }
  }

  // Vygenerujeme onboarding odkaz (account link)
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/dashboard/vyplaty?stav=obnova`,
      return_url: `${APP_URL}/dashboard/vyplaty?stav=hotovo`,
      type: 'account_onboarding',
    })
    return { success: true, url: link.url }
  } catch (err) {
    console.error('[connect] accountLinks.create error:', err)
    return { success: false, error: 'Nepodařilo se otevřít napojení účtu. Zkuste to znovu.' }
  }
}

// Vrátí aktuální stav Connect účtu (zavolá Stripe a zaktualizuje DB).
// Voláme po návratu z onboardingu, ať máme čerstvý stav i bez čekání na webhook.
export async function refreshConnectStatus(): Promise<{ payoutsEnabled: boolean; onboardingDone: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { payoutsEnabled: false, onboardingDone: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', user.id)
    .single() as { data: { stripe_account_id: string | null } | null }

  if (!profile?.stripe_account_id) return { payoutsEnabled: false, onboardingDone: false }

  try {
    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    const payoutsEnabled = account.payouts_enabled === true
    const onboardingDone = account.details_submitted === true

    const admin = getAdminClient()
    await (admin.from('profiles') as any)
      .update({
        stripe_payouts_enabled: payoutsEnabled,
        stripe_onboarding_done: onboardingDone,
      })
      .eq('id', user.id)

    return { payoutsEnabled, onboardingDone }
  } catch (err) {
    console.error('[connect] retrieve error:', err)
    return { payoutsEnabled: false, onboardingDone: false }
  }
}