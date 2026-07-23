'use server'
// lib/actions/slot-notify.ts — rozeslání upozornění na uvolněný termín.
//
// Tři publika (poskytovatel si vybere zaškrtnutím):
//   'stali'    — bývalí zákazníci, kterým už uplynul jejich obvyklý interval návštěv
//   'oblibene' — kdo si poskytovatele dal do oblíbených
//   'waitlist' — kdo se přihlásil na čekací listinu u této karty / úkonu
//
// Anti-spam: nikdo nedostane dvě upozornění na tentýž termín (unikátní index
// v slot_notifications), a kdo má v profilu notify_free_slots = false, nedostane nic.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { freeSlotEmail, type FreeSlotItem } from '@/lib/email/free-slot'

type Result = { success: true; sent: number } | { success: false; error: string }

export type Audience = 'stali' | 'oblibene' | 'waitlist'

export type AudienceCounts = {
  stali: number
  oblibene: number
  waitlist: number
  /** Kolik lidí už na tento termín upozornění dostalo (nepošle se jim znovu). */
  alreadyNotified: number
}

// Když zákazník nemá dost historie na výpočet vlastního intervalu, počítáme s tímhle.
const DEFAULT_INTERVAL_DAYS = 28
// Oslovíme, jakmile uplynulo aspoň tolik procent jeho obvyklého intervalu.
const READY_RATIO = 0.8
const DAY_MS = 86400000

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Bývalí zákazníci, kterým se blíží (nebo už uplynul) jejich obvyklý interval.
 * Interval počítáme individuálně z historie: kdo chodí po třech týdnech, dostane
 * zprávu dřív než ten, kdo chodí dvakrát ročně.
 */
async function findRegulars(admin: any, providerId: string): Promise<string[]> {
  const { data: orders } = await admin
    .from('orders')
    .select('customer_id, created_at')
    .eq('provider_id', providerId)
    .eq('status', 'dokonceno')
    .order('created_at', { ascending: true })

  const byCustomer: Record<string, number[]> = {}
  for (const o of (orders ?? []) as { customer_id: string; created_at: string }[]) {
    if (!o.customer_id) continue
    ;(byCustomer[o.customer_id] ??= []).push(new Date(o.created_at).getTime())
  }

  const now = Date.now()
  const ready: string[] = []

  for (const [customerId, times] of Object.entries(byCustomer)) {
    const last = times[times.length - 1]
    const daysSinceLast = (now - last) / DAY_MS

    // Vlastní interval spočítáme jen když má aspoň dvě návštěvy.
    let intervalDays = DEFAULT_INTERVAL_DAYS
    if (times.length >= 2) {
      let sum = 0
      for (let i = 1; i < times.length; i++) sum += (times[i] - times[i - 1]) / DAY_MS
      intervalDays = sum / (times.length - 1)
    }

    if (daysSinceLast >= intervalDays * READY_RATIO) ready.push(customerId)
  }

  return ready
}

/** Kdo si poskytovatele dal do oblíbených. */
async function findFavorites(admin: any, providerId: string): Promise<string[]> {
  const { data } = await admin
    .from('favorites')
    .select('user_id')
    .eq('provider_id', providerId)
  return Array.from(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)))
}

/** Kdo čeká na termín u některé z karet nabízených v tomto okně. */
async function findWaitlist(admin: any, serviceIds: string[]): Promise<string[]> {
  if (serviceIds.length === 0) return []
  const { data } = await admin
    .from('waitlist')
    .select('user_id')
    .in('service_id', serviceIds)
    .eq('is_active', true)
  return Array.from(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)))
}

/** Načte slot + ověří, že patří přihlášenému poskytovateli. */
async function loadOwnedSlot(supabase: any, admin: any, slotId: string) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, error: 'Nejste přihlášeni.' }

  const { data: slot } = await admin
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', slotId)
    .single()

  if (!slot) return { ok: false as const, error: 'Termín nenalezen.' }
  if (slot.provider_id !== user.id) return { ok: false as const, error: 'Tento termín vám nepatří.' }

  const { data: links } = await admin
    .from('slot_services')
    .select('service_id')
    .eq('slot_id', slotId)
  const serviceIds = Array.from(new Set((links ?? []).map((l: { service_id: string }) => l.service_id))) as string[]

  return { ok: true as const, slot, serviceIds, userId: user.id }
}

