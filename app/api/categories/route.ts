// app/api/categories/route.ts
// Kategorie s profesemi (od 23. 10. 2026 jsou podkategorie profese – docs/profese-navrh.json).
// Vyřazené obory (retired) a neschválené vlastní profese se nevracejí; příbuzná slova kvůli hledání.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select(`
      id, slug, name, icon, color, sort_order,
      subcategories (
        id, slug, name, synonyms, sort_order, retired, is_approved,
        service_types (id, name)
      )
    `)
    .eq('subcategories.retired', false)
    .eq('subcategories.is_approved', true)
    .order('sort_order')
    .order('sort_order', { foreignTable: 'subcategories', nullsFirst: false })

  return NextResponse.json({ categories: categories ?? [] }, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' }
  })
}
