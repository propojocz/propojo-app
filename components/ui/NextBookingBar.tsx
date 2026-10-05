'use client'
// components/ui/NextBookingBar.tsx
// Lišta pro zákazníka: nejbližší POTVRZENÁ rezervace v příštích 7 dnech
// („Dorazte… / Přijede k vám…“) s přidáním do kalendáře. Jde zavřít (pamatuje si to prohlížeč).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, X } from 'lucide-react'
import { getUpcomingBookings, type UpcomingBooking } from '@/lib/actions/booking'
import AddToCalendarButtons from '@/components/ui/AddToCalendarButtons'

const TZ = 'Europe/Prague'
const DAYS_AHEAD = 7

const den = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' }).format(new Date(iso))
const cas = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function storageKey(orderId: string) {
  return `propojo-next-booking-${orderId}`
}

export default function NextBookingBar() {
  const [b, setB] = useState<UpcomingBooking | null>(null)

  useEffect(() => {
    let cancelled = false
    getUpcomingBookings().then((items) => {
      if (cancelled) return
      const limit = Date.now() + DAYS_AHEAD * 24 * 3600_000
      const next = items.find((x) => x.role === 'customer' && x.state === 'confirmed' && new Date(x.startIso).getTime() <= limit)
      if (!next) return
      try {
        if (window.localStorage.getItem(storageKey(next.orderId)) === 'zavreno') return
      } catch { /* úložiště může být zakázané – lištu prostě ukážeme */ }
      setB(next)
    })
    return () => { cancelled = true }
  }, [])

  if (!b) return null

  const zavrit = () => {
    try { window.localStorage.setItem(storageKey(b.orderId), 'zavreno') } catch { /* nevadí */ }
    setB(null)
  }

  const text = b.arrivalWindow && b.endIso
    ? <>V {den(b.startIso)} mezi <strong>{cas(b.startIso)} a {cas(b.endIso)}</strong> k vám přijede <strong>{b.counterpart}</strong> ({b.itemName}){b.place ? <>, {b.place}</> : null}.</>
    : <>V {den(b.startIso)} v <strong>{cas(b.startIso)}</strong> vás čeká <strong>{b.counterpart}</strong> ({b.itemName}){b.place ? <>, {b.place}</> : null}.</>

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-slate-700">{text}</p>
          <p className="mt-0.5 text-xs text-slate-500">Den předem vám pošleme připomínku. Klidně si to zapište do kalendáře.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <AddToCalendarButtons
              orderId={b.orderId}
              title={b.arrivalWindow ? `Přijede poskytovatel: ${b.itemName}` : b.itemName}
              startIso={b.startIso}
              endIso={b.endIso}
              place={b.place}
              arrivalWindow={b.arrivalWindow}
            />
            <Link href={`/dashboard/objednavky/${b.orderId}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Detail
            </Link>
          </div>
        </div>
        <button type="button" onClick={zavrit} className="rounded-lg p-1 text-slate-400 hover:bg-white" aria-label="Zavřít">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