/** Vyřadí ty, kdo upozornění vypnuli, kdo už ho na tento termín dostal, a poskytovatele samotného. */
async function filterRecipients(
  admin: any, slotId: string, providerId: string, candidates: string[]
): Promise<string[]> {
  const unique = Array.from(new Set(candidates.filter(Boolean))).filter((id) => id !== providerId)
  if (unique.length === 0) return []

  const { data: optedOut } = await admin
    .from('profiles')
    .select('id')
    .in('id', unique)
    .eq('notify_free_slots', false)
  const optedOutSet = new Set((optedOut ?? []).map((p: { id: string }) => p.id))

  const { data: already } = await admin
    .from('slot_notifications')
    .select('user_id')
    .eq('slot_id', slotId)
  const alreadySet = new Set((already ?? []).map((r: { user_id: string }) => r.user_id))

  return unique.filter((id) => !optedOutSet.has(id) && !alreadySet.has(id))
}

/**
 * Počty pro obrazovku „Komu dát vědět?" — poskytovatel vidí čísla dřív, než odešle.
 * Počítáme až po odfiltrování (opt-out, už upozorněni), ať čísla nelžou.
 */
export async function getSlotAudienceCounts(slotId: string): Promise<AudienceCounts> {
  const supabase = createClient()
  const admin = getAdminClient()
  const empty: AudienceCounts = { stali: 0, oblibene: 0, waitlist: 0, alreadyNotified: 0 }

  const loaded = await loadOwnedSlot(supabase, admin, slotId)
  if (!loaded.ok) return empty

  const { slot, serviceIds } = loaded

  const [regulars, favorites, waiting] = await Promise.all([
    findRegulars(admin, slot.provider_id),
    findFavorites(admin, slot.provider_id),
    findWaitlist(admin, serviceIds),
  ])

  const [fStali, fOblibene, fWaitlist] = await Promise.all([
    filterRecipients(admin, slotId, slot.provider_id, regulars),
    filterRecipients(admin, slotId, slot.provider_id, favorites),
    filterRecipients(admin, slotId, slot.provider_id, waiting),
  ])

  const { count } = await admin
    .from('slot_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', slotId)

  return {
    stali: fStali.length,
    oblibene: fOblibene.length,
    waitlist: fWaitlist.length,
    alreadyNotified: count ?? 0,
  }
}

// ── Podklady pro e-mail ─────────────────────────────────────
async function loadEmailContext(admin: any, providerId: string, serviceIds: string[], windowMin: number) {
  const { data: prof } = await admin
    .from('profiles')
    .select('display_name, company_name, full_name')
    .eq('id', providerId)
    .single()

  const providerName =
    prof?.display_name || prof?.company_name || prof?.full_name || 'Poskytovatel'

  const { data: svc } = await admin
    .from('services')
    .select('city')
    .in('id', serviceIds)
    .limit(1)
  const city = (svc ?? [])[0]?.city ?? null

  // Úkony, které se do okna vejdou (model A, zveřejněné) — pro přehled v e-mailu.
  const { data: itemRows } = await admin
    .from('service_items')
    .select('name, price, price_unit, price_type, price_max, duration_minutes, payment_model, is_active')
    .in('service_id', serviceIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const items: FreeSlotItem[] = ((itemRows ?? []) as any[])
    .filter((i) => i.payment_model !== 'B' && (!i.duration_minutes || i.duration_minutes <= windowMin))
    .slice(0, 5)
    .map((i) => {
      let priceText = 'Cena dohodou'
      if (i.price_type === 'range' && i.price != null && i.price_max != null) {
        priceText = `${Number(i.price).toLocaleString('cs-CZ')} – ${Number(i.price_max).toLocaleString('cs-CZ')} Kč`
      } else if (i.price != null && Number(i.price) > 0) {
        priceText = `${Number(i.price).toLocaleString('cs-CZ')} Kč`
      }
      let durationText: string | null = null
      const d = Number(i.duration_minutes ?? 0)
      if (d > 0) durationText = d < 60 ? `${d} min` : (d % 60 === 0 ? `${d / 60} h` : `${Math.floor(d / 60)} h ${d % 60} min`)
      return { name: i.name, priceText, durationText }
    })

  return { providerName, city, items }
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Propojo <notifikace@propojo.cz>',
      to,
      subject,
      html,
    })
    if (error) console.error('[free-slot email]', error)
  } catch (err) {
    console.error('[free-slot email] neočekávaná chyba:', err)
  }
}

