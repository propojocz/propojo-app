// app/admin/kategorie/page.tsx
import { createClient as createAdminClient } from '@supabase/supabase-js'
import KategorieManager from './KategorieManager'

export const metadata = { title: 'Kategorie | Admin Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminKategoriePage() {
  const admin = getAdminClient()

  const [
    { data: categories },
    { data: subcategories },
    { data: serviceTypes },
    { data: servicesRows },
    { data: linkRows },
  ] = await Promise.all([
    admin.from('categories').select('id, slug, name, icon, color, sort_order').order('sort_order'),
    // is_approved / created_by / suggested_note přibyly ve vrstvě 13 — nesou
    // podkategorie navržené poskytovateli, které čekají na schválení.
    admin.from('subcategories')
      .select('id, category_id, slug, name, is_approved, created_by, suggested_note')
      .order('name'),
    admin.from('service_types').select('id, subcategory_id, name').order('name'),
    admin.from('services').select('id, category'),
    admin.from('service_subcategories').select('subcategory_id'),
  ])

  // Jména navrhovatelů — ať víte, koho se případně zeptat.
  const authorIds = Array.from(new Set(
    (subcategories ?? [])
      .map((s: any) => s.created_by)
      .filter(Boolean)
  )) as string[]

  const authorNames: Record<string, string> = {}
  if (authorIds.length > 0) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name, company_name, full_name')
      .in('id', authorIds)
    for (const p of (profs ?? []) as any[]) {
      authorNames[p.id] = p.display_name || p.company_name || p.full_name || 'Poskytovatel'
    }
  }

  // Počty využití pro bezpečné mazání a informaci
  const categoryUsage: Record<string, number> = {}
  for (const s of (servicesRows ?? []) as any[]) {
    if (!s.category) continue
    categoryUsage[s.category] = (categoryUsage[s.category] ?? 0) + 1
  }
  const subcatUsage: Record<string, number> = {}
  for (const l of (linkRows ?? []) as any[]) {
    subcatUsage[l.subcategory_id] = (subcatUsage[l.subcategory_id] ?? 0) + 1
  }

  return (
    <KategorieManager
      categories={categories ?? []}
      subcategories={(subcategories ?? []) as any}
      serviceTypes={serviceTypes ?? []}
      categoryUsage={categoryUsage}
      subcatUsage={subcatUsage}
      authorNames={authorNames}
    />
  )
}