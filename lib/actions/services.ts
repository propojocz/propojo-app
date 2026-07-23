'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ServiceFormValues, ActionResult } from './types'

// Po přestavbě na model „karta + ceník" nese cenu/model/délku/zálohu POLOŽKA ceníku
// (service_items), ne karta. Karta = identita provozovny (název, foto, kategorie,
// adresa, popis). Proto jsou cenová pole ve schématu níže VOLITELNÁ s defaulty —
// nový formulář je neposílá, ale staré sloupce v `services` zatím existují
// (smažou se v kroku 7), takže když je někdo pošle, nespadne to.

const serviceSchema = z.object({
  title: z.string().min(5).max(100),
  subtitle: z.string().max(80).nullable().optional(),
  description: z.string().min(20).max(2000),
  category: z.string().min(1).max(50),
  subcategory_id: z.string().optional(),
  subcategory_ids: z.array(z.string()).optional(),
  service_type: z.string().optional(),
  phone: z.string().max(30).nullable().optional(),
  city: z.string().min(2).max(100),
  city_lat: z.number().nullable().optional(),
  city_lng: z.number().nullable().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  gallery: z.array(z.string()).optional(),

  // Kde se služba vykonává
  location_type: z.enum(['u_poskytovatele', 'u_zakaznika', 'oboji'] as const).optional(),
  // Adresa provozovny (karta = služba NEBO pobočka)
  address: z.string().max(200).nullable().optional(),
  address_lat: z.number().nullable().optional(),
  address_lng: z.number().nullable().optional(),
  address_public: z.boolean().optional(),
  // Dojezdová vzdálenost (relevantní jen když poskytovatel jezdí za zákazníkem)
  radius_km: z.number().int().min(1).max(300).nullable().optional(),

  // ── Cenová pole (LEGACY) — po přestavbě je nese ceník. Volitelná s defaulty. ──
  price: z.number().min(0).max(999999).optional(),
  price_unit: z.enum(['ukon', 'hod', 'kus', 'den', 'projekt', 'm2', 'bm'] as const).optional(),
  price_includes_material: z.boolean().optional(),
  price_note: z.string().max(200).nullable().optional(),
  payment_model: z.enum(['A', 'B'] as const).optional(),
  price_type: z.enum(['fixed', 'range', 'on_agreement'] as const).optional(),
  price_max: z.number().min(0).max(999999).nullable().optional(),
  deposit_amount: z.number().min(0).max(999999).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  quote_fee: z.number().min(0).max(999999).nullable().optional(),
  price_per_km: z.number().min(0).max(99999).nullable().optional(),
  free_km: z.number().int().min(0).max(100000).nullable().optional(),
  quote_days: z.number().int().min(0).max(365).nullable().optional(),
  cancellation_policy: z.enum(['zadna', 'mirna', 'standardni', 'prisna'] as const).optional(),
})

type ServiceParsed = z.infer<typeof serviceSchema>

// Sjednotí hodnoty karty. Cenová pole už neřídí formulář — necháváme jen defaulty,
// aby staré sloupce v DB dostaly platné hodnoty a nic historického se nerozbilo.
function normalize(data: ServiceParsed): ServiceParsed {
  const d: ServiceParsed = { ...data }

  // Výchozí místo výkonu
  if (!d.location_type) d.location_type = 'u_zakaznika'
  // Radius dává smysl jen když poskytovatel jezdí za zákazníkem
  if (d.location_type === 'u_poskytovatele') d.radius_km = null
  // Adresa provozovny dává smysl jen když zákazník chodí za poskytovatelem
  if (d.location_type === 'u_zakaznika') {
    d.address = null
    d.address_lat = null
    d.address_lng = null
  }
  if (d.address_public == null) d.address_public = true

  // ── LEGACY cenové defaulty (dokud sloupce v services existují) ──
  if (d.payment_model == null) d.payment_model = 'A'
  if (d.price == null) d.price = 0
  if (d.price_unit == null) d.price_unit = 'ukon'
  if (d.price_type == null) d.price_type = 'fixed'
  if (d.price_includes_material == null) d.price_includes_material = true
  if (!d.cancellation_policy) d.cancellation_policy = 'zadna'

  return d
}