async function getUserEmail(admin: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user?.email) return null
    return data.user.email as string
  } catch {
    return null
  }
}

/**
 * Rozešle upozornění vybraným publikům. Jeden člověk dostane jednu zprávu,
 * i když spadá do víc skupin (řadíme podle síly: waitlist > stálí > oblíbení).
 */
export async function notifySlotAudience(slotId: string, audiences: Audience[]): Promise<Result> {
  const supabase = createClient()
  const admin = getAdminClient()

  const loaded = await loadOwnedSlot(supabase, admin, slotId)
  if (!loaded.ok) return { success: false, error: loaded.error }

  const { slot, serviceIds } = loaded
  if (slot.status !== 'volno') return { success: false, error: 'Tento termín už není volný.' }
  if (new Date(slot.starts_at) < new Date()) return { success: false, error: 'Tento termín už proběhl.' }
  if (audiences.length === 0) return { success: false, error: 'Vyberte, komu se má dát vědět.' }

  // Sestavíme příjemce s tím, ze které skupiny přišli (kvůli textu i statistice).
  const assigned = new Map<string, Audience>()

  // Pořadí je záměrné: kdo čeká na termín, má nejsilnější vazbu.
  if (audiences.includes('waitlist')) {
    const ids = await filterRecipients(admin, slotId, slot.provider_id, await findWaitlist(admin, serviceIds))
    for (const id of ids) if (!assigned.has(id)) assigned.set(id, 'waitlist')
  }
  if (audiences.includes('stali')) {
    const ids = await filterRecipients(admin, slotId, slot.provider_id, await findRegulars(admin, slot.provider_id))
    for (const id of ids) if (!assigned.has(id)) assigned.set(id, 'stali')
  }
  if (audiences.includes('oblibene')) {
    const ids = await filterRecipients(admin, slotId, slot.provider_id, await findFavorites(admin, slot.provider_id))
    for (const id of ids) if (!assigned.has(id)) assigned.set(id, 'oblibene')
  }

  if (assigned.size === 0) {
    return { success: false, error: 'Nikdo nový k oslovení — buď už zprávu dostali, nebo upozornění nechtějí.' }
  }

  // Zápis do evidence PŘED odesláním. Unikátní index (slot_id, user_id) je
  // pojistka proti dvojímu odeslání i při souběhu — proto ignorujeme konflikt.
  const rows = Array.from(assigned.entries()).map(([userId, audience]) => ({
    slot_id: slotId,
    user_id: userId,
    audience,
  }))

  const { data: inserted, error: insErr } = await (admin.from('slot_notifications') as any)
    .upsert(rows, { onConflict: 'slot_id,user_id', ignoreDuplicates: true })
    .select('user_id')

  if (insErr) {
    console.error('[notifySlotAudience] evidence:', insErr)
    return { success: false, error: 'Upozornění se nepodařilo odeslat.' }
  }

  const recipients = (inserted ?? []).map((r: { user_id: string }) => r.user_id) as string[]
  if (recipients.length === 0) {
    return { success: false, error: 'Nikdo nový k oslovení — zprávu už dostali.' }
  }

  // ── Odeslání e-mailů ──
  const windowMin = Math.round(
    (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60000
  )
  const ctx = await loadEmailContext(admin, slot.provider_id, serviceIds, windowMin)

  const dayText = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(slot.starts_at))
  const timeText = `${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(slot.starts_at))}–${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(slot.ends_at))}`
  const slotUrl = `${APP_URL}/termin/${slotId}`
  const unsubscribeUrl = `${APP_URL}/dashboard/nastaveni`

  for (const userId of recipients) {
    const email = await getUserEmail(admin, userId)
    if (!email) continue
    const { subject, html } = freeSlotEmail({
      providerName: ctx.providerName,
      dayText,
      timeText,
      city: ctx.city,
      items: ctx.items,
      slotUrl,
      unsubscribeUrl,
      reason: assigned.get(userId) ?? 'oblibene',
    })
    await sendEmail(email, subject, html)
  }

  revalidatePath('/dashboard/terminy')
  return { success: true, sent: recipients.length }
}