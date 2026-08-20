'use server'
// lib/actions/day-schedule.ts
// VRSTVA 5 — denní panel poskytovatele „kdo přijde a v kolik".
//
// Zdroj dat jsou OBJEDNÁVKY s termínem (orders.scheduled_at), ne volná okna.
// Panel ukazuje potvrzené rezervace, ty co se právě platí (živý zámek),
// a blokace času. Odsud jde i odškrtnout příchod zákazníka a zablokovat čas.

import { revalidatePath } from 'next/cache'
import { isoZPrazskehoCasu } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type Attendance = 'dorazil' | 'jinak' | 'nedorazil' | null

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
  /** Jak termín dopadl: 'dorazil' | 'jinak' | 'nedorazil' | null (neoznačeno) */
  attendance?: Attendance
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
  // Hranice dne podle pražského času — v zimě je posun o hodinu jiný a rozvrh
  // by ukazoval půlnoční objednávku o den vedle.
  const dayStart = new Date(isoZPrazskehoCasu(target, '00:00'))
  const dayEnd = new Date(isoZPrazskehoCasu(target, '23:59'))

  const admin = getAdminClient()

  // ── Rezervace s termínem ───────────────────────────────────
  const { data: orderRows } = await admin
    .from('orders')
    .select('id, customer_id, status, scheduled_at, scheduled_end, deposit_status, deposit_amount, hold_expires_at, arrived_at, attendance, service_items(name), services(title)')
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
      attendance: (o.attendance ?? null) as Attendance,
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

/**
 * Označit, jak termín dopadl. Tři stavy v jednom poli, ať se nemůže stát,
 * že je zákazník zároveň „dorazil" i „nedorazil".
 *   dorazil   — přišel, vše proběhlo
 *   jinak     — domluvili se jinak (přeloženo, jiný rozsah); BEZ postihu
 *   nedorazil — no-show; podklad pro poplatek za nedostavení u úkonu
 * Poslání stejné hodnoty znovu označení zruší (přepínač).
 */
export async function setAttendance(orderId: string, value: Attendance, customFee?: number | null): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders').select('provider_id, attendance').eq('id', orderId).single() as { data: any }
  if (!order || order.provider_id !== user.id) {
    return { success: false, error: 'K této objednávce nemáte přístup.' }
  }

  // Kliknutí na už zvolený stav ho zruší.
  const next = order.attendance === value ? null : value

  // U „nedorazil" si poznamenáme okamžik — od něj běží 24 h na námitku zákazníka.
  // Poplatek zmrazíme na objednávce, ať se o částce nedá později vést spor.
  let extra: Record<string, any> = { no_show_marked_at: null }
  if (next === 'nedorazil') {
    const { data: full } = await admin
      .from('orders')
      .select('no_show_fee_amount, service_items(no_show_fee)')
      .eq('id', orderId)
      .single() as { data: any }
    // Nastavená výše poplatku u úkonu (strop, který poskytovatel nesmí překročit).
    const nastaveno = Number(full?.no_show_fee_amount ?? full?.service_items?.no_show_fee ?? 0)
    // Poskytovatel může v modalu částku SNÍŽIT (stálému klientovi odpustit),
    // ne však zvýšit nad nastavenou hodnotu. customFee undefined = bere nastavené.
    let fee = nastaveno
    if (customFee != null) {
      fee = Math.max(0, Math.min(Number(customFee), nastaveno))
    }
    extra = {
      no_show_marked_at: new Date().toISOString(),
      no_show_fee_amount: fee > 0 ? fee : null,
    }
  }

  const { error } = await (admin.from('orders') as any)
    .update({
      attendance: next,
      // arrived_at držíme dál jako časový záznam příchodu (doklad při sporu).
      arrived_at: next === 'dorazil' ? new Date().toISOString() : null,
      ...extra,
    })
    .eq('id', orderId)

  if (error) {
    console.error('[setAttendance]', error)
    return { success: false, error: 'Nepodařilo se uložit. Proběhlo SQL vrstvy 10?' }
  }

  // Zákazník musí vědět, co se děje a do kdy se může ozvat. Tohle je jádro toho,
  // aby platforma nemusela nic posuzovat: informuje jasně a lhůta běží sama.
  if (next === 'nedorazil') {
    try {
      const { data: o } = await admin
        .from('orders').select('customer_id, no_show_fee_amount, service_items(name)')
        .eq('id', orderId).single() as { data: any }
      const fee = Number(o?.no_show_fee_amount ?? 0)
      await createNotification({
        userId: o.customer_id,
        type: 'status_change',
        orderId,
        actorId: user.id,
        title: 'Poskytovatel označil, že jste nedorazil(a)',
        preview: fee > 0
          ? `Poplatek za nedostavení ${fee.toLocaleString('cs-CZ')} Kč se strhne za 24 hodin. Nesouhlasíte? Ozvěte se v objednávce.`
          : 'Nesouhlasíte? Ozvěte se do 24 hodin v objednávce.',
      })
    } catch (err) {
      console.error('[setAttendance] notifikace:', err)
    }
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
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

  // Posun se nesmí psát natvrdo: „+02:00" platí jen v létě, v zimě je Praha
  // o hodinu jinde a blokace by seděla vedle. Přepočet zná lib/format.ts.
  const startIso = isoZPrazskehoCasu(values.date, values.from)
  const endIso = isoZPrazskehoCasu(values.date, values.to)
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

  // Volná okna uvnitř blokace nemají co dělat v nabídce — zákazník by si
  // rezervoval čas, který jste si právě zavřel. Rezervovaná okna necháváme
  // být: ta se řeší přes objednávku (kontrola zaplacené rezervace je výš).
  try {
    const { data: kolize } = await admin
      .from('availability_slots')
      .select('id')
      .eq('provider_id', user.id)
      .eq('status', 'volno')
      .lt('starts_at', endIso)
      .gt('ends_at', startIso) as { data: { id: string }[] | null }

    const ids = (kolize ?? []).map((s) => s.id)
    if (ids.length > 0) {
      await admin.from('slot_services').delete().in('slot_id', ids)
      await admin.from('availability_slots').delete().in('id', ids).eq('status', 'volno')
    }
  } catch (err) {
    // Úklid není kritický — blokace platí tak jako tak.
    console.error('[blockTime] úklid volných oken:', err)
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