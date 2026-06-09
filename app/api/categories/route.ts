// app/api/categories/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select(`
      id, slug, name, icon, color, sort_order,
      subcategories (
        id, slug, name,
        service_types (id, name)
      )
    `)
    .order('sort_order')

  return NextResponse.json({ categories: categories ?? [] }, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' }
  })
}
