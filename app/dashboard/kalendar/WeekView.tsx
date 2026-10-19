'use client'
// app/dashboard/kalendar/WeekView.tsx
// Kalendář K2 – týden na mobilu: seznam po dnech (iPhone na výšku týdenní mřížku nemá).
// Na počítači je Týden mřížka hodin (TimeGrid, K4). Klik na den otevře Den.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { CalBooking, CalDayData } from '@/lib/actions/calendar'
import { cas } from '@/lib/format'
import { WEEKDAYS, bookingsText, durationText, filterItems, type PlaceStyle } from './shared'

export default function WeekView({ days, today, place, styleOf, dayHref }: {
  days: CalDayData[]
  today: string
  place: string
  styleOf: (key: string) => PlaceStyle
  dayHref: (date: string) => string
}) {
  return (
    <>
      {/* Mobil: seznam po dnech */}
      <ul className="space-y-2 md:hidden">
        {days.map((d, i) => {
          const items = filterItems(d.items, place)
          const bookings = items.filter((x): x is CalBooking => x.type === 'booking')
          const notes = items.filter((x) => x.type === 'block' && x.kind === 'note').length
          const free = (d.gaps[place] ?? []).reduce((s, g) => s + g.minutes, 0)
          const isT = d.date === today
          const shown = items.slice(0, 4)
          return (
            <li key={d.date}>
              <Link href={dayHref(d.date)}
                className={`flex gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-emerald-300 ${
                  isT ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
                } ${d.date < today ? 'opacity-70' : ''}`}>
                <div className="w-12 shrink-0 text-center">
                  <p className={`text-[11px] font-semibold ${isT ? 'text-emerald-700' : 'text-slate-400'}`}>{isT ? 'Dnes' : WEEKDAYS[i]}</p>
                  <p className={`text-xl font-black tabular-nums ${isT ? 'text-emerald-700' : 'text-slate-900'}`}>{Number(d.date.slice(8, 10))}.</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    {bookingsText(bookings.length)}
                    {notes > 0 && <> · {notes === 1 ? '1 poznámka' : `${notes} poznámky`}</>}
                    {free > 0 && <> · <span className="font-semibold text-emerald-700">volno {durationText(free)}</span></>}
                  </p>
                  {shown.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {shown.map((it) => (
                        <li key={it.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <span className="w-10 shrink-0 font-bold tabular-nums">{cas(it.start)}</span>
                          {it.type === 'booking' ? (
                            <>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${styleOf(it.placeKey).dot}`} />
                              <span className="truncate">{it.customer} · {it.title}</span>
                            </>
                          ) : it.type === 'slot' ? (
                            <span className="truncate text-emerald-700">vypsáno volno do {cas(it.end)}</span>
                          ) : (
                            <span className={`truncate ${it.kind === 'note' ? 'text-amber-800' : 'text-slate-500'}`}>
                              {it.kind === 'note' ? '📝 ' : ''}{it.text || (it.kind === 'note' ? 'Poznámka' : 'Blokováno')}
                            </span>
                          )}
                        </li>
                      ))}
                      {items.length > shown.length && <li className="text-[11px] text-slate-400">a další {items.length - shown.length}</li>}
                    </ul>
                  )}
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
