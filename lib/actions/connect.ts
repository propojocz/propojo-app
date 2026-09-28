'use server'
// lib/actions/connect.ts
// Model v2: napojení poskytovatele přes Stripe Connect STANDARD. Platby rezervací vznikají
// přímo na jeho účtu (Direct Charges), Propojo si bere jen provizi (application fee).
//
// Starý Express účet (profiles.stripe_account_id) zůstává jen pro staré objednávky.
// Kdo ho má, dostane při napojení nový Standard účet – Express s novým tokem nefunguje.
// Stav účtu se ukládá do stripe_accounts (plní webhook i obnova po návratu z onboardingu).

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import {
  adminDb,
  createOnboardingLink,
  ensureStandardAccount,
  getProviderAccount,
  syncStripeAccount,
} from '@/lib/booking/payments'
import type { AccountBlock } from '@/lib/booking/rules'

type LinkResult = { success: true; url: string } | { success: false; error: string }

// Vytvoří (nebo najde) Standard účet poskytovatele a vrátí odkaz na onboarding u Stripe.
export async function createConnectOnboardingLink(): Promise<LinkResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider, full_name, company_name')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean; full_name: string | null; company_name: string | null } | null }

  if (profile?.is_provider !== true) {
    return { success: false, error: 'Napojení účtu je určeno pro poskytovatele.' }
  }

  const db = adminDb()
  let accountId: string
  try {
    accountId = await ensureStandardAccount(db, { id: user.id, email: user.email }, profile.company_name || profile.full_name)
  } catch (err) {
    console.error('[connect] založení Standard účtu:', err)
    return { success: false, error: 'Nepodařilo se založit účet pro platby.' }
  }

  try {
    return { success: true, url: await createOnboardingLink(accountId) }
  } catch (err) {
    console.error('[connect] accountLinks.create error:', err)
    return { success: false, error: 'Nepodařilo se otevřít napojení účtu. Zkuste to znovu.' }
  }
}

export type ConnectStatus = {
  hasAccount: boolean
  /** Může přijímat nové rezervace (žádná blokace) */
  ready: boolean
  blocks: AccountBlock[]
}

// Aktuální stav účtu. S refresh=true se nejdřív načte ze Stripe (po návratu z onboardingu,
// ať se nečeká na webhook).
export async function refreshConnectStatus(refresh = true): Promise<ConnectStatus> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { hasAccount: false, ready: false, blocks: ['not_connected'] }

  const db = adminDb()
  const current = await getProviderAccount(db, user.id)

  if (refresh && current.accountId) {
    try {
      const account = await stripe.accounts.retrieve(current.accountId)
      await syncStripeAccount(db, account, user.id)
    } catch (err) {
      console.error('[connect] retrieve error:', err)
    }
  }

  const fresh = refresh ? await getProviderAccount(db, user.id) : current
  return { hasAccount: !!fresh.accountId, ready: fresh.blocks.length === 0, blocks: fresh.blocks }
}
