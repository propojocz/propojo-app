// lib/slot-share-data.ts
// Veřejné údaje volného termínu pro sdílení (obrázek příspěvku / story, náhled odkazu na Facebooku a WhatsAppu).
// Jen to, co je beztak vidět na veřejné stránce /termin/[id]: poskytovatel, obec, služby, čas, cena od.
// Bez 'use server' – volá ho server action (lib/actions/slot-share.ts) i opengraph-image.

import { createClient as createAdminClient } from '@supabase/supabase-js'

export type SlotShareInfo = {
  slotId: string
  path: string
  providerName: string
  avatarUrl: string | null
  city: string | null
  /** Název hlavní služby (karta nebo jediná položka) */
  title: string
  /** Krátký výčet služeb v termínu („Střih, Vousy“) */
  itemsText: string | null
  /** Všechny služby nabízené v termínu (celé názvy) */
  items: string[]
  startsAt: string
  endsAt: string
  /** Nejnižší cena služby v termínu (Kč), null = cena dohodou */
  priceFromKc: number | null
  /** Délka nejkratší služby (min) */
  durationMin: number | null
  /** Termín je pořád volný a v budoucnu */
  available: boolean
}

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function loadSlotShareInfo(slotId: string): Promise<SlotShareInfo | null> {
  const db = admin()
  const { data: slot } = await db
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', slotId)
    .maybeSingle()
  const s = slot as { id: string; provider_id: string; starts_at: string; ends_at: string; status: string } | null
  if (!s) return null

  const { data: links } = await db.from('slot_services').select('service_id, item_ids').eq('slot_id', slotId)
  const linkRows = (links ?? []) as Array<{ service_id: string; item_ids: string[] | null }>
  const serviceIds = linkRows.map((l) => l.service_id)

  const { data: services } = serviceIds.length
    ? await db.from('services').select('id, title, city').in('id', serviceIds).eq('is_active', true)
    : { data: [] }
  const svc = (services ?? []) as Array<{ id: string; title: string; city: string | null }>

  const { data: items } = serviceIds.length
    ? await db.from('service_items').select('id, service_id, name, price, price_type, duration_minutes').in('service_id', serviceIds).eq('is_active', true).eq('payment_model', 'A')
    : { data: [] }
  const allowed = new Map(linkRows.map((l) => [l.service_id, l.item_ids]))
  const windowMin = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60_000)
  const offered = ((items ?? []) as Array<{ id: string; service_id: string; name: string; price: number | null; price_type: string | null; duration_minutes: number | null }>)
    .filter((i) => {
      const ids = allowed.get(i.service_id)
      return (!ids || ids.length === 0 || ids.includes(i.id)) && (!i.duration_minutes || i.duration_minutes <= windowMin)
    })

  const { data: prof } = await db.from('profiles').select('full_name, company_name, display_name, avatar_url, city').eq('id', s.provider_id).maybeSingle()
  const p = prof as { full_name: string | null; company_name: string | null; display_name: string | null; avatar_url: string | null; city: string | null } | null

  const prices = offered.map((i) => (i.price_type === 'on_agreement' ? null : Number(i.price ?? 0))).filter((v): v is number => v != null && v > 0)
  const durations = offered.map((i) => Number(i.duration_minutes ?? 0)).filter((v) => v > 0)
  const names = Array.from(new Set(offered.map((i) => i.name)))

  return {
    slotId: s.id,
    path: `/termin/${s.id}`,
    providerName: p?.display_name || p?.company_name || p?.full_name || 'Poskytovatel',
    avatarUrl: p?.avatar_url ?? null,
    city: svc[0]?.city ?? p?.city ?? null,
    // Hlavní nadpis = název karty („Elektrikář Jakub Majty“), služby z ceníku jsou v items
    title: svc[0]?.title ?? names[0] ?? 'Volný termín',
    itemsText: names.length > 1 ? names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '') : null,
    items: names,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    priceFromKc: prices.length ? Math.min(...prices) : null,
    durationMin: durations.length ? Math.min(...durations) : null,
    available: s.status === 'volno' && new Date(s.starts_at).getTime() > Date.now(),
  }
}
