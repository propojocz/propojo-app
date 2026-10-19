'use client'
// app/dashboard/kalendar/MonthView.tsx
// Kalendář K4 – měsíc jako v Apple Kalendáři.
// Počítač (Mac): mřížka 7 × 5–6 týdnů, v každém dni až 3 záznamy („09:00 Jana N.“), „+2 další“ a volno.
// Mobil (iPhone): mřížka s čísly a tečkami u dnů s rezervací / poznámkou, pod ní seznam vybraného dne.
// Dny mimo měsíc zašedlé, dnešek v zeleném kroužku. Klik na den (počítač) / „Otevřít den“ (mobil) → Den.

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { CalBooking, CalDayData, CalItem } from '@/lib/actions/calendar'
import { cas, denDlouze } from '@/lib/format'
import { WEEKDAYS, bookingsText, durationText, filterItems, gapsOf, noon, type PlaceSel, type PlaceStyle } from './shared'

function itemText(it: CalItem): string {
  if (it.type === 'booking') return it.customer
  if (it.type === 'slot') return '⚡ volný termín'
  return it.text || (it.kind === 'note' ? 'Vlastní termín' : 'Blokováno')
}

export default function MonthView({ days, month, selectedInit, today, sel: places, styleOf, dayHref }: {
  days: CalDayData[]
  /** 'YYYY-MM' zobrazeného měsíce */
  month: string
  selectedInit: string
  today: string
  /** Vybraná místa (prázdné = všechna) */
  sel: PlaceSel
  styleOf: (key: string) => PlaceStyle
  dayHref: (date: string) => string
}) {
  const [selected, setSelected] = useState(selectedInit.startsWith(month) ? selectedInit : `${month}-01`)
  const sel = days.find((d) => d.date === selected) ?? days[0]
  const selItems = filterItems(sel.items, places)
  const selFree = gapsOf(sel, places).reduce((s, g) => s + g.minutes, 0)

  const dot = (it: CalItem) =>
    it.type === 'booking' ? styleOf(it.placeKey).dot
      : it.type === 'slot' ? 'bg-orange-400'
      : it.kind === 'note' ? 'bg-amber-400' : 'bg-slate-300'

  return (
    <>
      {/* ── Počítač ── */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
          {WEEKDAYS.map((w, i) => (
            <p key={w} className={`py-2 text-center text-[11px] font-semibold ${i >= 5 ? 'text-slate-400' : 'text-slate-500'}`}>{w}</p>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.date.startsWith(month)
            const isT = d.date === today
            const items = filterItems(d.items, places)
            const free = gapsOf(d, places).reduce((s, g) => s + g.minutes, 0)
            const shown = items.slice(0, 3)
            return (
              <Link key={d.date} href={dayHref(d.date)}
                className={`group flex min-h-[7.5rem] min-w-0 flex-col border-b border-r border-slate-100 p-1.5 transition hover:bg-emerald-50/40 ${
                  i % 7 === 6 ? 'border-r-0' : ''
                } ${!inMonth ? 'bg-slate-50/70' : i % 7 >= 5 ? 'bg-slate-50/40' : 'bg-white'}`}>
                <div className="mb-1 flex justify-end">
                  <span className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-black tabular-nums ${
                    isT ? 'bg-emerald-500 text-white' : inMonth ? 'text-slate-800' : 'text-slate-300'
                  }`}>{Number(d.date.slice(8, 10))}</span>
                </div>
                <div className={`min-w-0 flex-1 space-y-0.5 ${inMonth ? '' : 'opacity-50'}`}>
                  {shown.map((it) => (
                    <p key={it.id} className="flex min-w-0 items-center gap-1 text-[11px] leading-tight text-slate-700">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot(it)}`} />
                      <span className="shrink-0 font-semibold tabular-nums text-slate-500">{cas(it.start)}</span>
                      <span className="truncate">{itemText(it)}</span>
                    </p>
                  ))}
                  {items.length > shown.length && <p className="text-[11px] font-semibold text-slate-400">+{items.length - shown.length} další</p>}
                </div>
                {inMonth && free > 0 && <p className="mt-1 truncate text-[10px] font-semibold text-emerald-600">volno {durationText(free)}</p>}
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Mobil ── */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <p key={w} className={`py-1 text-center text-[11px] font-semibold ${i >= 5 ? 'text-slate-400' : 'text-slate-500'}`}>{w}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((d) => {
              const inMonth = d.date.startsWith(month)
              const isT = d.date === today
              const isSel = d.date === selected
              const items = filterItems(d.items, places)
              const dots = Array.from(new Set(items.map(dot))).slice(0, 3)
              return (
                <button key={d.date} type="button" onClick={() => setSelected(d.date)}
                  className="flex flex-col items-center py-1">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums transition ${
                    isSel ? (isT ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white')
                      : isT ? 'text-emerald-600' : inMonth ? 'text-slate-900' : 'text-slate-300'
                  }`}>{Number(d.date.slice(8, 10))}</span>
                  <span className="mt-0.5 flex h-1.5 gap-0.5">
                    {dots.map((c) => <span key={c} className={`h-1.5 w-1.5 rounded-full ${c}`} />)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-slate-900 first-letter:uppercase">{denDlouze(noon(sel.date))}</p>
              <p className="text-xs text-slate-500">
                {bookingsText(selItems.filter((i): i is CalBooking => i.type === 'booking').length)}
                {selFree > 0 && <> · volno {durationText(selFree)}</>}
              </p>
            </div>
            <Link href={dayHref(sel.date)} className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-emerald-700">
              Otevřít den <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {selItems.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {selItems.map((it) => (
                <li key={it.id} className="flex items-center gap-2.5 py-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot(it)}`} />
                  <span className="w-11 shrink-0 font-bold tabular-nums text-slate-900">{cas(it.start)}</span>
                  {it.type === 'booking' ? (
                    <Link href={`/dashboard/objednavky/${it.id}`} className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700">
                      {it.customer} · {it.title}
                    </Link>
                  ) : (
                    <span className={`min-w-0 flex-1 truncate ${it.type === 'block' && it.kind === 'note' ? 'text-amber-800' : 'text-slate-500'}`}>
                      {itemText(it)} do {cas(it.end)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Žádné záznamy.</p>
          )}
        </div>
      </div>
    </>
  )
}
