// app/api/cron/booking-tick/route.ts
// Vrstva 3c: lhůty rezervací každých 5 minut (propadnutí nepotvrzených, připomínky,
// uvolnění opuštěných zámků, záchrana plateb). Volá Supabase pg_cron + pg_net
// (docs/sql/cron-lhuty.sql). Chráněno tajemstvím CRON_SECRET.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/booking/payments'
import { runBookingTick } from '@/lib/booking/deadlines'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Diagnostika (22. 10. 2026): s jakou rolí server přistupuje do databáze. Jen role a projekt
 * z veřejné části klíče, nikdy klíč sám. Správně „service_role · svtrlztjlxxjrbncukmp“.
 */
function keyInfo(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return 'chybí'
  try {
    const part = key.trim().split('.')[1]
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return `${json.role ?? '?'} · ${json.ref ?? '?'}${key !== key.trim() ? ' · mezery navíc' : ''}`
  } catch {
    return `jiný formát (${key.slice(0, 8)}…)`
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Neautorizováno.' }, { status: 401 })
  }

  try {
    const result = await runBookingTick(adminDb())
    return NextResponse.json({ ok: true, klic: keyInfo(), ...result })
  } catch (err) {
    console.error('[cron/booking-tick]', err)
    return NextResponse.json({ ok: false, error: 'Chyba při zpracování.' }, { status: 500 })
  }
}
