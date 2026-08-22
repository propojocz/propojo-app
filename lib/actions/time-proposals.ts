'use server'
// lib/actions/time-proposals.ts
// VRSTVA 4 — návrh termínů u poptávky bez termínu.
//
// Tok: zákazník pošle poptávku → poskytovatel navrhne 1–6 časů (předvyplněných
// z jeho dostupnosti, ať se nebijí s tím, co už má) → zákazník jeden vybere a
// zaplatí zálohu, čímž je termín potvrzený. Nebo odmítne a domluví se v chatu.
//
// Návrhy se NEDRŽÍ. Až přijetím návrhu vznikne dočasný hold; u objednávky se
// zálohou ho Stripe potvrdí platbou. Při změně už zaplaceného termínu se znovu neplatí.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'
import { getFreeTimes } from '@/lib/actions/free-times'
import { releaseSlotAndMerge } from '@/lib/slot-merge'
import { claimMatchingAvailabilitySlot } from '@/lib/slot-claim'

// Stripe checkout běží 30 minut. Držíme o 5 minut déle kvůli zpoždění webhooku.
const HOLD_MINUTES = 35
const MAX_PROPOSALS = 6

export type Proposal = { id: string; starts_at: string; ends_at: string }

type Result = { success: true } | { success: false; error: string }
type AcceptResult =
  | { success: true; needsPayment: boolean }
  | { success: false; error: string }

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague',
  }).format(new Date(iso))

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function loadOrder(orderId: string) {
  const admin = getAdminClient()
  const { data } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, service_id, service_item_id, status, scheduled_at, scheduled_end, slot_id, deposit_status, deposit_amount, hold_expires_at, pref_date_from, pref_date_to, pref_time, service_items(name, duration_minutes, buffer_minutes, deposit_amount, payment_model)')
    .eq('id', orderId)
    .single() as { data: any }
  return data
}

/**
 * Kandidátní volné časy pro panel poskytovatele.
 *
 * Dřív jsme vraceli jen první 3 termíny z 14 dnů. Když zákazník chtěl termín
 * až příští měsíc, provider si musel časy znovu ručně vypisovat. Teď:
 *  - respektujeme preferované datum od/do a denní dobu zákazníka,
 *  - díváme se až 60 dní dopředu (podle preference až 120),
 *  - vracíme více kandidátů, ale max. 4 z jednoho dne a 24 celkem.
 *
 * Kandidát je jen nabídka v UI. Jeho odškrtnutí ani neposlání NIC nemaže z
 * kalendáře; do order_time_proposals se uloží až skutečně vybrané časy.
 */
export async function suggestTimes(orderId: string): Promise<{ start: string; end: string }[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const order = await loadOrder(orderId)
  if (!order || order.provider_id !== user.id) return []
  if (!order.service_id || !order.service_item_id) return []

  const DAY_MS = 24 * 60 * 60 * 1000
  let daysAhead = 60
  if (order.pref_date_to) {
    const prefEnd = new Date(`${order.pref_date_to}T23:59:59Z`).getTime()
    if (Number.isFinite(prefEnd)) {
      daysAhead = Math.min(120, Math.max(14, Math.ceil((prefEnd - Date.now()) / DAY_MS) + 2))
    }
  }

  let days = await getFreeTimes(order.service_id, order.service_item_id, daysAhead)

  if (order.pref_date_from) days = days.filter((d) => d.date >= order.pref_date_from)
  if (order.pref_date_to) days = days.filter((d) => d.date <= order.pref_date_to)

  const timePref = order.pref_time as string | null
  const fitsTimePreference = (iso: string) => {
    if (!timePref || timePref === 'kdykoli') return true
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague', hour: '2-digit', hour12: false,
    }).format(new Date(iso)))
    if (timePref === 'rano') return hour >= 8 && hour < 12
    if (timePref === 'odpoledne') return hour >= 12 && hour < 17
    if (timePref === 'vecer') return hour >= 17 && hour < 20
    return true
  }

  const out: { start: string; end: string }[] = []
  const current = order.scheduled_at ? new Date(order.scheduled_at).toISOString() : null

  for (const day of days) {
    const candidates = day.times
      .filter((t) => !t.locked)
      .filter((t) => fitsTimePreference(t.start))
      .filter((t) => !current || new Date(t.start).toISOString() !== current)
      .slice(0, 4)

    for (const t of candidates) {
      out.push({ start: t.start, end: t.end })
      if (out.length >= 24) return out
    }
  }

  return out
}

/** Načte aktuální návrhy objednávky (pro obě strany). */
export async function getProposals(orderId: string): Promise<Proposal[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('order_time_proposals')
    .select('id, starts_at, ends_at')
    .eq('order_id', orderId)
    .order('starts_at', { ascending: true }) as { data: Proposal[] | null }
  return data ?? []
}

