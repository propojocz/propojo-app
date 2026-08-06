'use server'
// lib/actions/subcategories.ts
// Vlastní podkategorie od poskytovatelů („Nevidím svou službu").
//
// Klíčové pravidlo: poskytovatel si ji vytvoří a HNED s ní může pracovat —
// dá si ji na kartu, přidá k ní úkony, zveřejní. Do ZÁKAZNICKÉHO VYHLEDÁVÁNÍ
// ale nespadne, dokud ji neschválíte v adminu (is_approved). Díky tomu
// nevzniká nepořádek ve filtrech a zároveň nikoho nebrzdíme.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Result =
  | { success: true; id: string; name: string; slug: string }
  | { success: false; error: string }

const schema = z.object({
  category_id: z.string().uuid('Vyberte nejdřív kategorii.'),
  name: z.string()
    .min(3, 'Název musí mít aspoň 3 znaky.')
    .max(60, 'Název je moc dlouhý — stačí pár slov.'),
  note: z.string().max(300).nullable().optional(),
})

/** Diakritika pryč, mezery na pomlčky — ať slug funguje v URL. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Vytvoří vlastní (zatím neschválenou) podkategorii pod danou kategorií.
 * Vrací i název a slug, ať si ji formulář rovnou přidá mezi vybrané.
 */
export async function createOwnSubcategory(input: {
  category_id: string
  name: string
  note?: string | null
}): Promise<Result> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'Zkontrolujte zadání.' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const name = parsed.data.name.trim()
  const baseSlug = slugify(name)
  if (!baseSlug) return { success: false, error: 'Název musí obsahovat písmena.' }

  const admin = getAdminClient()

  // Existuje už stejná podkategorie v téhle kategorii? Pak ji jen vrátíme —
  // nemá smysl zakládat duplicitu, když ji někdo navrhl před vámi.
  const { data: existing } = await admin
    .from('subcategories')
    .select('id, name, slug')
    .eq('category_id', parsed.data.category_id)
    .eq('slug', baseSlug)
    .maybeSingle() as { data: { id: string; name: string; slug: string } | null }

  if (existing) {
    return { success: true, id: existing.id, name: existing.name, slug: existing.slug }
  }

  const { data, error } = await (admin.from('subcategories') as any)
    .insert({
      category_id: parsed.data.category_id,
      name,
      slug: baseSlug,
      is_approved: false,          // do vyhledávání až po schválení
      created_by: user.id,
      suggested_note: parsed.data.note?.trim() || null,
    })
    .select('id, name, slug')
    .single()

  if (error || !data) {
    console.error('[createOwnSubcategory]', error)
    return { success: false, error: 'Nepodařilo se uložit. Proběhlo SQL vrstvy 13?' }
  }

  revalidatePath('/dashboard/nabidky')
  revalidatePath('/admin/kategorie')
  return { success: true, id: data.id, name: data.name, slug: data.slug }
}

/**
 * Podkategorie pro ZÁKAZNICKÉ vyhledávání — jen schválené.
 * Filtry a marketplace mají volat tuhle, ne číst tabulku napřímo.
 */
export async function getApprovedSubcategories(categoryId?: string) {
  const supabase = createClient()
  let q = supabase
    .from('subcategories')
    .select('id, category_id, slug, name')
    .eq('is_approved', true)
    .order('name')
  if (categoryId) q = q.eq('category_id', categoryId)
  const { data } = await q
  return data ?? []
}

/**
 * Schválit podkategorii navrženou poskytovatelem — od téhle chvíle se
 * ukazuje i zákazníkům ve vyhledávání a filtrech.
 */
