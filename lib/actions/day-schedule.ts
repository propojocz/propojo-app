'use server'
// lib/actions/day-schedule.ts
// VRSTVA 5 — denní panel poskytovatele „kdo přijde a v kolik".
//
// Zdroj dat jsou OBJEDNÁVKY s termínem (orders.scheduled_at), ne volná okna.
// Panel ukazuje potvrzené rezervace, ty co se právě platí (živý zámek),
// a blokace času. Odsud jde i odškrtnout příchod zákazníka a zablokovat čas.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type DayEntry = {
  kind: 'booking' | 'block'
  id: string
  start: string
  end: string
  title: string
  subtitle: string | null
  /** 'paid' | 'pending' | 'none' — jen u rezervací */
  depositStatus?: string | null
  depositAmount?: number | null
  /** Do kdy běží zámek při placení (ISO) */
  holdUntil?: string | null
  /** Označil poskytovatel, že zákazník dorazil? */
  arrived?: boolean
  /** Je to zákazníkova první dokončená zakázka u tohoto poskytovatele? */
  firstVisit?: boolean
  orderId?: string
  customerName?: string | null
}

export type DaySchedule = {
  date: string            // 'YYYY-MM-DD'
  entries: DayEntry[]
}

// Pražské 'YYYY-MM-DD' pro daný okamžik.
function pragueDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/**
 * Rozvrh poskytovatele pro jeden den (default dnešek).
 * dateStr ve formátu 'YYYY-MM-DD' (pražsky).
 */
export async function getDaySchedule(dateStr?: string): Promise<DaySchedule> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { date: dateStr ?? pragueDate(new Date()), entries: [] }

  const target = dateStr ?? pragueDate(new Date())
  // Hranice dne v pražském čase → UTC okamžiky.
  const dayStart = new Date(`${target}T00:00:00+02:00`)
  const dayEnd = new Date(`${target}T23:59:59+02:00`)
  // +02:00 je letní čas; drobný přesah přes půlnoc nevadí, filtrujeme < dayEnd.

  const admin = getAdminClient()

  // ── Rezervace s termínem ───────────────────────────────────
  const { data: orderRows } = await admin
    .from('orders')
    .select('id, customer_id, status, scheduled_at, scheduled_end, deposit_status, deposit_amount, hold_expires_at, arrived_at, service_items(name), services(title)')
    .eq('provider_id', user.id)
    .neq('status', 'zruseno')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', dayStart.toISOString())
    .lt('scheduled_at', dayEnd.toISOString())
    .order('scheduled_at', { ascending: true }) as { data: any[] | null }

  const orders = (orderRows ?? []).filter((o) => {
    // Nezaplacené rezervace s prošlým zámkem už termín nedrží → do panelu nepatří.
    if (o.deposit_status === 'pending' && o.hold_expires_at) {
      return new Date(o.hold_expires_at).getTime() > Date.now()
    }
    return true
  })

  // Kolikátá návštěva? Spočítáme dokončené zakázky každého zákazníka.
  const customerIds = Array.from(new Set(orders.map((o) => o.customer_id).filter(Boolean)))
  const firstVisitOf: Record<string, boolean> = {}
  const nameOf: Record<string, string> = {}
  if (customerIds.length > 0) {
    const { data: profs } = await admin
      .from('profiles').select('id, full_name').in('id', customerIds) as { data: any[] | null }
    for (const p of profs ?? []) nameOf[p.id] = p.full_name ?? 'Zákazník'

    for (const cid of customerIds) {
      const { count } = await admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', user.id)
        .eq('customer_id', cid)
        .eq('status', 'dokonceno')
      firstVisitOf[cid] = (count ?? 0) === 0
    }
  }

  // ── Blokace ────────────────────────────────────────────────
  const { data: blockRows } = await admin
    .from('provider_blocks')
    .select('id, starts_at, ends_at, reason')
    .eq('provider_id', user.id)
    .lt('starts_at', dayEnd.toISOString())
    .gt('ends_at', dayStart.toISOString())
    .order('starts_at', { ascending: true }) as { data: any[] | null }

  const entries: DayEntry[] = []

  for (const o of orders) {
    const start = o.scheduled_at
    const end = o.scheduled_end
      ?? new Date(new Date(o.scheduled_at).getTime() + 60 * 60000).toISOString()
    entries.push({
      kind: 'booking',
      id: o.id,
      orderId: o.id,
      start,
      end,
      title: o.service_items?.name || o.services?.title || 'Rezervace',
      subtitle: nameOf[o.customer_id] ?? 'Zákazník',
      customerName: nameOf[o.customer_id] ?? 'Zákazník',
      depositStatus: o.deposit_status ?? 'none',
      depositAmount: o.deposit_amount != null ? Number(o.deposit_amount) : null,
      holdUntil: o.deposit_status === 'pending' ? o.hold_expires_at : null,
      arrived: !!o.arrived_at,
      firstVisit: firstVisitOf[o.customer_id] === true,
    })
  }

  for (const b of blockRows ?? []) {
    entries.push({
      kind: 'block',
      id: b.id,
      start: b.starts_at,
      end: b.ends_at,
      title: b.reason || 'Blokace',
      subtitle: null,
    })
  }

  entries.sort((a, b) => a.start.localeCompare(b.start))
  return { date: target, entries }
}

