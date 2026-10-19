'use client'
// app/dashboard/kalendar/WeekView.tsx
// Kalendář K2 – týden. Počítač: 7 sloupců Po–Ne s rezervacemi, poznámkami, blokacemi a vypsanými
// termíny, dole volno celkem. Mobil: seznam po dnech. Klik na den otevře Den, na rezervaci detail.

import Link from 'next/link'
import { Ban, ChevronRight, StickyNote } from 'lucide-react'
import type { CalBooking, CalDayData, CalItem } from '@/lib/actions/calendar'
import { cas } from '@/lib/format'
import { WEEKDAYS, bookingsText, durationText, filterItems, type PlaceStyle } from './shared'

const STATE_CHIP: Record<CalBooking['state'], string> = {
  pending_payment: 'bg-slate-50',
  awaiting: 'bg-amber-50',
  confirmed: 'bg-white',
  no_show: 'bg-red-50',
  legacy: 'bg-white',
}

export default function WeekView({ days, today, place, styleOf, dayHref }: {
  days: CalDayData[]
  today: string
  place: string
  styleOf: (key: string) => PlaceStyle
  dayHref: (date: string) => string
}) {
  const chip = (it: CalItem) => {
    if (it.type === 'booking') {
      return (
        <Link key={it.id} href={`/dashboard/objednavky/${it.id}`} title={`${cas(it.start)}–${cas(it.end)} ${it.customer} · ${it.title}`}
          className={`block rounded-md border border-l-4 border-slate-200 px-1.5 py-1 text-[11px] leading-tight transition hover:border-emerald-300 ${STATE_CHIP[it.state]} ${styleOf(it.placeKey).border}`}>
          <span className="font-black tabular-nums text-slate-900">{cas(it.start)}</span>
          <span className="block truncate text-slate-700">{it.customer}</span>
          {it.state === 'awaiting' && <span className="block truncate font-semibold text-amber-700">čeká na potvrzení</span>}
        </Link>
      )
    }
    if (it.type === 'slot') {
      return (
        <div key={it.id} title={it.label} className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-[11px] leading-tight">
          <span className="font-black tabular-nums text-emerald-800">{cas(it.start)}–{cas(it.end)}</span>
          <span className="block truncate text-emerald-700">vypsáno volno</span>
        </div>
      )
    }
    const isNote = it.kind === 'note'
    return (
      <div key={it.id} title={it.text ?? undefined}
        className={`rounded-md border px-1.5 py-1 text-[11px] leading-tight ${isNote ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-100'}`}>
        <span className={`font-black tabular-nums ${isNote ? 'text-amber-900' : 'text-slate-500'}`}>{cas(it.start)}–{cas(it.end)}</span>
        <span className={`flex items-center gap-1 truncate ${isNote ? 'text-amber-800' : 'text-slate-500'}`}>
          {isNote ? <StickyNote className="h-3 w-3 shrink-0" /> : <Ban className="h-3 w-3 shrink-0" />}
          <span className="truncate">{it.text || (isNote ? 'Poznámka' : 'Blokováno')}</span>
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Počítač: sloupce */}
      <div className="hidden grid-cols-7 gap-1.5 md:grid">
        {days.map((d, i) => {
          const items = filterItems(d.items, place)
          const free = (d.gaps[place] ?? []).reduce((s, g) => s + g.minutes, 0)
          const isT = d.date === today
          const past = d.date < today
          return (
            <div key={d.date} className={`flex min-h-[14rem] min-w-0 flex-col rounded-2xl border bg-white p-1.5 shadow-sm ${
              isT ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
            } ${past ? 'opacity-70' : ''}`}>
              <Link href={dayHref(d.date)} className="mb-1.5 block rounded-lg py-1 text-center transition hover:bg-slate-50">
                <span className={`block text-[11px] font-semibold ${isT ? 'text-emerald-700' : 'text-slate-400'}`}>{WEEKDAYS[i]}</span>
                <span className={`block text-lg font-black tabular-nums ${isT ? 'text-emerald-700' : 'text-slate-900'}`}>{Number(d.date.slice(8, 10))}</span>
              </Link>
              <div className="flex-1 space-y-1">{items.map(chip)}</div>
              {free > 0 && (
                <Link href={dayHref(d.date)} className="mt-1.5 block rounded-md border border-dashed border-emerald-300 px-1.5 py-1 text-center text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50">
                  volno {durationText(free)}
                </Link>
              )}
            </div>
          )
        })}
      </div>

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