/** Poskytovatel odešle návrhy. Staré nahradí novými. */
export async function proposeTimes(orderId: string, starts: string[]): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const order = await loadOrder(orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.provider_id !== user.id) {
    return { success: false, error: 'Termín může navrhnout jen poskytovatel.' }
  }
  if (order.status === 'zruseno' || order.status === 'dokonceno' || order.status === 'ceka_potvrzeni') {
    return { success: false, error: 'U uzavřené objednávky termín navrhnout nelze.' }
  }
  if (order.deposit_status === 'pending') {
    return { success: false, error: 'Zákazník právě dokončuje platbu. Nejdřív musí platbu dokončit nebo zrušit.' }
  }
  if (order.scheduled_at && new Date(order.scheduled_at).getTime() <= Date.now()) {
    return { success: false, error: 'Probíhající nebo už proběhlý termín nelze tímto způsobem měnit.' }
  }

  const clean = Array.from(new Set(starts.filter(Boolean))).slice(0, MAX_PROPOSALS)
  if (clean.length === 0) return { success: false, error: 'Vyberte alespoň jeden termín.' }
  if (order.scheduled_at && clean.some((x) => new Date(x).toISOString() === new Date(order.scheduled_at).toISOString())) {
    return { success: false, error: 'Nový návrh je stejný jako současný termín.' }
  }

  // Délku bereme z úkonu; když ji nemá, počítáme hodinu, ať má termín konec.
  const duration = Number(order.service_items?.duration_minutes ?? 0) || 60

  const rows: { order_id: string; starts_at: string; ends_at: string }[] = []
  for (const s of clean) {
    const d = new Date(s)
    if (isNaN(d.getTime())) return { success: false, error: 'Neplatný termín.' }
    if (d.getTime() < Date.now()) return { success: false, error: 'Termín nemůže být v minulosti.' }
    rows.push({
      order_id: orderId,
      starts_at: d.toISOString(),
      ends_at: new Date(d.getTime() + duration * 60000).toISOString(),
    })
  }

  const admin = getAdminClient()
  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  const { error } = await (admin.from('order_time_proposals') as any).insert(rows)
  if (error) {
    console.error('[proposeTimes]', error)
    return { success: false, error: 'Návrh se nepodařilo odeslat.' }
  }

  const isReschedule = !!order.scheduled_at
  const navrhyText = rows.map((r) => fmtWhen(r.starts_at)).join(', ')

  // Zákazník dostane oznámení do zvonečku i push do telefonu.
  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: isReschedule
        ? 'Poskytovatel navrhl změnu termínu'
        : rows.length === 1 ? 'Poskytovatel navrhl termín' : `Poskytovatel navrhl ${rows.length} termíny`,
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[proposeTimes] notifikace:', err)
  }

  // Důležitou historii necháváme i v chatu. Proposal řádky jsou jen aktuální nabídka.
  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: isReschedule
        ? `Navrhuji změnu termínu z ${fmtWhen(order.scheduled_at)} na: ${navrhyText}. Původní termín zatím zůstává platný.`
        : rows.length === 1
          ? `Navrhuji termín ${navrhyText}. Potvrďte ho prosím nahoře v objednávce.`
          : `Navrhuji termíny: ${navrhyText}. Vyberte si prosím jeden nahoře v objednávce.`,
    })
  } catch (err) {
    console.error('[proposeTimes] zpráva:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}


/**
 * Zákazník přijal jeden z návrhů. Termín se zapíše na objednávku a když je
 * záloha, nasadí se dočasný zámek po dobu checkoutu. U změny už zaplaceného termínu se znovu neplatí.
 */
export async function acceptProposal(orderId: string, start: string): Promise<AcceptResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const order = await loadOrder(orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Termín může přijmout jen zákazník.' }
  }
  if (order.status === 'zruseno' || order.status === 'dokonceno' || order.status === 'ceka_potvrzeni') {
    return { success: false, error: 'U této objednávky už termín změnit nelze.' }
  }

  const isReschedule = !!order.scheduled_at
  if (isReschedule && new Date(order.scheduled_at).getTime() <= Date.now()) {
    return { success: false, error: 'Probíhající nebo už proběhlý termín nelze změnit.' }
  }
  if (isReschedule && order.deposit_status === 'pending') {
    return { success: false, error: 'Nejdřív dokončete nebo zrušte probíhající platbu.' }
  }

  const admin = getAdminClient()

  // Návrh musí opravdu existovat — klientovi se nevěří.
  const { data: proposal } = await admin
    .from('order_time_proposals')
    .select('id, starts_at, ends_at')
    .eq('order_id', orderId)
    .eq('starts_at', new Date(start).toISOString())
    .maybeSingle() as { data: any }

  if (!proposal) return { success: false, error: 'Tento termín už není v nabídce. Obnovte stránku.' }
  if (new Date(proposal.starts_at).getTime() < Date.now()) {
    return { success: false, error: 'Tento termín už proběhl. Požádejte o nový.' }
  }

  // Nekoliduje termín s něčím, co poskytovatel mezitím dostal? Některé starší
  // objednávky nemají scheduled_end, proto konec dopočítáme z délky úkonu.
  const { data: clashRows } = await admin
    .from('orders')
    .select('id, scheduled_at, scheduled_end, deposit_status, hold_expires_at, service_items(duration_minutes)')
    .eq('provider_id', order.provider_id)
    .neq('status', 'zruseno')
    .neq('id', orderId)
    .not('scheduled_at', 'is', null)
    .lt('scheduled_at', proposal.ends_at) as { data: any[] | null }

  const proposalStartMs = new Date(proposal.starts_at).getTime()
  const proposalEndMs = new Date(proposal.ends_at).getTime()
  const liveClash = (clashRows ?? []).some((c) => {
    if (c.deposit_status === 'pending' && c.hold_expires_at) {
      if (new Date(c.hold_expires_at).getTime() <= Date.now()) return false
    }
    const startMs = new Date(c.scheduled_at).getTime()
    const fallbackDur = Number(c.service_items?.duration_minutes ?? 60) || 60
    const endMs = c.scheduled_end
      ? new Date(c.scheduled_end).getTime()
      : startMs + fallbackDur * 60_000
    return proposalStartMs < endMs && proposalEndMs > startMs
  })

  if (liveClash) {
    return { success: false, error: 'Tento termín mezitím obsadil někdo jiný. Požádejte poskytovatele o nový.' }
  }

  const deposit = Number(order.deposit_amount ?? order.service_items?.deposit_amount ?? 0)
  const isModelB = order.service_items?.payment_model === 'B'
  const alreadyPaid = order.deposit_status === 'paid' || order.deposit_status === 'released'
  const needsPayment = !isModelB && deposit > 0 && !alreadyPaid
  const oldScheduledAt = order.scheduled_at as string | null
  const oldSlotId = order.slot_id as string | null

  // Když už se nebude čekat na platbu, zkusíme potvrzený čas rovnou vyříznout i
  // z fyzického availability_slotu. Když provider čas navrhl ručně mimo své volné
  // okno, helper vrátí null a blokace zůstane jen přes orders.scheduled_at.
  const claimedNewSlotId = !needsPayment && order.service_id
    ? await claimMatchingAvailabilitySlot(admin, {
        orderId,
        providerId: order.provider_id,
        serviceId: order.service_id,
        startsAt: proposal.starts_at,
        endsAt: proposal.ends_at,
      })
    : null

  const update: Record<string, any> = {
    status: 'prijato',
    scheduled_at: proposal.starts_at,
    scheduled_end: proposal.ends_at,
    slot_id: claimedNewSlotId ?? (isReschedule ? null : (order.slot_id ?? null)),
    deposit_amount: needsPayment ? deposit : order.deposit_amount ?? null,
    deposit_status: needsPayment
      ? 'pending'
      : alreadyPaid
        ? order.deposit_status
        : order.deposit_status ?? 'none',
    hold_expires_at: needsPayment
      ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString()
      : null,
  }

  const { error } = await (admin.from('orders') as any)
    .update(update)
    .eq('id', orderId)
    .eq('customer_id', user.id)

  if (error) {
    console.error('[acceptProposal]', error)
    if (claimedNewSlotId) await releaseSlotAndMerge(admin, claimedNewSlotId, orderId)
    return { success: false, error: 'Termín se nepodařilo potvrdit.' }
  }

  // Když původní termín vznikl přímou rezervací availability_slotu, po úspěšném
  // přepnutí objednávky ho uvolníme. Když se merge nepovede, nový termín zůstává
  // platný a chybu zalogujeme — lepší ghost slot než přijít o potvrzenou objednávku.
  if (isReschedule && oldSlotId) {
    const released = await releaseSlotAndMerge(admin, oldSlotId, orderId)
    if (!released) console.warn('[acceptProposal] původní slot se nepodařilo uvolnit', oldSlotId)
  }

  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  // Historie změny v chatu.
  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: isReschedule && oldScheduledAt
        ? `Potvrzuji změnu termínu z ${fmtWhen(oldScheduledAt)} na ${fmtWhen(proposal.starts_at)}.`
        : `Potvrzuji termín ${fmtWhen(proposal.starts_at)}.`,
    })
  } catch (err) {
    console.error('[acceptProposal] zpráva:', err)
  }

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: isReschedule
        ? 'Zákazník potvrdil nový termín'
        : needsPayment ? 'Zákazník vybral termín — čeká na platbu' : 'Zákazník přijal termín',
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[acceptProposal] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  return { success: true, needsPayment }
}

/** Zákazník odmítl všechny návrhy — poskytovatel to má vědět a nabídnout jiné. */
export async function declineProposals(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const order = await loadOrder(orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Návrh může odmítnout jen zákazník.' }
  }

  const isReschedule = !!order.scheduled_at
  const admin = getAdminClient()
  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: isReschedule
        ? `Navrženou změnu termínu odmítám. Původní termín ${fmtWhen(order.scheduled_at)} zůstává platný.`
        : 'Navržené termíny mi nevyhovují. Prosím o jiné možnosti.',
    })
  } catch (err) {
    console.error('[declineProposals] zpráva:', err)
  }

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: isReschedule
        ? 'Zákazník odmítl změnu termínu — původní termín platí'
        : 'Zákazníkovi nevyhovuje žádný z termínů',
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[declineProposals] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}