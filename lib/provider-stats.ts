// lib/provider-stats.ts
// Metriky poskytovatele pro profil (Booking pruh důvěry).
// Server-only, čte přes běžný createClient (veřejná data).

import { createClient } from '@/lib/supabase/server'

// Průměrná doba odezvy: čas mezi zprávou zákazníka a první následnou
// odpovědí poskytovatele, přes jeho objednávky. Vrací hodinu (číslo) nebo null,
// když není dost dat (méně než 3 spárované odpovědi = nespolehlivé).
export async function getResponseHours(providerId: string): Promise<number | null> {
  const supabase = createClient()

  // Objednávky poskytovatele
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('provider_id', providerId)
    .limit(100) as { data: { id: string }[] | null }

  const orderIds = (orders ?? []).map((o) => o.id)
  if (orderIds.length === 0) return null

  // Zprávy napříč těmi objednávkami
  const { data: msgs } = await supabase
    .from('messages')
    .select('order_id, sender_id, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true }) as { data: { order_id: string; sender_id: string; created_at: string }[] | null }

  if (!msgs || msgs.length === 0) return null

  // Pro každou objednávku: najdi dvojice (zpráva ne-poskytovatele → první následná od poskytovatele)
  const byOrder: Record<string, { sender_id: string; created_at: string }[]> = {}
  for (const m of msgs) {
    ;(byOrder[m.order_id] ??= []).push(m)
  }

  const diffs: number[] = []
  for (const oid of Object.keys(byOrder)) {
    const list = byOrder[oid]
    let waitingSince: number | null = null
    for (const m of list) {
      const isProvider = m.sender_id === providerId
      if (!isProvider) {
        // zákazník napsal – začni měřit (jen pokud už neměříme)
        if (waitingSince === null) waitingSince = new Date(m.created_at).getTime()
      } else if (waitingSince !== null) {
        // poskytovatel odpověděl – zaznamenej rozdíl a resetuj
        const diffH = (new Date(m.created_at).getTime() - waitingSince) / 3_600_000
        if (diffH >= 0 && diffH < 24 * 14) diffs.push(diffH) // ignoruj extrémy > 14 dní
        waitingSince = null
      }
    }
  }

  if (diffs.length < 3) return null
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
  return avg
}

// Počet dokončených zakázek. Vrací číslo (může být 0).
export async function getCompletedCount(providerId: string): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId)
    .eq('status', 'dokonceno')
  return count ?? 0
}

// Nejbližší volné termíny napříč všemi službami poskytovatele (Model A).
// Vrací sloty s názvem jedné z navázaných služeb pro rezervaci.
export async function getUpcomingSlots(providerId: string, limit = 6): Promise<
  { id: string; starts_at: string; ends_at: string; service_id: string; service_title: string }[]
> {
  const supabase = createClient()
  const { data } = await supabase
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, slot_services(service_id, services(title))')
    .eq('provider_id', providerId)
    .eq('status', 'volno')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit) as { data: any[] | null }

  return (data ?? [])
    .map((slot) => {
      const link = (slot.slot_services ?? [])[0]
      if (!link) return null
      return {
        id: slot.id,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        service_id: link.service_id,
        service_title: link.services?.title ?? 'Služba',
      }
    })
    .filter(Boolean) as any[]
}