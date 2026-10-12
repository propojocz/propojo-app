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
import { offerSummary } from '@/lib/booking/texts'
import { markThreadRead } from '@/lib/actions/inbox'
import { haversineKm } from '@/lib/geo'
import { draftOrdersBy } from '@/lib/booking/request-selection'

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
    .select('id, request_id, provider_id, service_id, status, offer_kind, charge_halere, quote_fee_deductible, place, place_address, place_lat, place_lng')
    .eq('id', conv.request_response_id)
    .maybeSingle() as { data: {
      id: string; request_id: string; provider_id: string; service_id: string | null; status: string
      offer_kind: string | null; charge_halere: number | null; quote_fee_deductible: boolean | null
    } | null }
  // Klíčová kontrola: konverzace musí patřit k této poptávce.
  if (!rr || rr.request_id !== requestId) notFound()

  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, category, city, city_lat, city_lng, description, preferred_date, photos, status, budget_from_kc, budget_to_kc, place_pref, address')
    .eq('id', requestId)
    .maybeSingle() as { data: {
      id: string; customer_id: string | null; category: string | null; city: string
      city_lat: number | null; city_lng: number | null
      budget_from_kc: number | null; budget_to_kc: number | null; place_pref: string | null
      address: string | null
      description: string; preferred_date: string | null; photos: string[] | null; status: string
    } | null }
  if (!req) notFound()

  const providerId = rr.provider_id
  const customerId = req.customer_id
  const isProvider = user.id === providerId
  const isCustomer = !!customerId && user.id === customerId
  if (!isProvider && !isCustomer) notFound()
  // Otevřené jednání → jeho zprávy jsou přečtené (ikona zpráv v horní liště)
  await markThreadRead({ conversationId })

  // Uzavřené / nevybrané konverzace jsou jen ke čtení.
  // Zamčeno jen když je konverzace zavřená (couvnutí) nebo už vznikla objednávka
  // (pokračuje se v ní). Nevybraní zůstávají přístupní.
  // Po zaplacení se chat nepřesouvá: píše se dál tady i v objednávce, je to jedno vlákno (12. 10. 2026)
  const readOnly = conv.status !== 'open'

  // Rozpracovaná rezervace (vybraný termín, nezaplaceno) – její zprávy patří do stejného vlákna
  const draftAny = !conv.order_id
    ? ((await draftOrdersBy(admin as any, 'response_id', [rr.id])).get(rr.id) ?? null)
    : null
  const linkedOrderId = conv.order_id ?? draftAny

  // Zprávy jednání.
  const { data: msgs } = await admin
    .from('messages')
    .select('*')
    // I zprávy psané v detailu objednávky (mají jen order_id) – jedno vlákno
    .or(linkedOrderId ? `conversation_id.eq.${conversationId},order_id.eq.${linkedOrderId}` : `conversation_id.eq.${conversationId}`)
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

  // Vybrat jde poskytovatele s nabídkou (typ + částka); karta je nepovinná
  const hasOffer = (rr.offer_kind === 'A' || rr.offer_kind === 'B') && !!rr.charge_halere
  const canSelect =
    isCustomer && conv.status === 'open' && !conv.order_id && req.status === 'open' &&
    rr.status !== 'rejected' && hasOffer

  // Zákazník už vybral termín, ale nezaplatil → odkaz na rozpracovanou rezervaci
  const draftOrderId = isCustomer ? draftAny : null

  // Místo konání: z nabídky; bez údaje z karty; jinak u zákazníka
  let placeInfo: { atProvider: boolean; address: string | null; lat: number | null; lng: number | null; pref: string | null } = {
    atProvider: (rr as any).place === 'u_poskytovatele',
    address: (rr as any).place_address ?? null,
    lat: (rr as any).place_lat ?? null,
    lng: (rr as any).place_lng ?? null,
    pref: req.place_pref ?? null,
  }
  if (!(rr as any).place && rr.service_id) {
    const { data: c } = await admin.from('services').select('location_type, address, address_lat, address_lng').eq('id', rr.service_id).maybeSingle() as { data: { location_type: string | null; address: string | null; address_lat: number | null; address_lng: number | null } | null }
    if (c?.location_type === 'u_poskytovatele') placeInfo = { ...placeInfo, atProvider: true, address: c.address, lat: c.address_lat, lng: c.address_lng }
  }

  // Vzdálenost obce poptávky od místa, odkud poskytovatel vyjíždí (karta, jinak obec z profilu)
  let distanceKm: number | null = null
  if (req.city_lat != null && req.city_lng != null) {
    let base: { lat: number; lng: number } | null = null
    if (rr.service_id) {
      const { data: card } = await admin.from('services').select('city, city_lat, city_lng').eq('id', rr.service_id).maybeSingle() as { data: { city: string | null; city_lat: number | null; city_lng: number | null } | null }
      if (card?.city_lat != null && card?.city_lng != null) base = { lat: Number(card.city_lat), lng: Number(card.city_lng) }
    }
    if (!base) {
      const { data: prof } = await admin.from('profiles').select('city').eq('id', providerId).maybeSingle() as { data: { city: string | null } | null }
      const name = String(prof?.city ?? '').split(',')[0].replace(/\s+\d+[a-zA-Z/\d]*$/, '').trim()
      if (name) {
        const { data: o } = await admin.from('obce').select('latitude, longitude').ilike('obec', name).limit(1).maybeSingle() as { data: { latitude: number; longitude: number } | null }
        if (o) base = { lat: o.latitude, lng: o.longitude }
      }
    }
    if (base) distanceKm = Math.round(haversineKm(base.lat, base.lng, Number(req.city_lat), Number(req.city_lng)))
  }

  return (
    <PoptavkaChat
      conversationId={conversationId}
      requestId={requestId}
      responseId={rr.id}
      isProvider={isProvider}
      readOnly={readOnly}
      orderId={conv.order_id}
      canSelect={canSelect}
      hasServiceForOrder={hasOffer}
      offerKind={rr.offer_kind === 'A' || rr.offer_kind === 'B' ? rr.offer_kind : null}
      offerText={(rr.offer_kind === 'A' || rr.offer_kind === 'B') && rr.charge_halere
        ? offerSummary(rr.offer_kind, rr.charge_halere / 100, rr.quote_fee_deductible === true)
        : null}
      otherName={otherName}
      distanceKm={distanceKm}
      place={placeInfo}
      // Přesná adresa jen pro zákazníka – poskytovatel ji před zaplacením nedostane ani do stránky
      customerAddress={isCustomer ? (req.address ?? null) : null}
      draftOrderId={draftOrderId}
      request={{
        heading: req.category ?? 'Poptávka',
        category: req.category,
        city: req.city,
        description: req.description,
        preferredDate: req.preferred_date,
        budgetFrom: req.budget_from_kc ?? null,
        budgetTo: req.budget_to_kc ?? null,
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