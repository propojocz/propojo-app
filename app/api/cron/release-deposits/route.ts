// app/api/cron/release-deposits/route.ts
// Denní úklid peněz — dvě věci naráz, ať stačí jeden cron:
//   1) uvolní zálohy u zakázek, které zákazník do 7 dnů nepotvrdil,
//   2) vyřídí nedostavení, kde zákazník do 24 h nepodal námitku
//      (storno poskytovateli, zbytek zpět zákazníkovi).
//
// Spouští Vercel Cron (vercel.json). Chráněno tajemstvím CRON_SECRET —
// bez něj by endpoint mohl spustit kdokoli.

import { NextResponse } from 'next/server'
import { autoReleaseStaleDeposits, autoResolveNoShows } from '@/lib/actions/payout'

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
    // Běží nezávisle na sobě — chyba v jednom nesmí shodit druhé.
    const [deposits, noShows] = await Promise.allSettled([
      autoReleaseStaleDeposits(),
      autoResolveNoShows(),
    ])

    return NextResponse.json({
      ok: true,
      zalohy: deposits.status === 'fulfilled' ? deposits.value : { chyba: true },
      nedostaveni: noShows.status === 'fulfilled' ? noShows.value : { chyba: true },
    })
  } catch (err) {
    console.error('[cron/release-deposits]', err)
    return NextResponse.json({ ok: false, error: 'Chyba při zpracování.' }, { status: 500 })
  }
}