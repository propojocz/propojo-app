'use server'
// lib/actions/time-proposals.ts
// VRSTVA 4 — návrh termínů u poptávky bez termínu.
//
// Tok: zákazník pošle poptávku → poskytovatel navrhne 1–6 časů (předvyplněných
// z jeho dostupnosti, ať se nebijí s tím, co už má) → zákazník jeden vybere a
// zaplatí zálohu, čímž je termín potvrzený. Nebo odmítne a domluví se v chatu.
//
// Návrhy se NEDRŽÍ. Termín zabere až zaplacení; do té doby si ho může vzít
// kdokoli jiný. Zámek na 10 minut vzniká teprve přijetím návrhu.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'
import { getFreeTimes } from '@/lib/actions/free-times'

const HOLD_MINUTES = 10
const MAX_PROPOSALS = 6

export type Proposal = { id: string; starts_at: string; ends_at: string }

type Result = { success: true } | { success: false; error: string }
type AcceptResult =
  | { success: true; needsPayment: boolean }
  | { success: false; error: string }

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
    .select('id, customer_id, provider_id, service_id, service_item_id, status, scheduled_at, deposit_status, deposit_amount, service_items(name, duration_minutes, buffer_minutes, deposit_amount, payment_model)')
    .eq('id', orderId)
    .single() as { data: any }
  return data
}

/**
 * Tři nejbližší volné časy pro předvyplnění návrhu.
 * Prázdné pole = poskytovatel nemá vyplněnou otevírací dobu nebo úkon nemá
 * délku; časy si pak zadá ručně.
 */
export async function suggestTimes(orderId: string): Promise<{ start: string; end: string }[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const order = await loadOrder(orderId)
  if (!order || order.provider_id !== user.id) return []
  if (!order.service_id || !order.service_item_id) return []

  const days = await getFreeTimes(order.service_id, order.service_item_id, 14)
  return days
    .flatMap((d) => d.times)
    .filter((t) => !t.locked)
    .slice(0, 3)
    .map((t) => ({ start: t.start, end: t.end }))
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
  if (order.status === 'zruseno' || order.status === 'dokonceno') {
    return { success: false, error: 'U uzavřené objednávky termín navrhnout nelze.' }
  }

  const clean = Array.from(new Set(starts.filter(Boolean))).slice(0, MAX_PROPOSALS)
  if (clean.length === 0) return { success: false, error: 'Vyberte alespoň jeden termín.' }

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

  // Zákazník dostane oznámení do zvonečku i push do telefonu.
  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: rows.length === 1 ? 'Poskytovatel navrhl termín' : `Poskytovatel navrhl ${rows.length} termíny`,
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[proposeTimes] notifikace:', err)
  }

  // Do chatu jen krátká zpráva — samotný výběr je nahoře v panelu, ať se
  // nemusí sahat na strukturu zpráv kvůli tlačítkům.
  try {
    await (admin.from('messages') as any).insert({
      order_id: orderId,
      sender_id: user.id,
      content: rows.length === 1
        ? 'Navrhl jsem vám termín — najdete ho nahoře nad chatem.'
        : 'Navrhl jsem vám termíny — vyberte si nahoře nad chatem.',
    })
  } catch (err) {
    console.error('[proposeTimes] zpráva:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}

/**
 * Zákazník přijal jeden z návrhů. Termín se zapíše na objednávku a když je
 * záloha, nasadí se zámek na 10 minut — do té doby má zaplatit.
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
  if (order.status === 'zruseno') return { success: false, error: 'Objednávka je zrušená.' }

  const admin = getAdminClient()

  // Návrh musí opravdu existovat — klientovi se nevěří.
  const { data: proposal } = await admin
    .from('order_time_proposals')
    .select('id, starts_at, ends_at')
    .eq('order_id', orderId)
    .eq('starts_at', new Date(start).toISOString())
    .maybeSingle() as { data: any }

  if (!proposal) return { success: false, error: 'Tento termín už není v nabídce. Obnovte stránku.' }

  const startDate = new Date(proposal.starts_at)
  if (startDate.getTime() < Date.now()) {
    return { success: false, error: 'Tento termín už proběhl. Požádejte o nový.' }
  }

  // Nekoliduje termín s něčím, co poskytovatel mezitím dostal?
  const { data: clash } = await admin
    .from('orders')
    .select('id, deposit_status, hold_expires_at')
    .eq('provider_id', order.provider_id)
    .neq('status', 'zruseno')
    .neq('id', orderId)
    .lt('scheduled_at', proposal.ends_at)
    .gt('scheduled_end', proposal.starts_at) as { data: any[] | null }

  const live = (clash ?? []).filter((c) => {
    if (c.deposit_status === 'pending' && c.hold_expires_at) {
      return new Date(c.hold_expires_at).getTime() > Date.now()
    }
    return true
  })
  if (live.length > 0) {
    return { success: false, error: 'Tento termín mezitím obsadil někdo jiný. Požádejte poskytovatele o nový.' }
  }

  // Záloha: přednost má částka uložená na objednávce, pak úkon.
  const deposit = Number(order.deposit_amount ?? order.service_items?.deposit_amount ?? 0)
  const isModelB = order.service_items?.payment_model === 'B'
  const needsPayment = !isModelB && deposit > 0

  const { error } = await (admin.from('orders') as any)
    .update({
      status: 'prijato',
      scheduled_at: proposal.starts_at,
      scheduled_end: proposal.ends_at,
      deposit_amount: needsPayment ? deposit : order.deposit_amount ?? null,
      deposit_status: needsPayment ? 'pending' : order.deposit_status ?? 'none',
      hold_expires_at: needsPayment
        ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString()
        : null,
    })
    .eq('id', orderId)
    .eq('customer_id', user.id)

  if (error) {
    console.error('[acceptProposal]', error)
    return { success: false, error: 'Termín se nepodařilo potvrdit.' }
  }

  // Ostatní návrhy už nemají smysl.
  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  // Bez zálohy je hotovo hned — dáme vědět poskytovateli. S zálohou počkáme
  // na zaplacení, to hlásí webhook.
  if (!needsPayment) {
    try {
      await createNotification({
        userId: order.provider_id,
        type: 'status_change',
        orderId,
        actorId: user.id,
        title: 'Zákazník přijal termín',
        preview: order.service_items?.name ?? null,
      })
    } catch (err) {
      console.error('[acceptProposal] notifikace:', err)
    }
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
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

  const admin = getAdminClient()
  await admin.from('order_time_proposals').delete().eq('order_id', orderId)

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: 'Zákazníkovi nevyhovuje žádný z termínů',
      preview: order.service_items?.name ?? null,
    })
  } catch (err) {
    console.error('[declineProposals] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}