// app/api/notifications/route.ts
// Vrátí počet nepřečtených notifikací pro přihlášeného uživatele

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single()

  const isProvider = profile?.is_provider === true

  let count = 0

  if (isProvider) {
    // Živnostník – čekající poptávky
    const { count: pending } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', user.id)
      .eq('status', 'cekajici')
    count = pending ?? 0
  } else {
    // Zákazník – aktivní objednávky (přijato nebo v procesu)
    const { count: active } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .in('status', ['prijato', 'v_procesu'])
    count = active ?? 0
  }

  return NextResponse.json({ count }, {
    headers: { 'Cache-Control': 'no-store' }
  })
}
