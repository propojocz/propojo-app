'use server'
// lib/actions/slot-share.ts – bleskový termín: přehled už vypsaných termínů a data pro sdílení.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { loadSlotShareInfo, type SlotShareInfo } from '@/lib/slot-share-data'

export type MyQuickSlot = { id: string; startsAt: string; endsAt: string; label: string }

/** Moje nejbližší volné vypsané termíny (pro box „Už vypsané“ v okně bleskového termínu) */
export async function getMyUpcomingSlots(limit = 3): Promise<MyQuickSlot[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: slots } = await db
    .from('availability_slots')
    .select('id, starts_at, ends_at')
    .eq('provider_id', user.id)
    .eq('status', 'volno')
    .eq('pending_confirm', false)
    .gt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  const rows = (slots ?? []) as Array<{ id: string; starts_at: string; ends_at: string }>
  if (rows.length === 0) return []

  const { data: links } = await db.from('slot_services').select('slot_id, service_id').in('slot_id', rows.map((r) => r.id))
  const linkRows = (links ?? []) as Array<{ slot_id: string; service_id: string }>
  const { data: svc } = linkRows.length
    ? await db.from('services').select('id, title').in('id', Array.from(new Set(linkRows.map((l) => l.service_id))))
    : { data: [] }
  const titleOf = new Map(((svc ?? []) as Array<{ id: string; title: string }>).map((s) => [s.id, s.title]))

  return rows.map((r) => ({
    id: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    label: linkRows.filter((l) => l.slot_id === r.id).map((l) => titleOf.get(l.service_id)).filter(Boolean).join(', '),
  }))
}

/** Veřejné údaje termínu pro obrázek příspěvku (jen to, co je vidět na /termin/[id]) */
export async function getSlotShareInfo(slotId: string): Promise<SlotShareInfo | null> {
  return loadSlotShareInfo(slotId)
}
