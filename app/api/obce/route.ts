// app/api/obce/route.ts
// Našeptávač obcí: /api/obce?q=val → obce začínající na "val" (+ okres kvůli duplicitám).
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('q') ?? ''
  // Dekóduj případné procentové kódování diakritiky (ž → %C5%BE) a ořízni
  let q = raw
  try { q = decodeURIComponent(raw) } catch { q = raw }
  q = q.trim()

  if (q.length < 2) return NextResponse.json({ obce: [] })

  const supabase = createClient()

  const { data, error } = await supabase
    .from('obce')
    .select('obec, okres, psc, latitude, longitude')
    .ilike('obec', `${q}%`)
    .order('obec', { ascending: true })
    .limit(7) as { data: { obec: string; okres: string; psc: string; latitude: number; longitude: number }[] | null; error: any }

  if (error) {
    console.error('[api/obce]', error)
    return NextResponse.json({ obce: [], error: error.message })
  }

  return NextResponse.json({ obce: data ?? [] })
}