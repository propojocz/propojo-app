'use server'
// lib/actions/overview.ts
// Přehled poskytovatele K3 (19. 10. 2026, docs/plan-kalendar.md): co čeká na potvrzení, peníze za tento
// měsíc a poslední hodnocení. Dnešek a týden bere Přehled z Kalendáře (getCalendarDay).
//
// Peníze: jen to, co prošlo Propojem – Rezervační poplatky a Ceny výjezdu stržené tento měsíc
// (commission_ledger podle pražského měsíce stržení), provize Propoja a vratky, které tento měsíc
// opravdu prošly (order_refunds 'succeeded'). Cenu celé zakázky Propojo nezná (model §19), proto
// „Zaplaceno přes Propojo“, ne „výdělek“. Poplatek Stripe Propojo nevidí.

import { createClient } from '@/lib/supabase/server'
import { adminDb } from '@/lib/booking/payments'
import { isoZPrazskehoCasu, prazskyMesic } from '@/lib/format'

export type OverviewAwaiting = {
  id: string
  start: string | null
  title: string
  customer: string
  /** Do kdy potvrdit (orders.confirm_deadline_at) */
  deadline: string | null
}

export type OverviewReview = {
  id: string
  rating: number
  comment: string | null
  name: string
  createdAt: string
}

export type ProviderOverviewData = {
  awaiting: OverviewAwaiting[]
  money: {
    /** 'YYYY-MM-01' */
    month: string
    count: number
    paidHalere: number
    feeHalere: number
    refundedHalere: number
  }
  reviews: OverviewReview[]
}

/** „Jana Nováková“ → „Jana N.“ */
function shortName(full: string | null | undefined): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Zákazník'
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

export async function getProviderOverview(): Promise<ProviderOverviewData | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminDb() as any

  const month = prazskyMesic(new Date())
  const [y, m] = month.split('-').map(Number)
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
  const monthFromIso = isoZPrazskehoCasu(month, '00:00')
  const monthToIso = isoZPrazskehoCasu(nextMonth, '00:00')

  const [awaitingRes, ledgerRes, refundRes, reviewRes] = await Promise.all([
    // ── Čeká na potvrzení ──
    db.from('orders')
      .select('id, customer_id, scheduled_at, confirm_deadline_at, service_items(name), services(title)')
      .eq('provider_id', user.id)
      .in('booking_state', ['awaiting_confirmation', 'capture_in_progress'])
      .order('confirm_deadline_at', { ascending: true, nullsFirst: false })
      .limit(10),
    // ── Stržené platby tento měsíc ──
    db.from('commission_ledger')
      .select('charge_halere, fee_halere')
      .eq('provider_id', user.id)
      .eq('statement_month', month),
    // ── Vratky, které tento měsíc prošly (u objednávek poskytovatele se filtruje níž) ──
    db.from('order_refunds')
      .select('order_id, amount_halere')
      .eq('status', 'succeeded')
      .gte('succeeded_at', monthFromIso)
      .lt('succeeded_at', monthToIso),
    // ── Poslední hodnocení ──
    db.from('reviews')
      .select('id, rating, comment, created_at, reviewer_id')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false })
      .limit(2),
  ])

  const awaitingRows = (awaitingRes.data ?? []) as any[]
  const reviewRows = (reviewRes.data ?? []) as any[]

  // Jména zákazníků a hodnotitelů jedním dotazem
  const personIds = Array.from(new Set([
    ...awaitingRows.map((o) => o.customer_id),
    ...reviewRows.map((r) => r.reviewer_id),
  ].filter(Boolean)))
  const nameOf = new Map<string, string | null>()
  if (personIds.length > 0) {
    const { data: profs } = await db.from('profiles').select('id, full_name').in('id', personIds)
    for (const p of (profs ?? []) as any[]) nameOf.set(p.id, p.full_name ?? null)
  }

  // Vratky jen u objednávek tohoto poskytovatele
  const refunds = (refundRes.data ?? []) as { order_id: string; amount_halere: number | null }[]
  let refundedHalere = 0
  if (refunds.length > 0) {
    const { data: mine } = await db.from('orders').select('id')
      .eq('provider_id', user.id)
      .in('id', Array.from(new Set(refunds.map((r) => r.order_id))))
    const mineIds = new Set(((mine ?? []) as { id: string }[]).map((o) => o.id))
    refundedHalere = refunds.filter((r) => mineIds.has(r.order_id)).reduce((s, r) => s + Number(r.amount_halere ?? 0), 0)
  }

  const ledger = (ledgerRes.data ?? []) as { charge_halere: number | null; fee_halere: number | null }[]

  return {
    awaiting: awaitingRows.map((o) => ({
      id: o.id,
      start: o.scheduled_at ?? null,
      title: o.service_items?.name || o.services?.title || 'Rezervace',
      customer: nameOf.get(o.customer_id) || 'Zákazník',
      deadline: o.confirm_deadline_at ?? null,
    })),
    money: {
      month,
      count: ledger.length,
      paidHalere: ledger.reduce((s, r) => s + Number(r.charge_halere ?? 0), 0),
      feeHalere: ledger.reduce((s, r) => s + Number(r.fee_halere ?? 0), 0),
      refundedHalere,
    },
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: Number(r.rating ?? 0),
      comment: r.comment ?? null,
      name: shortName(nameOf.get(r.reviewer_id)),
      createdAt: r.created_at,
    })),
  }
}
