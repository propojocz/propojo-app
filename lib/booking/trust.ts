// lib/booking/trust.ts
// Důvěryhodnost poskytovatele a limit otevřených zaplacených rezervací (vrstva 4, Matej 13. 10. 2026).
// Ochrana proti podvodu „vybere peníze a zmizí“ – Propojo peníze nedrží, takže riziko omezuje limitem:
//   nový:        součet otevřených zaplacených rezervací nejvýš 3 × 5 000 = 15 000 Kč
//   prověřený:   po 5 dokončených rezervacích bez problémů nejvýš 5 × 5 000 = 25 000 Kč
//   důvěryhodný: po 20 dokončených bez problémů bez limitu + štítek „Důvěryhodný“
// „Problém“ = zrušení z jeho strany (i „nemohu dodržet“ s odmítnutím / vypršením), nahlášené nedostavení, spor.
// Omezení podle P2B – parametry jsou v policy a patří do VOP (LEGAL_REVIEW_NEEDED).

import type { Db } from './payments'
import { BOOKING_POLICY, type BookingPolicy } from './policy'

export type TrustTier = 'new' | 'proven' | 'trusted'

export type ProviderTrust = {
  tier: TrustTier
  /** Dokončené rezervace (potvrzené, termín proběhl) */
  completed: number
  /** Rezervace s problémem (zrušení z jeho strany, nedostavení, spor) */
  problems: number
  /** Součet otevřených zaplacených rezervací v haléřích */
  openHalere: number
  /** Limit otevřených rezervací v haléřích; null = bez limitu */
  limitHalere: number | null
}

const PROVIDER_FAULT_REASONS = ['provider_cancelled', 'reschedule_rejected', 'reschedule_expired', 'no_show_agreed', 'no_show_no_response']
// Předautorizované nebo stržené, případně právě placené – peníze, které by mohl „vybrat“
const OPEN_STATES = ['pending_payment', 'awaiting_confirmation', 'capture_in_progress', 'confirmed']

export function tierOf(completed: number, problems: number, policy: BookingPolicy = BOOKING_POLICY): TrustTier {
  if (problems > 0) return 'new'
  if (completed >= policy.trust.trustedAfterCompleted) return 'trusted'
  if (completed >= policy.trust.provenAfterCompleted) return 'proven'
  return 'new'
}

export function limitOf(tier: TrustTier, policy: BookingPolicy = BOOKING_POLICY): number | null {
  if (tier === 'trusted') return null
  return tier === 'proven' ? policy.trust.provenMaxOpenHalere : policy.trust.newMaxOpenHalere
}

/** Dokončené a problémové rezervace pro více poskytovatelů najednou (štítky na marketplace) */
export async function trustCounts(db: Db, providerIds: string[]): Promise<Map<string, { completed: number; problems: number }>> {
  const out = new Map<string, { completed: number; problems: number }>()
  if (providerIds.length === 0) return out
  for (const id of providerIds) out.set(id, { completed: 0, problems: 0 })
  const nowIso = new Date().toISOString()

  const { data: done } = await db
    .from('orders')
    .select('provider_id')
    .in('provider_id', providerIds)
    .eq('booking_state', 'confirmed')
    .lt('scheduled_end', nowIso)
    .limit(5000)
  for (const o of (done ?? []) as Array<{ provider_id: string }>) out.get(o.provider_id)!.completed++

  const { data: bad } = await db
    .from('orders')
    .select('provider_id, booking_state, cancel_reason, stripe_dispute_status')
    .in('provider_id', providerIds)
    .or(`cancel_reason.in.(${PROVIDER_FAULT_REASONS.join(',')}),booking_state.in.(no_show_reported,no_show_disputed),stripe_dispute_status.not.is.null`)
    .limit(5000)
  for (const o of (bad ?? []) as Array<{ provider_id: string }>) out.get(o.provider_id)!.problems++
  return out
}

export async function providerTrust(db: Db, providerId: string, excludeOrderId?: string | null): Promise<ProviderTrust> {
  const counts = (await trustCounts(db, [providerId])).get(providerId) ?? { completed: 0, problems: 0 }
  const tier = tierOf(counts.completed, counts.problems)

  const { data: open } = await db
    .from('orders')
    .select('id, charge_halere, scheduled_end, booking_state')
    .eq('provider_id', providerId)
    .in('booking_state', OPEN_STATES)
    .limit(2000)
  const now = Date.now()
  const openHalere = ((open ?? []) as Array<{ id: string; charge_halere: number | null; scheduled_end: string | null }>)
    .filter((o) => o.id !== excludeOrderId && (!o.scheduled_end || new Date(o.scheduled_end).getTime() > now))
    .reduce((s, o) => s + Number(o.charge_halere ?? 0), 0)

  return { tier, completed: counts.completed, problems: counts.problems, openHalere, limitHalere: limitOf(tier) }
}
