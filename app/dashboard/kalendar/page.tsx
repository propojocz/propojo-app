// app/dashboard/kalendar/page.tsx
// Kalendář poskytovatele – K1 den (19. 10. 2026, docs/plan-kalendar.md).
// Data skládá lib/actions/calendar.ts, zobrazení a formuláře KalendarClient.
// Volné termíny dopředu se dál spravují v Termínech (/dashboard/terminy), odkaz je v kalendáři.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCalendarDay } from '@/lib/actions/calendar'
import KalendarClient from './KalendarClient'

export const metadata = { title: 'Kalendář | Propojo' }

export default async function KalendarPage({ searchParams }: { searchParams: { den?: string; misto?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/kalendar')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean } | null }
  if (profile?.is_provider !== true) redirect('/dashboard')

  const day = await getCalendarDay(searchParams?.den)
  if (!day) redirect('/dashboard')

  return <KalendarClient day={day} initialPlace={searchParams?.misto ?? 'all'} />
}
