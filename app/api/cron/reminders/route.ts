// app/api/cron/reminders/route.ts
// Denní rozeslání připomínek na zítřejší termíny.
// Spouští Vercel Cron (vercel.json). Chráněno CRON_SECRET jako výplaty.

import { NextResponse } from 'next/server'
import { sendTomorrowReminders } from '@/lib/actions/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  // Bez nastaveného CRON_SECRET by endpoint mohl spustit kdokoli → odmítnout.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Neautorizováno.' }, { status: 401 })
  }

  try {
    const result = await sendTomorrowReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/reminders]', err)
    return NextResponse.json({ ok: false, error: 'Chyba při zpracování.' }, { status: 500 })
  }
}