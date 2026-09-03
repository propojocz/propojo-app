'use server'
// lib/actions/billing.ts
// Fakturační nastavení poskytovatele. Zatím JEN NASTAVENÍ — žádný doklad se
// nevystavuje, dokud nepotvrdíme pravidla s právničkou/účetní (datum
// uskutečnění účetního případu, opravné doklady u vratek).
//
// MVP cílí na NEPLÁTCE DPH. U plátce má doklad výrazně víc náležitostí
// (sazby po položkách, DIČ, základ a daň) a chyba jde k tíži poskytovatele —
// plátce proto necháme fakturovat ve vlastním systému.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export type BillingMode = 'propojo' | 'own'

export type BillingSettings = {
  billing_mode: BillingMode | null
  billing_name: string | null
  billing_ico: string | null
  billing_dic: string | null
  billing_address: string | null
  billing_registry: string | null
  billing_vat_payer: boolean
  invoice_prefix: string | null
  invoice_auto: boolean
}

type Result = { success: true } | { success: false; error: string }

/** Načte fakturační nastavení přihlášeného poskytovatele. */
export async function getBillingSettings(): Promise<BillingSettings | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('billing_mode, billing_name, billing_ico, billing_dic, billing_address, billing_registry, billing_vat_payer, invoice_prefix, invoice_auto')
    .eq('id', user.id)
    .single() as { data: BillingSettings | null; error: any }

  if (error) {
    console.error('[getBillingSettings]', error)
    return null
  }
  return data
}

/**
 * Uloží fakturační nastavení.
 *
 * Prefix číselné řady si nastavuje poskytovatel, ale POŘADOVÉ ČÍSLO nikdy —
 * to přiděluje databáze atomicky (funkce next_invoice_number), aby v řadě
 * nevznikly díry ani duplicity při souběhu.
 */
export async function saveBillingSettings(values: {
  billing_mode: BillingMode
  billing_name?: string | null
  billing_ico?: string | null
  billing_dic?: string | null
  billing_address?: string | null
  billing_registry?: string | null
  invoice_prefix?: string | null
  invoice_auto?: boolean
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: profile } = await supabase
    .from('profiles').select('is_provider').eq('id', user.id).single() as { data: { is_provider: boolean } | null }
  if (profile?.is_provider !== true) {
    return { success: false, error: 'Fakturaci nastavují jen poskytovatelé.' }
  }

  const rezim = values.billing_mode
  if (rezim !== 'propojo' && rezim !== 'own') {
    return { success: false, error: 'Neplatná volba.' }
  }

  // Vlastní systém: stačí uložit volbu, ostatní pole nás nezajímají.
  if (rezim === 'own') {
    const { error } = await (supabase.from('profiles') as any)
      .update({ billing_mode: 'own', invoice_auto: false })
      .eq('id', user.id)
    if (error) {
      console.error('[saveBillingSettings]', error)
      return { success: false, error: 'Nastavení se nepodařilo uložit.' }
    }
    revalidatePath('/dashboard/profil')
    return { success: true }
  }

  // Propojo vystavuje → potřebujeme údaje, které musí být na dokladu.
  const nazev = values.billing_name?.trim()
  const ico = values.billing_ico?.trim()
  const adresa = values.billing_address?.trim()

  if (!nazev) return { success: false, error: 'Vyplňte fakturační jméno nebo název.' }
  if (!ico || !/^\d{8}$/.test(ico)) return { success: false, error: 'IČO musí mít 8 číslic.' }
  if (!adresa) return { success: false, error: 'Vyplňte sídlo.' }

  // Prefix jen jako text bez pořadového čísla — to doplní databáze.
  const prefix = values.invoice_prefix?.trim() || `${new Date().getFullYear()}-`
  if (prefix.length > 20) return { success: false, error: 'Prefix je příliš dlouhý.' }

  const { error } = await (supabase.from('profiles') as any)
    .update({
      billing_mode: 'propojo',
      billing_name: nazev,
      billing_ico: ico,
      billing_dic: values.billing_dic?.trim() || null,
      billing_address: adresa,
      billing_registry: values.billing_registry?.trim() || null,
      // MVP je pro neplátce. Plátce si fakturuje sám (volba „vlastní systém").
      billing_vat_payer: false,
      invoice_prefix: prefix,
      invoice_auto: values.invoice_auto === true,
    })
    .eq('id', user.id)

  if (error) {
    console.error('[saveBillingSettings]', error)
    return { success: false, error: 'Nastavení se nepodařilo uložit.' }
  }

  revalidatePath('/dashboard/profil')
  return { success: true }
}

/**
 * Náhled dalšího čísla faktury — JEN pro zobrazení v nastavení.
 * Skutečné číslo se přiděluje až při vystavení dokladu přes
 * next_invoice_number(), aby se souběhem nepřidělilo dvakrát totéž.
 */
export async function previewNextInvoiceNumber(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const rok = new Date().getFullYear()
  const { data: profile } = await supabase
    .from('profiles').select('invoice_prefix').eq('id', user.id).single() as { data: { invoice_prefix: string | null } | null }

  // invoice_counters má zapnuté RLS a žádné politiky — schválně: čísla faktur
  // nemá číst nikdo přes veřejný klíč. Náhled proto čteme service-role klientem.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: counter } = await admin
    .from('invoice_counters')
    .select('last_number')
    .eq('provider_id', user.id)
    .eq('year', rok)
    .maybeSingle() as { data: { last_number: number } | null }

  const prefix = profile?.invoice_prefix ?? `${rok}-`
  const dalsi = (counter?.last_number ?? 0) + 1
  return `${prefix}${String(dalsi).padStart(4, '0')}`
}