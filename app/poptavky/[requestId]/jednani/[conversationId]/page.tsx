// app/poptavky/[requestId]/jednani/[conversationId]/page.tsx
// Konverzace JEDNÁNÍ o poptávce (před výběrem poskytovatele — objednávka ještě
// neexistuje). Chat běží přes conversation_id. Slouží oběma stranám: poskytovatel
// tu jedná o poptávce, zákazník si tu s ním píše a případně ho vybere.
//
// Bezpečnost: ověřujeme, že conversationId opravdu patří k requestId a že
// přihlášený uživatel je jedna ze dvou stran. Kontakt (telefon/e-mail/adresa) se
// tu nikde nezobrazuje — odkryje se až po výběru v objednávce.

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import PoptavkaChat, { type ThreadItem } from '@/components/ui/PoptavkaChat'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function JednaniPage({
  params,
}: {
  params: { requestId: string; conversationId: string }
}) {
  const { requestId, conversationId } = params
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/prihlasit?next=/poptavky/${requestId}/jednani/${conversationId}`)

  const admin = getAdminClient()

  // Konverzace + její reakce + poptávka.
  const { data: conv } = await admin
    .from('conversations')
    .select('id, status, order_id, request_response_id')
    .eq('id', conversationId)
    .maybeSingle() as { data: { id: string; status: string; order_id: string | null; request_response_id: string | null } | null }
  if (!conv || !conv.request_response_id) notFound()

  const { data: rr } = await admin
    .from('request_responses')
    .select('id, request_id, provider_id, service_id, status')
    .eq('id', conv.request_response_id)
    .maybeSingle() as { data: { id: string; request_id: string; provider_id: string; service_id: string | null; status: string } | null }
  // Klíčová kontrola: konverzace musí patřit k této poptávce.
  if (!rr || rr.request_id !== requestId) notFound()

  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, category, city, description, preferred_date, photos, status')
    .eq('id', requestId)
    .maybeSingle() as { data: {
      id: string; customer_id: string | null; category: string | null; city: string
      description: string; preferred_date: string | null; photos: string[] | null; status: string
    } | null }
  if (!req) notFound()

  const providerId = rr.provider_id
  const customerId = req.customer_id
  const isProvider = user.id === providerId
  const isCustomer = !!customerId && user.id === customerId
  if (!isProvider && !isCustomer) notFound()

  // Uzavřené / nevybrané konverzace jsou jen ke čtení.
  // Zamčeno jen když je konverzace zavřená (couvnutí) nebo už vznikla objednávka
  // (pokračuje se v ní). Nevybraní zůstávají přístupní.
  const readOnly = conv.status !== 'open' || !!conv.order_id

  // Zprávy jednání.
  const { data: msgs } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  const messages = msgs ?? []

  // Jména do bublin.
  const ids = [providerId, customerId].filter(Boolean) as string[]
  const { data: profs } = await admin
    .from('profiles').select('id, full_name').in('id', ids) as { data: Array<{ id: string; full_name: string | null }> | null }
  const senderNames: Record<string, string> = {}
  for (const p of profs ?? []) senderNames[p.id] = p.full_name ?? 'Uživatel'
  const otherName = isProvider
    ? (customerId ? (senderNames[customerId] ?? 'Zákazník') : 'Zákazník')
    : (senderNames[providerId] ?? 'Poskytovatel')

  // Levý rail „Moje jednání".
  let threads: ThreadItem[] = []
  if (isProvider) {
    // Poskytovatel: jeho aktivní jednání napříč poptávkami.
    const { data: myRs } = await admin
      .from('request_responses')
      .select('id, request_id, status, last_message_at')
      .eq('provider_id', user.id)
      .in('status', ['interested', 'negotiating', 'selected'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50) as { data: Array<{ id: string; request_id: string; status: string; last_message_at: string | null }> | null }
    const rows = myRs ?? []
    const rids = Array.from(new Set(rows.map((r) => r.request_id)))
    const reqMap = new Map<string, { category: string | null; city: string }>()
    if (rids.length) {
      const { data: rq } = await admin.from('requests').select('id, category, city').in('id', rids) as { data: Array<{ id: string; category: string | null; city: string }> | null }
      for (const r of rq ?? []) reqMap.set(r.id, { category: r.category, city: r.city })
    }
    const convMap = await conversationsByResponse(admin, rows.map((r) => r.id))
    threads = rows.map((r) => {
      const info = reqMap.get(r.request_id)
      const cid = convMap.get(r.id) ?? ''
      return {
        conversationId: cid,
        requestId: r.request_id,
        primary: info?.category ?? 'Poptávka',
        secondary: info?.city ?? '',
        badge: r.status === 'selected' ? 'vybráno' : null,
        isCurrent: cid === conversationId,
      }
    }).filter((t) => t.conversationId)
  } else {
    // Zákazník: poskytovatelé, kteří na TUTO poptávku reagovali.
    const { data: rrs } = await admin
      .from('request_responses')
      .select('id, provider_id, status, last_message_at')
      .eq('request_id', requestId)
      .order('last_message_at', { ascending: false, nullsFirst: false }) as { data: Array<{ id: string; provider_id: string; status: string; last_message_at: string | null }> | null }
    const rows = rrs ?? []
    const provIds = Array.from(new Set(rows.map((r) => r.provider_id)))
    const provNames = new Map<string, string>()
    if (provIds.length) {
      const { data: pp } = await admin.from('profiles').select('id, full_name').in('id', provIds) as { data: Array<{ id: string; full_name: string | null }> | null }
      for (const p of pp ?? []) provNames.set(p.id, p.full_name ?? 'Poskytovatel')
    }
    const convMap = await conversationsByResponse(admin, rows.map((r) => r.id))
    threads = rows.map((r) => {
      const cid = convMap.get(r.id) ?? ''
      return {
        conversationId: cid,
        requestId,
        primary: provNames.get(r.provider_id) ?? 'Poskytovatel',
        secondary: '',
        badge: r.status === 'selected' ? 'vybraný' : r.status === 'not_selected' ? 'nevybraný' : null,
        isCurrent: cid === conversationId,
      }
    }).filter((t) => t.conversationId)
  }

  const canSelect =
    isCustomer && conv.status === 'open' && !conv.order_id && req.status === 'open' &&
    rr.status !== 'rejected' && !!rr.service_id

  return (
    <PoptavkaChat
      conversationId={conversationId}
      requestId={requestId}
      responseId={rr.id}
      isProvider={isProvider}
      readOnly={readOnly}
      orderId={conv.order_id}
      canSelect={canSelect}
      hasServiceForOrder={!!rr.service_id}
      otherName={otherName}
      request={{
        heading: req.category ?? 'Poptávka',
        category: req.category,
        city: req.city,
        description: req.description,
        preferredDate: req.preferred_date,
        photos: req.photos ?? [],
      }}
      threads={threads}
      initialMessages={messages}
      myUserId={user.id}
      senderNames={senderNames}
    />
  )
}

// responseId → conversationId pro seznam vláken.
async function conversationsByResponse(admin: any, responseIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!responseIds.length) return map
  const { data } = await admin
    .from('conversations')
    .select('id, request_response_id')
    .in('request_response_id', responseIds)
  for (const c of (data ?? []) as Array<{ id: string; request_response_id: string | null }>) {
    if (c.request_response_id) map.set(c.request_response_id, c.id)
  }
  return map
}