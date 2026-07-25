// app/dashboard/terminy/page.tsx
// Správa volných termínů poskytovatele.
//
// Karty se do výběru nabízejí podle CENÍKU: musí mít aspoň jeden zveřejněný
// úkon s pevnou cenou (model A). Dřív se filtrovalo přes services.payment_model —
// legacy sloupec, který po přestavbě nic neznamená (model i délka patří úkonu).

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TerminyClient from './TerminyClient'

export const metadata = { title: 'Moje termíny | Propojo' }

export default async function TerminyPage({ searchParams }: { searchParams: { service?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/terminy')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean } | null }

  if (profile?.is_provider !== true) redirect('/dashboard')

  // Moje aktivní karty
  const { data: myServices } = await supabase
    .from('services')
    .select('id, title')
    .eq('provider_id', user.id)
    .eq('is_active', true)
    .order('title') as { data: { id: string; title: string }[] | null }

  const serviceIds = (myServices ?? []).map((s) => s.id)

  // Zveřejněné úkony s pevnou cenou — jen ony dávají termínu smysl
  // (nacenění na místě se na konkrétní čas nerezervuje).
  const { data: items } = serviceIds.length > 0
    ? await supabase
        .from('service_items')
        .select('service_id, duration_minutes')
        .in('service_id', serviceIds)
        .eq('is_active', true)
        .eq('payment_model', 'A') as { data: { service_id: string; duration_minutes: number | null }[] | null }
    : { data: [] as { service_id: string; duration_minutes: number | null }[] }

  const statsByService: Record<string, { count: number; shortest: number | null }> = {}
  for (const it of items ?? []) {
    const cur = (statsByService[it.service_id] ??= { count: 0, shortest: null })
    cur.count += 1
    const d = it.duration_minutes ?? null
    if (d != null && d > 0 && (cur.shortest == null || d < cur.shortest)) cur.shortest = d
  }

  // Do výběru jen karty, které opravdu mají co nabídnout
  const services = (myServices ?? [])
    .filter((s) => (statsByService[s.id]?.count ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      title: s.title,
      itemCount: statsByService[s.id].count,
      shortestMinutes: statsByService[s.id].shortest,
    }))

  // Moje nadcházející okna + přiřazené karty
  const { data: slots } = await supabase
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, pending_confirm, slot_services(service_id, services(title))')
    .eq('provider_id', user.id)
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true }) as { data: any[] | null }

  return <TerminyClient services={services} slots={slots ?? []} preselectedServiceId={searchParams?.service} />
}