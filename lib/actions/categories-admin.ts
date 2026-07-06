'use server'
// lib/actions/categories-admin.ts — správa číselníku kategorií (jen admin).
// Struktura: categories → subcategories → service_types.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean } | null }
  return data?.is_admin === true ? user : null
}

// Vyrobí url-friendly slug z názvu (bez diakritiky, malými písmeny, pomlčky).
function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type Result = { success: true } | { success: false; error: string }

// ══════════════════ KATEGORIE ══════════════════

export async function createCategory(params: {
  name: string
  icon: string
  color: string
  sort_order?: number
}): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Nemáte oprávnění.' }

  const name = params.name.trim()
  if (name.length < 2) return { success: false, error: 'Zadejte název kategorie.' }
  const icon = params.icon.trim() || '🔧'
  const color = params.color.trim() || '#10b981'
  const slug = slugify(name)
  if (!slug) return { success: false, error: 'Název musí obsahovat alespoň jedno písmeno.' }

  const admin = getAdminClient()
  const { data: existing } = await admin.from('categories').select('id').eq('slug', slug).maybeSingle()
  if (existing) return { success: false, error: 'Kategorie s tímto názvem už existuje.' }

  const { error } = await (admin.from('categories') as any).insert({
    slug, name, icon, color, sort_order: params.sort_order ?? 100,
  })
  if (error) {
    console.error('[createCategory]', error)
    return { success: false, error: 'Nepodařilo se vytvořit kategorii.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

export async function deleteCategory(id: string): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Nemáte oprávnění.' }

  const admin = getAdminClient()
  const { data: cat } = await admin.from('categories').select('slug').eq('id', id).single() as { data: { slug: string } | null }
  if (!cat) return { success: false, error: 'Kategorie nenalezena.' }

  const { count } = await admin.from('services').select('id', { count: 'exact', head: true }).eq('category', cat.slug)
  if ((count ?? 0) > 0) return { success: false, error: `Nelze smazat — používá ji ${count} služeb.` }

  const { error } = await admin.from('categories').delete().eq('id', id)
  if (error) {
    console.error('[deleteCategory]', error)
    return { success: false, error: 'Nepodařilo se smazat kategorii.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

// ══════════════════ PODKATEGORIE ══════════════════

export async function createSubcategory(params: { category_id: string; name: string }): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Nemáte oprávnění.' }

  const name = params.name.trim()
  if (name.length < 2) return { success: false, error: 'Zadejte název podkategorie.' }
  const slug = slugify(name)

  const admin = getAdminClient()
  const { error } = await (admin.from('subcategories') as any).insert({
    category_id: params.category_id, slug, name,
  })
  if (error) {
    console.error('[createSubcategory]', error)
    return { success: false, error: 'Nepodařilo se vytvořit podkategorii.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

export async function deleteSubcategory(id: string): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Nemáte oprávnění.' }

  const admin = getAdminClient()
  const { count } = await admin.from('service_subcategories').select('service_id', { count: 'exact', head: true }).eq('subcategory_id', id)
  if ((count ?? 0) > 0) return { success: false, error: `Nelze smazat — používá ji ${count} služeb.` }

  const { error } = await admin.from('subcategories').delete().eq('id', id)
  if (error) {
    console.error('[deleteSubcategory]', error)
    return { success: false, error: 'Nepodařilo se smazat podkategorii.' }
  }
  revalidatePath('/admin/kategorie')
  revalidatePath('/marketplace')
  return { success: true }
}

// ══════════════════ TYP SLUŽBY ══════════════════

export async function createServiceType(params: { subcategory_id: string; name: string }): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Nemáte oprávnění.' }

  const name = params.name.trim()
  if (name.length < 2) return { success: false, error: 'Zadejte název typu služby.' }

  const admin = getAdminClient()
  const { error } = await (admin.from('service_types') as any).insert({
    subcategory_id: params.subcategory_id, name,
  })
  if (error) {
    console.error('[createServiceType]', error)
    return { success: false, error: 'Nepodařilo se vytvořit typ služby.' }
  }
  revalidatePath('/admin/kategorie')
  return { success: true }
}

export async function deleteServiceType(id: string): Promise<Result> {
  const user = await requireAdmin()
  if (!user) return { success: false, error: 'Nemáte oprávnění.' }

  const admin = getAdminClient()
  const { error } = await admin.from('service_types').delete().eq('id', id)
  if (error) {
    console.error('[deleteServiceType]', error)
    return { success: false, error: 'Nepodařilo se smazat typ služby.' }
  }
  revalidatePath('/admin/kategorie')
  return { success: true }
}