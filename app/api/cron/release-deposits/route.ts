// app/api/cron/release-deposits/route.ts
// Denní úklid: uvolní zálohy u zakázek, které zákazník do 7 dnů nepotvrdil.
//
// Spouští Vercel Cron (viz vercel.json). Chráněno tajemstvím CRON_SECRET —
// bez něj by endpoint mohl spustit kdokoli. Vercel posílá hlavičku
// `Authorization: Bearer <CRON_SECRET>` automaticky, když je proměnná nastavená.

import { NextResponse } from 'next/server'
import { autoReleaseStaleDeposits } from '@/lib/actions/payout'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Neautorizováno.' }, { status: 401 })
    }
  }

  try {
    const result = await autoReleaseStaleDeposits()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/release-deposits]', err)
    return NextResponse.json({ ok: false, error: 'Chyba při zpracování.' }, { status: 500 })
  }
}