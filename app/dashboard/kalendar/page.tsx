// app/dashboard/kalendar/page.tsx
// Kalendář poskytovatele jako Apple Kalendář – Den / Týden / Měsíc (K1–K4, 19. 10. 2026, docs/plan-kalendar.md).
// ?den=YYYY-MM-DD, ?pohled=tyden|mesic, ?misto=…
// Data skládá lib/actions/calendar.ts, zobrazení a formuláře KalendarClient.
// Volné termíny dopředu se dál spravují v Termínech (/dashboard/terminy), odkaz je v kalendáři.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCalendarDay } from '@/lib/actions/calendar'
import KalendarClient from './KalendarClient'

export const metadata = { title: 'Kalendář | Propojo' }

export default async function KalendarPage({ searchParams }: { searchParams: { den?: string; misto?: string; pohled?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/kalendar')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean } | null }
  if (profile?.is_provider !== true) redirect('/dashboard')

  const view = searchParams?.pohled === 'tyden' ? 'tyden' : searchParams?.pohled === 'mesic' ? 'mesic' : 'den'
  const data = await getCalendarDay(searchParams?.den, view === 'mesic' ? 'month' : 'week')
  if (!data) redirect('/dashboard')

  return <KalendarClient data={data} view={view} initialPlace={searchParams?.misto ?? 'all'} />
}
