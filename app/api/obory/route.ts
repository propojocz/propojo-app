// app/api/obory/route.ts
// Našeptávač v hledání marketplace: /api/obory?q=malir → kategorie + profese.
// Od 23. 10. 2026 profese i podle příbuzných slov („holič“ → Barber, „podlahy“ → Podlahář) a bez diakritiky.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchProfessions } from '@/lib/professions'
import { normalizeText } from '@/lib/search'

type Prof = { id: string; name: string; synonyms: string[] | null }
type Cat = { slug: string; name: string }

// Číselník je malý (≈150 profesí) a mění se zřídka – v paměti serveru na 10 minut
let cache: { at: number; cats: Cat[]; profs: Prof[] } | null = null

async function load() {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache
  const supabase = createClient()
  const [{ data: cats }, { data: profs }] = await Promise.all([
    supabase.from('categories').select('slug, name').order('sort_order'),
    supabase.from('subcategories').select('id, name, synonyms').eq('is_approved', true).eq('retired', false),
  ])
  cache = { at: Date.now(), cats: (cats ?? []) as Cat[], profs: (profs ?? []) as Prof[] }
  return cache
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ obory: [] })

  try {
    const { cats, profs } = await load()
    const nq = normalizeText(q)
    const catHits = cats.filter((c) => normalizeText(c.name).includes(nq)).slice(0, 3)
    const profHits = matchProfessions(q, profs, 7)
    const obory = [
      ...profHits.map((s) => ({ type: 'subcategory' as const, value: s.id, label: s.name })),
      ...catHits.map((c) => ({ type: 'category' as const, value: c.slug, label: c.name })),
    ]
    return NextResponse.json({ obory })
  } catch (err) {
    console.error('[api/obory]', err)
    return NextResponse.json({ obory: [] })
  }
}
