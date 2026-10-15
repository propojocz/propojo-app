// lib/my-requests.ts
// Vlastní poptávky zákazníka pro seznam (Moje poptávky v dashboardu i stránka Poptávky
// pro zákazníka, 9. 10. 2026). Čte se přes service role – volat jen s ověřeným userId.

import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { MyRequest } from '@/components/ui/MojePoptavkyList'

const ACTIVE = new Set(['interested', 'negotiating'])

export async function loadMyRequests(userId: string): Promise<MyRequest[]> {
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: reqs } = await admin
    .from('requests')
    .select('id, category, city, preferred_date, status, created_at, selected_response_id, expires_at, target_provider_id')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false }) as { data: Array<{
      id: string; category: string | null; city: string; preferred_date: string | null
      status: string; created_at: string; selected_response_id: string | null; expires_at: string | null
      target_provider_id: string | null
    }> | null }
  const requests = reqs ?? []
  const reqIds = requests.map((r) => r.id)

  // Počet aktivních zájemců.
  let responses: Array<{ id: string; request_id: string; status: string }> = []
  if (reqIds.length) {
    const { data } = await admin
      .from('request_responses').select('id, request_id, status').in('request_id', reqIds) as { data: typeof responses | null }
    responses = data ?? []
  }

  // Soukromé poptávky (dotaz pro jednoho poskytovatele): jméno poskytovatele a přímý odkaz do chatu
  const privateReqs = requests.filter((r) => r.target_provider_id)
  const providerName = new Map<string, string>()
  const chatOf = new Map<string, string>()
  if (privateReqs.length) {
    const pids = Array.from(new Set(privateReqs.map((r) => r.target_provider_id!)))
    const { data: pp } = await admin.from('profiles').select('id, full_name, company_name').in('id', pids) as { data: Array<{ id: string; full_name: string | null; company_name: string | null }> | null }
    for (const p of pp ?? []) providerName.set(p.id, p.company_name || p.full_name || 'Poskytovatel')
    const respIds = responses.filter((x) => privateReqs.some((r) => r.id === x.request_id)).map((x) => x.id)
    if (respIds.length) {
      const { data: cv } = await admin.from('conversations').select('id, request_response_id').in('request_response_id', respIds) as { data: Array<{ id: string; request_response_id: string }> | null }
      for (const c of cv ?? []) {
        const resp = responses.find((x) => x.id === c.request_response_id)
        if (resp) chatOf.set(resp.request_id, `/poptavky/${resp.request_id}/jednani/${c.id}`)
      }
    }
  }

  // Objednávka u vybraných poptávek (přes konverzaci vybrané reakce).
  const selResIds = requests.map((r) => r.selected_response_id).filter(Boolean) as string[]
  const orderByReq = new Map<string, string>()
  if (selResIds.length) {
    const { data: convs } = await admin
      .from('conversations').select('request_response_id, order_id').in('request_response_id', selResIds) as { data: Array<{ request_response_id: string | null; order_id: string | null }> | null }
    const orderByRes = new Map<string, string>()
    for (const c of convs ?? []) if (c.request_response_id && c.order_id) orderByRes.set(c.request_response_id, c.order_id)
    for (const r of requests) if (r.selected_response_id) {
      const o = orderByRes.get(r.selected_response_id)
      if (o) orderByReq.set(r.id, o)
    }
  }

  // Stav objednávek z vybraných poptávek – padlá před zaplacením = poptávku jde obnovit
  const orderFailed = new Set<string>()
  const orderIds = Array.from(orderByReq.values())
  if (orderIds.length) {
    const { data: ords } = await admin
      .from('orders').select('id, status, booking_state').in('id', orderIds) as { data: Array<{ id: string; status: string; booking_state: string | null }> | null }
    for (const o of ords ?? []) if (o.status === 'zruseno' && o.booking_state !== 'confirmed') orderFailed.add(o.id)
  }
  const now = Date.now()

  return requests.map((r) => ({
    id: r.id,
    heading: r.target_provider_id ? `Dotaz – ${providerName.get(r.target_provider_id) ?? 'poskytovatel'}` : (r.category ?? 'Poptávka'),
    privateUrl: r.target_provider_id ? (chatOf.get(r.id) ?? null) : null,
    category: r.category,
    city: r.city,
    preferredDate: r.preferred_date,
    // Otevřená, ale prošlá poptávka se tváří jako vypršelá
    status: r.status === 'open' && r.expires_at && new Date(r.expires_at).getTime() < now ? 'expired' : r.status,
    createdAt: r.created_at,
    // Soukromá poptávka se neobnovuje (obnovou by vznikla veřejná) – zákazník napíše poskytovateli znovu
    canRenew: !r.target_provider_id && ((r.status === 'open' && !!r.expires_at && new Date(r.expires_at).getTime() < now)
      || r.status === 'closed' || r.status === 'expired'
      || (r.status === 'selected' && (!orderByReq.get(r.id) || orderFailed.has(orderByReq.get(r.id)!)))),
    activeCount: responses.filter((x) => x.request_id === r.id && ACTIVE.has(x.status)).length,
    isSelected: !!r.selected_response_id,
    orderId: orderByReq.get(r.id) ?? null,
  }))
}
