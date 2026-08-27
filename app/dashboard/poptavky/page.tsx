// app/dashboard/poptavky/page.tsx
// Moje poptávky (pohled zákazníka). Jen seznam vlastních poptávek + odkaz na
// zájemce a případně na vzniklou objednávku. Žádná editace ani statistiky.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import MojePoptavkyList, { type MyRequest } from '@/components/ui/MojePoptavkyList'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Moje poptávky | Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const ACTIVE = new Set(['interested', 'negotiating'])

export default async function MojePoptavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/poptavky')

  const admin = getAdminClient()

  const { data: reqs } = await admin
    .from('requests')
    .select('id, category, city, preferred_date, status, created_at, selected_response_id')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false }) as { data: Array<{
      id: string; category: string | null; city: string; preferred_date: string | null
      status: string; created_at: string; selected_response_id: string | null
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

  const items: MyRequest[] = requests.map((r) => ({
    id: r.id,
    heading: r.category ?? 'Poptávka',
    category: r.category,
    city: r.city,
    preferredDate: r.preferred_date,
    status: r.status,
    createdAt: r.created_at,
    activeCount: responses.filter((x) => x.request_id === r.id && ACTIVE.has(x.status)).length,
    isSelected: !!r.selected_response_id,
    orderId: orderByReq.get(r.id) ?? null,
  }))

  return <MojePoptavkyList items={items} />
}