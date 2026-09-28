// app/api/cron/release-deposits/route.ts
// Denní úklid peněz a termínů — pět věcí naráz, ať stačí jeden cron:
//   1) uvolní zálohy u zakázek, které zákazník do 7 dnů nepotvrdil,
//   2) vyřídí nedostavení, kde zákazník do 24 h nepodal námitku
//      (storno poskytovateli, zbytek zpět zákazníkovi),
//   3) vyřídí storna, kde poskytovatel do 24 h poplatek neodpustil,
//   4) uvolní termíny u rezervací, které zákazník do 24 h nezaplatil,
//   5) zruší objednávky výrobků, které poskytovatel včas nepotvrdil —
//      tím se uvolní držené kusy i denní kapacita.
//
// Spouští Vercel Cron (vercel.json). Chráněno tajemstvím CRON_SECRET —
// bez něj by endpoint mohl spustit kdokoli.

import { NextResponse } from 'next/server'
import {
  autoReleaseStaleDeposits,
  autoResolveNoShows,
  autoResolveStorno,
  autoReleaseUnpaidReservations,
} from '@/lib/actions/payout'
import { autoDeclineExpiredConfirmations } from '@/lib/actions/product-order'
import { adminDb, rescueBookings } from '@/lib/booking/payments'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  // Bez nastaveného CRON_SECRET by endpoint mohl spustit kdokoli → odmítnout.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Neautorizováno.' }, { status: 401 })
  }

  try {
    // Běží nezávisle na sobě — chyba v jednom nesmí shodit ostatní.
    // Body 1–5 se týkají jen starých objednávek (bez booking_state).
    const [deposits, noShows, storna, nezaplacene, nepotvrzene, rezervaceV2] = await Promise.allSettled([
      autoReleaseStaleDeposits(),
      autoResolveNoShows(),
      autoResolveStorno(),
      autoReleaseUnpaidReservations(),
      autoDeclineExpiredConfirmations(),
      // Model v2: záchrana, když nedorazil webhook (stav vždy ověří ve Stripe).
      rescueBookings(adminDb()),
    ])

    return NextResponse.json({
      ok: true,
      zalohy: deposits.status === 'fulfilled' ? deposits.value : { chyba: true },
      nedostaveni: noShows.status === 'fulfilled' ? noShows.value : { chyba: true },
      storna: storna.status === 'fulfilled' ? storna.value : { chyba: true },
      nezaplacene_rezervace: nezaplacene.status === 'fulfilled' ? nezaplacene.value : { chyba: true },
      nepotvrzene_vyrobky: nepotvrzene.status === 'fulfilled' ? nepotvrzene.value : { chyba: true },
      rezervace_v2: rezervaceV2.status === 'fulfilled' ? rezervaceV2.value : { chyba: true },
    })
  } catch (err) {
    console.error('[cron/release-deposits]', err)
    return NextResponse.json({ ok: false, error: 'Chyba při zpracování.' }, { status: 500 })
  }
}