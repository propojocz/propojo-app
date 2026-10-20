'use server'
// lib/actions/recent-services.ts
// „Naposledy prohlížené“ na marketplace (20. 10. 2026): seznam id karet si drží prohlížeč (localStorage,
// RememberViewed na detailu karty), server k nim jen dotáhne aktuální údaje do malých karet.
// Neaktivní a smazané karty vypadnou. Žádná historie prohlížení se na serveru neukládá.

import { createClient } from '@/lib/supabase/server'
import type { MiniCard } from '@/components/ui/MiniServiceCard'

export async function getRecentServices(ids: string[]): Promise<MiniCard[]> {
  const clean = Array.from(new Set((ids ?? []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 12)
  if (clean.length === 0) return []
  const supabase = createClient()
  const [{ data: svc }, { data: items }, { data: slots }] = await Promise.all([
    supabase.from('services').select('id, title, image_url, gallery, city, is_active').in('id', clean).eq('is_active', true),
    supabase.from('service_items').select('service_id, price, payment_model, offer_kind').in('service_id', clean).eq('is_active', true),
    supabase.from('availability_slots').select('starts_at, slot_services!inner(service_id)')
      .eq('status', 'volno').eq('pending_confirm', false).gte('starts_at', new Date().toISOString())
      .in('slot_services.service_id', clean),
  ])
  const withSlots = new Set<string>()
  for (const r of (slots ?? []) as any[]) for (const l of (r.slot_services ?? [])) if (l.service_id) withSlots.add(l.service_id)
  const byId = new Map(((svc ?? []) as any[]).map((s) => [s.id, s]))
  return clean.filter((id) => byId.has(id)).map((id) => {
    const s = byId.get(id)
    const its = ((items ?? []) as any[]).filter((i) => i.service_id === id)
    const priced = its.filter((i) => i.payment_model !== 'B' && Number(i.price) > 0).map((i) => Number(i.price))
    const onlyQuote = its.length > 0 && its.every((i) => i.payment_model === 'B' || i.offer_kind === 'B')
    return {
      id,
      title: s.title,
      image: (s.gallery ?? [])[0] ?? s.image_url ?? null,
      place: s.city ?? null,
      priceText: priced.length > 0 ? `od ${Math.min(...priced).toLocaleString('cs-CZ')} Kč` : onlyQuote ? 'Výjezd a nacenění' : 'Cena dohodou',
      hasSlots: withSlots.has(id),
    }
  })
}