type Result = { success: true } | { success: false; error: string }

/** Odškrtnout, že zákazník dorazil (nebo přišel omylem — přepínač). */
export async function markArrived(orderId: string, arrived: boolean): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders').select('provider_id').eq('id', orderId).single() as { data: any }
  if (!order || order.provider_id !== user.id) {
    return { success: false, error: 'K této objednávce nemáte přístup.' }
  }

  const { error } = await (admin.from('orders') as any)
    .update({ arrived_at: arrived ? new Date().toISOString() : null })
    .eq('id', orderId)
  if (error) {
    // Sloupec arrived_at nemusí existovat, když neproběhlo SQL vrstvy 5.
    console.error('[markArrived]', error)
    return { success: false, error: 'Nepodařilo se uložit. Proběhlo SQL vrstvy 5?' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true }
}

/** Zablokovat čas — dovolená, doktor, zákazník z ulice. */
export async function blockTime(values: {
  date: string   // 'YYYY-MM-DD'
  from: string   // 'HH:MM'
  to: string     // 'HH:MM'
  reason?: string
  service_id?: string | null   // null = všechny karty
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const startIso = new Date(`${values.date}T${values.from}:00+02:00`).toISOString()
  const endIso = new Date(`${values.date}T${values.to}:00+02:00`).toISOString()
  if (new Date(endIso) <= new Date(startIso)) {
    return { success: false, error: 'Konec musí být po začátku.' }
  }

  const admin = getAdminClient()

  // Nedovolíme zablokovat čas, kde už je ZAPLACENÁ rezervace — tu blokace
  // nepřepíše, musela by se výslovně zrušit (a vrátit záloha).
  const { data: clash } = await admin
    .from('orders')
    .select('id, deposit_status')
    .eq('provider_id', user.id)
    .neq('status', 'zruseno')
    .eq('deposit_status', 'paid')
    .lt('scheduled_at', endIso)
    .gt('scheduled_end', startIso) as { data: any[] | null }

  if ((clash ?? []).length > 0) {
    return { success: false, error: 'V tomhle čase máte zaplacenou rezervaci — tu blokací přepsat nelze. Nejdřív ji zrušte.' }
  }

  const { error } = await (admin.from('provider_blocks') as any).insert({
    provider_id: user.id,
    service_id: values.service_id ?? null,
    starts_at: startIso,
    ends_at: endIso,
    reason: values.reason?.trim() || null,
  })
  if (error) {
    console.error('[blockTime]', error)
    return { success: false, error: 'Blokaci se nepodařilo uložit.' }
  }

  revalidatePath('/dashboard/terminy')
  return { success: true }
}

/** Zrušit blokaci. */
export async function unblockTime(blockId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: block } = await admin
    .from('provider_blocks').select('provider_id').eq('id', blockId).single() as { data: any }
  if (!block || block.provider_id !== user.id) {
    return { success: false, error: 'K této blokaci nemáte přístup.' }
  }

  await admin.from('provider_blocks').delete().eq('id', blockId)
  revalidatePath('/dashboard/terminy')
  return { success: true }
}