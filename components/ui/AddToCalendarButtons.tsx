'use client'
// components/ui/AddToCalendarButtons.tsx
// Tlačítka „Přidat do kalendáře“ podle zařízení: iPhone → Apple, Android → Google, počítač → obojí.

import { useEffect, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { detectCalendarPlatform, googleCalendarUrl, icsUrl, type CalendarPlatform } from '@/lib/calendar-links'

const BTN = 'inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'

export default function AddToCalendarButtons(props: {
  orderId: string
  title: string
  startIso: string
  endIso: string | null
  place: string | null
  arrivalWindow: boolean
}) {
  const [platform, setPlatform] = useState<CalendarPlatform>('other')
  useEffect(() => setPlatform(detectCalendarPlatform()), [])

  const google = (
    <a key="g" href={googleCalendarUrl(props)} target="_blank" rel="noopener noreferrer" className={BTN}>
      <CalendarPlus className="h-3.5 w-3.5" /> {platform === 'android' ? 'Přidat do Google kalendáře' : 'Google kalendář'}
    </a>
  )
  const apple = (
    <a key="a" href={icsUrl(props.orderId)} className={BTN}>
      <CalendarPlus className="h-3.5 w-3.5" /> {platform === 'ios' ? 'Přidat do Apple kalendáře' : 'Apple / Outlook'}
    </a>
  )

  if (platform === 'ios') return apple
  if (platform === 'android') return google
  return <>{google}{apple}</>
}
