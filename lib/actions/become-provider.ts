'use server'
// lib/actions/become-provider.ts
//
// PŘECHOD ZÁKAZNÍK → POSKYTOVATEL.
//
// Jeden profil, jeden krok: stačí IČO. Jméno, e-mail i heslo už uživatel má
// z registrace — nemá smysl je vyplňovat znovu (to dělal starý třístupňový
// průvodce /registrace/zivnostnik, který je určený pro ÚPLNĚ NOVÉ účty a
// přihlášenému uživateli by zakládal druhý účet).
//
// Telefon je VOLITELNÝ: firmy si zakládají zvlášť karty pro jednotlivé týmy
// nebo zaměstnance a číslo patří na kartu, ne nutně na profil.
//
// Bezpečnost: IČO ověřujeme proti ARES (existuje? jaké je úřední jméno?).
// Neověřujeme, že uživatel je jeho držitelem — to zachytí až Stripe KYC
// při napojení výplat. Bez KYC se k penězům nikdo nedostane.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { ActionResult } from './types'

export type AresSubject = {
  companyName: string
  address?: string | null
  legalForm?: string | null
  since?: string | null
}

async function verifyIcoInAres(ico: string): Promise<{ ok: boolean; subject?: AresSubject }> {
  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
      { headers: { accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return { ok: false }
    const data = await res.json()
    const name = data?.obchodniJmeno
    if (!name) return { ok: false }
    return {
      ok: true,
      subject: {
        companyName: name,
        address: data?.sidlo?.textovaAdresa ?? null,
        legalForm: data?.pravniForma ?? null,
        since: data?.datumVzniku ?? null,
      },
    }
  } catch (err) {
    console.error('[become-provider] ARES ověření selhalo:', err)
    return { ok: false }
  }
}

/**
 * KROK 1 — jen se podívá do ARES a vrátí, co našel. NIC NEUKLÁDÁ.
 * Uživatel si má subjekt prohlédnout a potvrdit, že je to opravdu on —
 * překlep v jedné číslici by ho jinak nechal vystupovat pod cizí firmou.
 */
export async function lookupIco(ico: string): Promise<
  { success: true; subject: AresSubject } | { success: false; error: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const clean = (ico ?? '').replace(/\s/g, '')
  if (!/^\d{8}$/.test(clean)) return { success: false, error: 'IČO musí mít 8 číslic.' }

  const ares = await verifyIcoInAres(clean)
  if (!ares.ok || !ares.subject) {
    return { success: false, error: 'IČO se nepodařilo najít v registru ARES. Zkontrolujte prosím zadané číslo.' }
  }
  return { success: true, subject: ares.subject }
}

export async function becomeProvider(values: {
  ico: string
  phone?: string
  /** Uživatel viděl výpis z ARES a potvrdil, že subjekt patří jemu. */
  confirmed: boolean
}): Promise<ActionResult & { companyName?: string }> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const ico = (values.ico ?? '').trim()
  if (!/^\d{8}$/.test(ico)) {
    return { success: false, error: 'IČO musí mít 8 číslic.' }
  }

  // Bez výslovného potvrzení neukládáme — uživatel musí vidět, koho ARES našel,
  // a prohlásit, že je oprávněn za tento subjekt jednat. Je to ochrana proti
  // překlepu i doklad o tom, že si zneužití cizího IČO nemohl splést s omylem.
  if (values.confirmed !== true) {
    return { success: false, error: 'Potvrďte prosím, že údaje z registru ARES patří vám.' }
  }

  // Už poskytovatelem je? Nic neděláme.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean | null } | null }

  if (profile?.is_provider === true) {
    return { success: true, id: user.id }
  }

  // Ověření v ARES — jméno bereme odtud, ne z toho, co poslal prohlížeč
  const ares = await verifyIcoInAres(ico)
  if (!ares.ok || !ares.subject) {
    return {
      success: false,
      error: 'IČO se nepodařilo ověřit v registru ARES. Zkontrolujte prosím zadané číslo.',
    }
  }

  // Zápis MUSÍ jít přes service role — ochranný trigger protect_profile_columns
  // chrání ico, ico_verified, company_name i is_provider před změnou z prohlížeče.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const update: Record<string, any> = {
    ico,
    ico_verified: true,
    company_name: ares.subject.companyName,
    is_provider: true,
  }
  // Telefon jen když ho vyplnil — je nepovinný
  const phone = (values.phone ?? '').trim()
  if (phone.length >= 9) update.phone = phone

  const { error } = await (admin.from('profiles') as any)
    .update(update)
    .eq('id', user.id)

  if (error) {
    console.error('[become-provider] uložení profilu selhalo:', error)
    return { success: false, error: 'Nepodařilo se aktivovat účet poskytovatele. Zkuste to prosím znovu.' }
  }

  revalidatePath('/', 'layout')
  revalidatePath('/dashboard')
  return { success: true, id: user.id, companyName: ares.subject.companyName }
}