export async function approveSubcategory(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const admin = getAdminClient()
  const { error } = await (admin.from('subcategories') as any)
    .update({ is_approved: true })
    .eq('id', id)

  if (error) {
    console.error('[approveSubcategory]', error)
    return { success: false, error: 'Nepodařilo se schválit.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

/**
 * Vrátit podkategorii mezi nescvhálené (např. po překlepu ve schvalování).
 * Poskytovateli dál funguje na kartě, jen zmizí ze zákaznického vyhledávání.
 */
export async function unapproveSubcategory(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const admin = getAdminClient()
  const { error } = await (admin.from('subcategories') as any)
    .update({ is_approved: false })
    .eq('id', id)

  if (error) {
    console.error('[unapproveSubcategory]', error)
    return { success: false, error: 'Nepodařilo se změnit.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

/**
 * Přejmenovat podkategorii — při schvalování často chcete název učesat
 * do tvaru, který sedí ke zbytku katalogu.
 */
export async function renameSubcategory(id: string, name: string): Promise<{ success: true } | { success: false; error: string }> {
  const clean = name.trim()
  if (clean.length < 3) return { success: false, error: 'Název musí mít aspoň 3 znaky.' }

  const admin = getAdminClient()
  const { error } = await (admin.from('subcategories') as any)
    .update({ name: clean })
    .eq('id', id)

  if (error) {
    console.error('[renameSubcategory]', error)
    return { success: false, error: 'Nepodařilo se přejmenovat.' }
  }
  revalidatePath('/admin/kategorie')
  return { success: true }
}

/**
 * Přesunout podkategorii pod jinou kategorii. Když ji poskytovatel zařadil
 * špatně (např. „Mytí střech" pod Krása místo Řemesla), přehodíte ji sem —
 * karty, ceník i objednávky zůstanou beze změny, protože visí na
 * subcategory_id, ne na kategorii.
 */
export async function moveSubcategory(id: string, categoryId: string): Promise<{ success: true } | { success: false; error: string }> {
  const admin = getAdminClient()

  // Cílová kategorie musí existovat.
  const { data: cat } = await admin
    .from('categories').select('id').eq('id', categoryId).maybeSingle() as { data: { id: string } | null }
  if (!cat) return { success: false, error: 'Cílová kategorie neexistuje.' }

  const { error } = await (admin.from('subcategories') as any)
    .update({ category_id: categoryId })
    .eq('id', id)

  if (error) {
    console.error('[moveSubcategory]', error)
    return { success: false, error: 'Nepodařilo se přesunout.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

/**
 * Sloučit podkategorii do jiné (odstranění duplicit). Přesune KARTY i ÚKONY
 * z `fromId` na `intoId` a `fromId` smaže. `into` zůstává, `from` zmizí.
 * Pozná i případ, kdy kartu už máte navázanou na obě — pak jen zahodí duplicitní
 * vazbu, ať v service_subcategories nevznikne konflikt.
 */
export async function mergeSubcategories(fromId: string, intoId: string): Promise<{ success: true } | { success: false; error: string }> {
  if (fromId === intoId) return { success: false, error: 'Nelze sloučit podkategorii samu se sebou.' }
  const admin = getAdminClient()

  // Obě musí existovat.
  const { data: both } = await admin
    .from('subcategories').select('id').in('id', [fromId, intoId]) as { data: { id: string }[] | null }
  if (!both || both.length < 2) return { success: false, error: 'Jedna z podkategorií neexistuje.' }

  // 1) KARTY: vazby, které cíl ještě nemá, přepneme na cíl; duplicitní zahodíme.
  const { data: fromLinks } = await admin
    .from('service_subcategories').select('service_id').eq('subcategory_id', fromId) as { data: { service_id: string }[] | null }
  const { data: intoLinks } = await admin
    .from('service_subcategories').select('service_id').eq('subcategory_id', intoId) as { data: { service_id: string }[] | null }
  const intoSet = new Set((intoLinks ?? []).map(l => l.service_id))

  for (const l of fromLinks ?? []) {
    if (intoSet.has(l.service_id)) {
      // Karta už je i pod cílem → jen smažeme starou vazbu.
      await (admin.from('service_subcategories') as any)
        .delete().eq('subcategory_id', fromId).eq('service_id', l.service_id)
    } else {
      await (admin.from('service_subcategories') as any)
        .update({ subcategory_id: intoId }).eq('subcategory_id', fromId).eq('service_id', l.service_id)
    }
  }

  // 2) ÚKONY v ceníku přepneme na cíl (tady kolize nevadí — úkon patří jedné podkat.).
  await (admin.from('service_items') as any)
    .update({ subcategory_id: intoId }).eq('subcategory_id', fromId)

  // 3) Zdrojovou podkategorii smažeme — teď už na ní nic nevisí.
  const { error } = await (admin.from('subcategories') as any).delete().eq('id', fromId)
  if (error) {
    console.error('[mergeSubcategories]', error)
    return { success: false, error: 'Přesun proběhl, ale nepodařilo se smazat duplikát.' }
  }

  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}