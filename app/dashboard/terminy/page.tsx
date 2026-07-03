// app/dashboard/terminy/page.tsx
// Správa volných termínů poskytovatele (kalendář Fáze 1).
// Okna nabízí jen služby Modelu A (rezervace) – Model B (výjezd) sloty nemá.

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

  // Moje aktivní služby Modelu A (pro zaškrtávání do oken)
  const { data: services } = await supabase
    .from('services')
    .select('id, title, duration_minutes')
    .eq('provider_id', user.id)
    .eq('is_active', true)
    .eq('payment_model', 'A')
    .order('title') as { data: { id: string; title: string; duration_minutes: number | null }[] | null }

  // Moje nadcházející okna + přiřazené služby
  const { data: slots } = await supabase
    .from('availability_slots')
    .select('id, starts_at, ends_at, status, slot_services(service_id, services(title))')
    .eq('provider_id', user.id)
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true }) as { data: any[] | null }

  return <TerminyClient services={services ?? []} slots={slots ?? []} preselectedServiceId={searchParams?.service} />
}