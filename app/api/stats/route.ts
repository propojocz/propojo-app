// app/api/stats/route.ts
// Real statistiky z DB pro přihlašovací stránku

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const [{ count: services }, { count: providers }] = await Promise.all([
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_provider', true),
  ])

  return NextResponse.json({
    services: services ?? 0,
    providers: providers ?? 0,
  }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate' }
  })
}
