// app/dashboard/terminy/page.tsx
// Správa termínů poskytovatele.
//
// Správa VOLNÝCH OKEN (termíny dopředu, last-minute). Denní přehled – kdo přijde a v kolik,
// blokace a poznámky – je od K1 (19. 10. 2026) v Kalendáři (/dashboard/kalendar), tady jen odkaz.
//
// Karty se do výběru oken nabízejí podle CENÍKU: musí mít aspoň jeden zveřejněný
// úkon s pevnou cenou (model A). Legacy services.payment_model se neřeší.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import TerminyClient from './TerminyClient'

export const metadata = { title: 'Moje termíny | Propojo' }

export default async function TerminyPage({ searchParams }: { searchParams: { service?: string; den?: string } }) {
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

  // Moje nadcházející okna + přiřazené karty.
  // order_id: u zabraných oken z něj vede odkaz rovnou na detail objednávky —
  // poskytovatel jinak musel hledat, kdo že to vlastně přijde.
  const { data: slots } = await supabase
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, pending_confirm, order_id, slot_services(service_id, services(title))')
    .eq('provider_id', user.id)
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true }) as { data: any[] | null }

  // Skutečný stav zabraného okna podle objednávky (model v2): rozpracovaná platba,
  // čeká na potvrzení, nebo opravdu rezervováno.
  const orderIds = Array.from(new Set((slots ?? []).map((s) => s.order_id).filter(Boolean))) as string[]
  if (orderIds.length > 0) {
    const { data: rows } = await supabase
      .from('orders')
      .select('id, booking_state, deposit_status')
      .in('id', orderIds) as { data: { id: string; booking_state: string | null; deposit_status: string | null }[] | null }
    const byId = new Map((rows ?? []).map((r) => [r.id, r]))
    for (const s of slots ?? []) {
      const o = s.order_id ? byId.get(s.order_id) : null
      if (!o) continue
      s.order_label =
        o.booking_state === 'pending_payment' || (o.booking_state == null && o.deposit_status === 'pending')
          ? 'Čeká na platbu'
          : o.booking_state === 'awaiting_confirmation' || o.booking_state === 'capture_in_progress'
            ? 'Čeká na potvrzení'
            : 'Rezervováno'
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href={searchParams?.den ? `/dashboard/kalendar?den=${encodeURIComponent(searchParams.den)}` : '/dashboard/kalendar'}
        className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 transition hover:border-emerald-300"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-900">Kalendář</p>
          <p className="text-sm text-slate-600">Kdo dnes přijde a v kolik, volná místa, blokace a poznámky.</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-emerald-600" />
      </Link>
      <TerminyClient services={services} slots={slots ?? []} preselectedServiceId={searchParams?.service} />
    </div>
  )
}