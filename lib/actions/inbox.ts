'use server'
// lib/actions/inbox.ts
// Část B (9. 10. 2026): ikona zpráv v horní liště – jeden přehled všech rozjednaných chatů
// (objednávky i jednání o poptávkách), seřazený podle poslední zprávy, s počtem nepřečtených.
//
// Nepřečtené počítáme z oznámení typu „new_message“ (každá zpráva druhé strany jedno vytváří;
// nesou order_id, u jednání odkaz na chat). Otevřením chatu se tato oznámení označí jako přečtená
// (markThreadRead) – bez nového sloupce v databázi.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type InboxThread = {
  key: string
  href: string
  /** S kým (jméno druhé strany) */
  counterpart: string
  /** O čem (nabídka / položka / obor poptávky) */
  subject: string
  /** Objednávka, nebo jednání o poptávce (před výběrem) */
  kind: 'order' | 'request'
  lastText: string
  lastAt: string
  lastFromMe: boolean
  unread: number
}

export async function getInbox(): Promise<{ threads: InboxThread[]; unread: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { threads: [], unread: 0 }
  const db = admin()

  // Nepřečtené zprávy z oznámení
  const { data: notif } = await db
    .from('notifications')
    .select('order_id, url')
    .eq('user_id', user.id)
    .eq('type', 'new_message')
    .is('read_at', null)
    .limit(500) as { data: Array<{ order_id: string | null; url: string | null }> | null }
  const unreadByOrder = new Map<string, number>()
  const unreadByConv = new Map<string, number>()
  for (const n of notif ?? []) {
    if (n.order_id) unreadByOrder.set(n.order_id, (unreadByOrder.get(n.order_id) ?? 0) + 1)
    else if (n.url) {
      const m = n.url.match(/\/jednani\/([0-9a-f-]{36})/)
      if (m) unreadByConv.set(m[1], (unreadByConv.get(m[1]) ?? 0) + 1)
    }
  }

  const threads: InboxThread[] = []
  const nameIds = new Set<string>()

  // 1) Chaty objednávek
  const { data: orders } = await db
    .from('orders')
    .select('id, customer_id, provider_id, services(title), service_items(name)')
    .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(150) as { data: any[] | null }
  const orderIds = (orders ?? []).map((o) => o.id)
  const lastByOrder = new Map<string, { content: string; created_at: string; sender_id: string }>()
  if (orderIds.length) {
    const { data: msgs } = await db
      .from('messages')
      .select('order_id, content, created_at, sender_id')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
      .limit(1500) as { data: Array<{ order_id: string; content: string; created_at: string; sender_id: string }> | null }
    for (const m of msgs ?? []) if (!lastByOrder.has(m.order_id)) lastByOrder.set(m.order_id, m)
  }
  for (const o of orders ?? []) {
    const last = lastByOrder.get(o.id)
    if (!last) continue
    const other = o.customer_id === user.id ? o.provider_id : o.customer_id
    nameIds.add(other)
    threads.push({
      key: `o-${o.id}`,
      href: `/dashboard/objednavky/${o.id}`,
      counterpart: other,
      subject: o.service_items?.name || o.services?.title || 'Objednávka',
      kind: 'order',
      lastText: last.content,
      lastAt: last.created_at,
      lastFromMe: last.sender_id === user.id,
      unread: unreadByOrder.get(o.id) ?? 0,
    })
  }

  // 2) Jednání o poptávkách, ze kterých ještě nevznikla objednávka
  const { data: myResp } = await db.from('request_responses').select('id, request_id, provider_id').eq('provider_id', user.id) as { data: Array<{ id: string; request_id: string; provider_id: string }> | null }
  const { data: myReqs } = await db.from('requests').select('id, category, customer_id').eq('customer_id', user.id) as { data: Array<{ id: string; category: string | null; customer_id: string }> | null }
  let custResp: Array<{ id: string; request_id: string; provider_id: string }> = []
  if ((myReqs ?? []).length) {
    const { data } = await db.from('request_responses').select('id, request_id, provider_id').in('request_id', (myReqs ?? []).map((r) => r.id)) as { data: typeof custResp | null }
    custResp = data ?? []
  }
  const responses = [...(myResp ?? []), ...custResp]
  if (responses.length) {
    const reqIds = Array.from(new Set(responses.map((r) => r.request_id)))
    const { data: reqs } = await db.from('requests').select('id, category, customer_id, target_service_id').in('id', reqIds) as { data: Array<{ id: string; category: string | null; customer_id: string; target_service_id: string | null }> | null }
    const reqById = new Map((reqs ?? []).map((r) => [r.id, r]))
    // Soukromý dotaz: předmět = název karty, ke které zákazník píše
    const cardIds = Array.from(new Set((reqs ?? []).map((r) => r.target_service_id).filter(Boolean))) as string[]
    const cardTitle = new Map<string, string>()
    if (cardIds.length) {
      const { data: cards } = await db.from('services').select('id, title').in('id', cardIds) as { data: Array<{ id: string; title: string | null }> | null }
      for (const c of cards ?? []) cardTitle.set(c.id, c.title ?? 'karta')
    }
    const { data: convs } = await db
      .from('conversations')
      .select('id, request_response_id, order_id')
      .in('request_response_id', responses.map((r) => r.id))
      .is('order_id', null) as { data: Array<{ id: string; request_response_id: string; order_id: string | null }> | null }
    const convIds = (convs ?? []).map((c) => c.id)
    const lastByConv = new Map<string, { content: string; created_at: string; sender_id: string }>()
    if (convIds.length) {
      const { data: msgs } = await db
        .from('messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(1500) as { data: Array<{ conversation_id: string; content: string; created_at: string; sender_id: string }> | null }
      for (const m of msgs ?? []) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
    }
    const respById = new Map(responses.map((r) => [r.id, r]))
    for (const c of convs ?? []) {
      const last = lastByConv.get(c.id)
      const r = respById.get(c.request_response_id)
      const req = r ? reqById.get(r.request_id) : undefined
      if (!last || !r || !req) continue
      const other = r.provider_id === user.id ? req.customer_id : r.provider_id
      nameIds.add(other)
      threads.push({
        key: `c-${c.id}`,
        href: `/poptavky/${req.id}/jednani/${c.id}`,
        counterpart: other,
        subject: req.target_service_id ? `Dotaz: ${cardTitle.get(req.target_service_id) ?? 'karta'}` : `Poptávka: ${req.category ?? 'bez oboru'}`,
        kind: 'request',
        lastText: last.content,
        lastAt: last.created_at,
        lastFromMe: last.sender_id === user.id,
        unread: unreadByConv.get(c.id) ?? 0,
      })
    }
  }

  // Jména druhých stran
  if (nameIds.size) {
    const { data: profs } = await db.from('profiles').select('id, full_name, display_name, company_name').in('id', Array.from(nameIds)) as { data: any[] | null }
    const nm = new Map((profs ?? []).map((p) => [p.id, p.display_name || p.company_name || p.full_name || 'Uživatel']))
    for (const t of threads) t.counterpart = nm.get(t.counterpart) ?? 'Uživatel'
  }

  threads.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt))
  const unread = threads.reduce((s, t) => s + t.unread, 0)
  return { threads: threads.slice(0, 40), unread }
}

/** Otevřený chat → jeho zprávy se počítají jako přečtené (oznámení new_message). */
export async function markThreadRead(target: { orderId?: string | null; conversationId?: string | null }): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  let q = admin()
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('user_id', user.id)
    .eq('type', 'new_message')
    .is('read_at', null)
  if (target.orderId) q = q.eq('order_id', target.orderId)
  else if (target.conversationId) q = q.like('url', `%/jednani/${target.conversationId}%`)
  else return
  await q
}
