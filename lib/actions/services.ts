'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ServiceFormValues, ActionResult } from './types'

const serviceSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(2000),
  category: z.string().min(1).max(50),
  subcategory_id: z.string().optional(),
  subcategory_ids: z.array(z.string()).optional(),
  service_type: z.string().optional(),
  price: z.number().min(0).max(999999),
  price_unit: z.enum(['hod','kus','den','projekt'] as const),
  city: z.string().min(2).max(100),
  image_url: z.string().url().optional().or(z.literal('')),

  // Model A/B
  payment_model: z.enum(['A','B'] as const),
  price_type: z.enum(['fixed','range','on_agreement'] as const),
  price_max: z.number().min(0).max(999999).nullable().optional(),
  deposit_amount: z.number().min(0).max(999999).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  quote_fee: z.number().min(0).max(999999).nullable().optional(),
  price_per_km: z.number().min(0).max(99999).nullable().optional(),
  free_km: z.number().int().min(0).max(100000).nullable().optional(),
  quote_days: z.number().int().min(0).max(365).nullable().optional(),

  // Storno politika
  cancellation_policy: z.enum(['zadna','mirna','standardni','prisna'] as const).optional(),
})

// Sjednotí hodnoty podle zvoleného modelu/typu ceny
function normalize(data: z.infer<typeof serviceSchema>) {
  const d = { ...data }
  // Výchozí storno politika
  if (!d.cancellation_policy) d.cancellation_policy = 'zadna'
  if (d.payment_model === 'B') {
    d.price = 0
    d.price_type = 'on_agreement'
    d.price_max = null
    d.deposit_amount = null
    // U Modelu B není záloha → storno zálohy nedává smysl
    d.cancellation_policy = 'zadna'
  } else {
    d.quote_fee = null
    d.price_per_km = null
    d.free_km = null
    d.quote_days = null
    if (d.price_type === 'on_agreement') { d.price = 0; d.price_max = null }
    else if (d.price_type === 'fixed') { d.price_max = null }
    if (d.deposit_amount != null && d.deposit_amount < 200) d.deposit_amount = 200
    if (d.deposit_amount == null) d.deposit_amount = 200
  }
  return d
}

// Uloží vybrané podkategorie do propojovací tabulky (smaže staré, vloží nové)
async function saveSubcategories(supabase: any, serviceId: string, ids?: string[]) {
  // smaž stávající vazby
  await supabase.from('service_subcategories').delete().eq('service_id', serviceId)
  // vlož nové (jen unikátní, neprázdné)
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)))
  if (unique.length > 0) {
    const rows = unique.map(sid => ({ service_id: serviceId, subcategory_id: sid }))
    await supabase.from('service_subcategories').insert(rows)
  }
}

export async function createService(values: ServiceFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) return { success: false, error: 'Formulář obsahuje chyby.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }

  const norm = normalize(parsed.data)
  const { image_url, subcategory_ids, ...rest } = norm

  // hlavní podkategorie (subcategory_id) = první ze seznamu, pokud není vyplněná zvlášť
  const primarySub = rest.subcategory_id || (subcategory_ids && subcategory_ids[0]) || null
  const insertData = { ...rest, subcategory_id: primarySub, provider_id: user.id, image_url: image_url || null }

  const { data, error } = await supabase.from('services').insert(insertData).select('id').single()
  if (error) { console.error('INSERT services error:', error); return { success: false, error: 'Nepodařilo se uložit službu.' } }

  await saveSubcategories(supabase, data.id, subcategory_ids)

  revalidatePath('/'); revalidatePath('/marketplace')
  return { success: true, id: data.id }
}

export async function updateService(id: string, values: ServiceFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) return { success: false, error: 'Formulář obsahuje chyby.' }

  const norm = normalize(parsed.data)
  const { image_url, subcategory_ids, ...rest } = norm
  const primarySub = rest.subcategory_id || (subcategory_ids && subcategory_ids[0]) || null
  const updateData = { ...rest, subcategory_id: primarySub, image_url: image_url || null }

  const { error } = await supabase.from('services').update(updateData).eq('id', id).eq('provider_id', user.id)
  if (error) { console.error('UPDATE services error:', error); return { success: false, error: 'Nepodařilo se uložit změny.' } }

  await saveSubcategories(supabase, id, subcategory_ids)

  revalidatePath('/'); revalidatePath('/marketplace'); revalidatePath(`/sluzby/${id}`)
  return { success: true, id }
}

export async function deleteService(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const { error } = await supabase.from('services').delete().eq('id', id).eq('provider_id', user.id)
  if (error) return { success: false, error: 'Nepodařilo se smazat.' }
  revalidatePath('/'); revalidatePath('/marketplace')
  return { success: true, id }
}

export async function toggleServiceActive(id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const { error } = await supabase.from('services').update({ is_active }).eq('id', id).eq('provider_id', user.id)
  if (error) return { success: false, error: 'Nepodařilo se změnit stav.' }
  revalidatePath('/'); revalidatePath('/marketplace')
  return { success: true, id }
}