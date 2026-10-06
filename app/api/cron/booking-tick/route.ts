// app/api/cron/booking-tick/route.ts
// Vrstva 3c: lhůty rezervací každých 5 minut (propadnutí nepotvrzených, připomínky,
// uvolnění opuštěných zámků, záchrana plateb). Volá Supabase pg_cron + pg_net
// (docs/sql/cron-lhuty.sql). Chráněno tajemstvím CRON_SECRET.

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/booking/payments'
import { runBookingTick } from '@/lib/booking/deadlines'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Neautorizováno.' }, { status: 401 })
  }

  try {
    const result = await runBookingTick(adminDb())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/booking-tick]', err)
    return NextResponse.json({ ok: false, error: 'Chyba při zpracování.' }, { status: 500 })
  }
}
