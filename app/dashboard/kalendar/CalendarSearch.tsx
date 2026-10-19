'use client'
// app/dashboard/kalendar/CalendarSearch.tsx
// Hledání v kalendáři (19. 10. 2026): podle jména zákazníka, služby nebo textu vlastního termínu, bez ohledu
// na diakritiku, za poslední rok a dopředu (lib/actions/calendar.ts searchCalendar). Výsledky pod políčkem –
// nejdřív nadcházející, pak proběhlé; klik otevře den v kalendáři. Dokud je v políčku text, mřížka zvýrazní
// shodné záznamy a ostatní ztlumí (KalendarClient → TimeGrid).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search, StickyNote, X } from 'lucide-react'
import { searchCalendar, type CalSearchHit } from '@/lib/actions/calendar'
import { cas, denKratce } from '@/lib/format'
import type { PlaceStyle } from './shared'

const pragueDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

export default function CalendarSearch({ query, onQuery, dayHref, styleOf, onPick }: {
  query: string
  onQuery: (q: string) => void
  /** Odkaz na den v kalendáři */
  dayHref: (date: string) => string
  styleOf: (key: string) => PlaceStyle
  /** Klik na výsledek (kalendář zruší výběr míst, ať nalezený záznam neschová filtr) */
  onPick?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<CalSearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ready = query.trim().length >= 2

  // Hledá se 300 ms po posledním úhozu
  useEffect(() => {
    if (!ready) { setHits(null); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      searchCalendar(query)
        .then((r) => { if (!cancelled) setHits(r) })
        .catch(() => { if (!cancelled) setHits([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, ready])

  const now = Date.now()

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => { onQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        // Esc: nejdřív zavře výsledky, podruhé hledání zruší
        onKeyDown={(e) => { if (e.key === 'Escape') { if (open && ready) setOpen(false); else onQuery('') } }}
        placeholder="Hledat člověka, službu nebo termín…"
        aria-label="Hledat v kalendáři"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button type="button" onClick={() => { onQuery(''); setOpen(false) }} aria-label="Vymazat hledání"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      )}

      {open && ready && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl sm:w-[26rem]">
            {loading && hits === null ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Hledám…</p>
            ) : !hits || hits.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nic jsme nenašli.</p>
            ) : (
              <ul>
                {hits.map((h) => {
                  const past = new Date(h.end).getTime() < now
                  return (
                    <li key={`${h.kind}-${h.id}`}>
                      <Link href={dayHref(pragueDate(h.start))} onClick={() => { setOpen(false); onPick?.() }}
                        className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-slate-50">
                        <div className="w-16 shrink-0 text-center">
                          <p className="text-[11px] font-semibold text-slate-500">{denKratce(h.start)}</p>
                          <p className="text-sm font-black tabular-nums text-slate-900">{cas(h.start)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-900">
                            {h.kind === 'note'
                              ? <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              : <span className={`h-2 w-2 shrink-0 rounded-full ${h.placeKey ? styleOf(h.placeKey).dot : 'bg-slate-300'}`} />}
                            <span className="truncate">{h.name}</span>
                          </p>
                          <p className="truncate text-xs text-slate-500">{h.kind === 'note' ? 'Vlastní termín · mimo Propojo' : h.detail}</p>
                        </div>
                        {past && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">proběhlo</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="border-t border-slate-100 px-2.5 pb-1 pt-2 text-[11px] text-slate-400">Hledá se za poslední rok a dopředu.</p>
          </div>
        </>
      )}
    </div>
  )
}
