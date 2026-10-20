// app/api/obce/route.ts
// Našeptávač obcí: /api/obce?q=val → obce začínající na "val" (+ okres kvůli duplicitám).
// Od 20. 10. 2026 bez diakritiky a s malou chybou („roznov“, „Rožnof“) – lib/obce.ts.
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { searchObce } from '@/lib/obce'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('q') ?? ''
  // Dekóduj případné procentové kódování diakritiky (ž → %C5%BE) a ořízni
  let q = raw
  try { q = decodeURIComponent(raw) } catch { q = raw }
  q = q.trim()

  if (q.length < 2) return NextResponse.json({ obce: [] })

  try {
    return NextResponse.json({ obce: await searchObce(q, 7) })
  } catch (error: any) {
    console.error('[api/obce]', error)
    return NextResponse.json({ obce: [], error: error?.message ?? 'chyba' })
  }
}