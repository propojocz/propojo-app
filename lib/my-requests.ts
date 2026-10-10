// lib/my-requests.ts
// Vlastní poptávky zákazníka pro seznam (Moje poptávky v dashboardu i stránka Poptávky
// pro zákazníka, 9. 10. 2026). Čte se přes service role – volat jen s ověřeným userId.

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { draftOrdersBy } from '@/lib/booking/request-selection'
import type { MyRequest } from '@/components/ui/MojePoptavkyList'

const ACTIVE = new Set(['interested', 'negotiating'])

export async function loadMyRequests(userId: string): Promise<MyRequest[]> {
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: reqs } = await admin
    .from('requests')
    .select('id, category, city, preferred_date, status, created_at, selected_response_id, expires_at')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false }) as { data: Array<{
      id: string; category: string | null; city: string; preferred_date: string | null
      status: string; created_at: string; selected_response_id: string | null; expires_at: string | null
    }> | null }
  const requests = reqs ?? []
  const reqIds = requests.map((r) => r.id)

  // Počet aktivních zájemců.
  let responses: Array<{ request_id: string; status: string }> = []
  if (reqIds.length) {
    const { data } = await admin
      .from('request_responses').select('request_id, status').in('request_id', reqIds) as { data: typeof responses | null }
    responses = data ?? []
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
  // Vybraný termín, ale nezaplaceno → odkaz „Dokončit rezervaci“
  const drafts = await draftOrdersBy(admin, 'request_id', requests.filter((r) => r.status === 'open').map((r) => r.id))

  return requests.map((r) => ({
    id: r.id,
    heading: r.category ?? 'Poptávka',
    category: r.category,
    city: r.city,
    preferredDate: r.preferred_date,
    // Otevřená, ale prošlá poptávka se tváří jako vypršelá
    status: r.status === 'open' && r.expires_at && new Date(r.expires_at).getTime() < now ? 'expired' : r.status,
    createdAt: r.created_at,
    canRenew: (r.status === 'open' && !!r.expires_at && new Date(r.expires_at).getTime() < now)
      || r.status === 'closed' || r.status === 'expired'
      || (r.status === 'selected' && (!orderByReq.get(r.id) || orderFailed.has(orderByReq.get(r.id)!))),
    activeCount: responses.filter((x) => x.request_id === r.id && ACTIVE.has(x.status)).length,
    isSelected: !!r.selected_response_id,
    orderId: orderByReq.get(r.id) ?? null,
    draftOrderId: drafts.get(r.id) ?? null,
  }))
}
