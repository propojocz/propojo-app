// app/dashboard/poptavky/[id]/page.tsx
// Zájemci o moji poptávku. Server ověří vlastnictví. Výběr běží přes existující
// selectProvider, chat přes existující conversation route — žádná nová logika.
//
// Pozn.: hvězdičkové hodnocení zatím nezobrazujeme (chybí ověřené schéma reviews);
// místo něj je počet dokončených zakázek poskytovatele jako důvěryhodnostní signál.

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import ZajemciList, { type Zajemce } from '@/components/ui/ZajemciList'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Zájemci o poptávku | Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const PRIMARY = ['interested', 'negotiating', 'selected']

export default async function ZajemciPage({ params }: { params: { id: string } }) {
  const { id } = params
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/prihlasit?next=/dashboard/poptavky/${id}`)

  const admin = getAdminClient()

  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, category, city, preferred_date, status, selected_response_id')
    .eq('id', id)
    .maybeSingle() as { data: {
      id: string; customer_id: string | null; category: string | null; city: string
      preferred_date: string | null; status: string; selected_response_id: string | null
    } | null }
  if (!req) notFound()
  if (req.customer_id !== user.id) notFound()

  const { data: rrs } = await admin
    .from('request_responses')
    .select('id, provider_id, service_id, status, last_message_at')
    .eq('request_id', id)
    .order('last_message_at', { ascending: false, nullsFirst: false }) as { data: Array<{
      id: string; provider_id: string; service_id: string | null; status: string; last_message_at: string | null
    }> | null }
  const responses = rrs ?? []

  const provIds = Array.from(new Set(responses.map((r) => r.provider_id)))
  const svcIds = Array.from(new Set(responses.map((r) => r.service_id).filter(Boolean))) as string[]
  const resIds = responses.map((r) => r.id)

  // Profily poskytovatelů.
  const profMap = new Map<string, any>()
  if (provIds.length) {
    const { data: pp } = await admin
      .from('profiles').select('id, full_name, company_name, display_name, avatar_url, city').in('id', provIds) as { data: any[] | null }
    for (const p of pp ?? []) profMap.set(p.id, p)
  }
  // Názvy karet, přes které reagovali.
  const svcMap = new Map<string, string>()
  if (svcIds.length) {
    const { data: ss } = await admin.from('services').select('id, title').in('id', svcIds) as { data: Array<{ id: string; title: string | null }> | null }
    for (const s of ss ?? []) svcMap.set(s.id, s.title ?? 'Nabídka')
  }
  // Konverzace k reakcím (chat + order).
  const convMap = new Map<string, { id: string; orderId: string | null }>()
  if (resIds.length) {
    const { data: cs } = await admin.from('conversations').select('id, request_response_id, order_id').in('request_response_id', resIds) as { data: Array<{ id: string; request_response_id: string | null; order_id: string | null }> | null }
    for (const c of cs ?? []) if (c.request_response_id) convMap.set(c.request_response_id, { id: c.id, orderId: c.order_id })
  }
  // Poslední zpráva na konverzaci.
  const convIds = Array.from(convMap.values()).map((v) => v.id)
  const lastMsg = new Map<string, { content: string; createdAt: string }>()
  if (convIds.length) {
    const { data: ms } = await admin
      .from('messages').select('conversation_id, content, created_at').in('conversation_id', convIds).order('created_at', { ascending: false }) as { data: Array<{ conversation_id: string | null; content: string; created_at: string }> | null }
    for (const m of ms ?? []) if (m.conversation_id && !lastMsg.has(m.conversation_id)) lastMsg.set(m.conversation_id, { content: m.content, createdAt: m.created_at })
  }
  // Poslední odhad ceny na konverzaci (zpráva type 'price_proposed').
  const estimateByConv = new Map<string, string>()
  if (convIds.length) {
    const { data: est } = await admin
      .from('messages')
      .select('conversation_id, payload, content, created_at')
      .in('conversation_id', convIds)
      .eq('type', 'price_proposed')
      .order('created_at', { ascending: false }) as { data: Array<{ conversation_id: string | null; payload: any; content: string; created_at: string }> | null }
    for (const m of est ?? []) {
      if (!m.conversation_id || estimateByConv.has(m.conversation_id)) continue
      const p = m.payload
      if (p && typeof p.from === 'number') {
        estimateByConv.set(
          m.conversation_id,
          p.to != null
            ? `${p.from.toLocaleString('cs-CZ')} – ${p.to.toLocaleString('cs-CZ')} Kč`
            : `${p.from.toLocaleString('cs-CZ')} Kč`,
        )
      }
    }
  }

  // Dokončené zakázky poskytovatele (důvěryhodnostní signál místo ratingu).
  const completedByProv = new Map<string, number>()
  if (provIds.length) {
    const { data: od } = await admin.from('orders').select('provider_id').eq('status', 'dokonceno').in('provider_id', provIds) as { data: Array<{ provider_id: string }> | null }
    for (const o of od ?? []) completedByProv.set(o.provider_id, (completedByProv.get(o.provider_id) ?? 0) + 1)
  }

  // Průměrné hodnocení z reviews (nezapočítáváme nahlášené). POZOR: počítá se se
  // sloupcem `rating` — kdyby se v DB jmenoval jinak, změnit tady.
  const ratingByProv = new Map<string, { avg: number; count: number }>()
  if (provIds.length) {
    const { data: rv } = await admin
      .from('reviews').select('provider_id, rating').in('provider_id', provIds).is('reported_at', null) as { data: Array<{ provider_id: string; rating: number | null }> | null }
    const acc = new Map<string, { sum: number; n: number }>()
    for (const r of rv ?? []) {
      const cur = acc.get(r.provider_id) ?? { sum: 0, n: 0 }
      cur.sum += Number(r.rating) || 0
      cur.n += 1
      acc.set(r.provider_id, cur)
    }
    for (const [pid, { sum, n }] of acc) if (n > 0) ratingByProv.set(pid, { avg: sum / n, count: n })
  }

  const orderId = req.selected_response_id ? (convMap.get(req.selected_response_id)?.orderId ?? null) : null
  const readOnly = req.status !== 'open'

  const toItem = (r: typeof responses[number]): Zajemce => {
    const p = profMap.get(r.provider_id)
    const conv = convMap.get(r.id)
    const last = conv ? lastMsg.get(conv.id) : undefined
    return {
      responseId: r.id,
      conversationId: conv?.id ?? null,
      providerName: p?.display_name || p?.company_name || p?.full_name || 'Poskytovatel',
      providerCity: p?.city ?? null,
      avatarUrl: p?.avatar_url ?? null,
      cardTitle: r.service_id ? (svcMap.get(r.service_id) ?? null) : null,
      lastMessage: last?.content ?? null,
      status: r.status,
      completedCount: completedByProv.get(r.provider_id) ?? 0,
      rating: ratingByProv.get(r.provider_id) ?? null,
      priceEstimate: conv ? (estimateByConv.get(conv.id) ?? null) : null,
      hasService: !!r.service_id,
    }
  }

  const primary = responses.filter((r) => PRIMARY.includes(r.status)).map(toItem)
  const secondary = responses.filter((r) => !PRIMARY.includes(r.status)).map(toItem)

  return (
    <ZajemciList
      requestId={id}
      heading={req.category ?? 'Poptávka'}
      city={req.city}
      readOnly={readOnly}
      orderId={orderId}
      primary={primary}
      secondary={secondary}
    />
  )
}