// Uloží vybrané podkategorie do propojovací tabulky (smaže staré, vloží nové)
async function saveSubcategories(supabase: any, serviceId: string, ids?: string[]) {
  await supabase.from('service_subcategories').delete().eq('service_id', serviceId)
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)))
  if (unique.length > 0) {
    const rows = unique.map((sid) => ({ service_id: serviceId, subcategory_id: sid }))
    await supabase.from('service_subcategories').insert(rows)
  }
}

export async function createService(values: ServiceFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Formulář obsahuje chyby.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const norm = normalize(parsed.data)
  const { image_url, subcategory_ids, ...rest } = norm

  // hlavní podkategorie (subcategory_id) = první ze seznamu, pokud není vyplněná zvlášť
  const primarySub = rest.subcategory_id || (subcategory_ids && subcategory_ids[0]) || null
  const insertData = { ...rest, subcategory_id: primarySub, provider_id: user.id, image_url: image_url || null }

  const { data, error } = await (supabase.from('services') as any).insert(insertData).select('id').single()
  if (error) {
    console.error('INSERT services error:', error)
    return { success: false, error: 'Nepodařilo se uložit kartu.' }
  }

  await saveSubcategories(supabase, data.id, subcategory_ids)

  revalidatePath('/')
  revalidatePath('/marketplace')
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

  const { error } = await (supabase.from('services') as any).update(updateData).eq('id', id).eq('provider_id', user.id)
  if (error) {
    console.error('UPDATE services error:', error)
    return { success: false, error: 'Nepodařilo se uložit změny.' }
  }

  await saveSubcategories(supabase, id, subcategory_ids)

  revalidatePath('/')
  revalidatePath('/marketplace')
  revalidatePath(`/sluzby/${id}`)
  return { success: true, id }
}

export async function deleteService(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  // Nejdřív zkontroluj, jestli ke kartě patří nějaké objednávky.
  // Pokud ano, tvrdé smazání by rozbilo historii — nabídneme skrytí.
  const { count } = await supabase
    .from('orders').select('id', { count: 'exact', head: true }).eq('service_id', id)

  if ((count ?? 0) > 0) {
    return {
      success: false,
      hasOrders: true,
      error: `Ke kartě patří ${count} ${count === 1 ? 'objednávka' : (count ?? 0) < 5 ? 'objednávky' : 'objednávek'}, proto ji nelze smazat — historie objednávek musí zůstat zachována. Můžete ji ale skrýt: zmizí z marketplace, ale zůstane vám v přehledu.`,
    } as any
  }

  // Nejdřív smazat ZÁVISLOSTI — karta má vazby v jiných tabulkách a databáze
  // by tvrdé smazání odmítla (foreign key).
  // service_items se díky `on delete cascade` smažou samy, ale service_subcategories
  // a availability_slots ošetříme ručně.
  await supabase.from('service_subcategories').delete().eq('service_id', id)
  await (supabase.from('availability_slots') as any).delete().eq('service_id', id)

  const { error } = await (supabase.from('services') as any).delete().eq('id', id).eq('provider_id', user.id)
  if (error) {
    console.error('DELETE services error:', error)
    return { success: false, error: `Nepodařilo se smazat kartu (${error.message ?? 'neznámá chyba'}). Můžete ji místo mazání skrýt.` }
  }
  revalidatePath('/')
  revalidatePath('/marketplace')
  return { success: true, id }
}

export async function toggleServiceActive(id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }
  const { error } = await (supabase.from('services') as any).update({ is_active }).eq('id', id).eq('provider_id', user.id)
  if (error) return { success: false, error: 'Nepodařilo se změnit stav.' }
  revalidatePath('/')
  revalidatePath('/marketplace')
  return { success: true, id }
}