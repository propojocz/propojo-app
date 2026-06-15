// app/api/notifications/route.ts
// Vrátí nepřečtené notifikace (počet + náhledy) pro přihlášeného uživatele.
// Čte z tabulky notifications (RLS pustí jen vlastní oznámení daného uživatele).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0, items: [] }, { headers: { 'Cache-Control': 'no-store' } })

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, order_id, title, preview, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15) as { data: any[] | null; error: any }

  if (error || !data) {
    console.error('[api/notifications]', error)
    return NextResponse.json({ count: 0, items: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const count = data.filter((n) => n.read_at === null).length

  return NextResponse.json(
    { count, items: data },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}