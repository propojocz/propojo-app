// app/api/obory/route.ts
// Našeptávač oborů: /api/obory?q=kade → kategorie + podkategorie začínající/obsahující "kade".
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ obory: [] })

  const supabase = createClient()

  // Kategorie (obor) – vracíme slug pro filtr ?category=
  const { data: cats } = await supabase
    .from('categories')
    .select('slug, name')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(5) as { data: { slug: string; name: string }[] | null }

  // Podkategorie (konkrétní úkon) – vracíme id pro filtr ?subcats=
  const { data: subs } = await supabase
    .from('subcategories')
    .select('id, name')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(6) as { data: { id: string; name: string }[] | null }

  const obory = [
    ...(cats ?? []).map((c) => ({ type: 'category' as const, value: c.slug, label: c.name })),
    ...(subs ?? []).map((s) => ({ type: 'subcategory' as const, value: s.id, label: s.name })),
  ]

  return NextResponse.json({ obory })
}