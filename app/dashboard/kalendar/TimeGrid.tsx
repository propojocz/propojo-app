'use client'
// app/dashboard/kalendar/TimeGrid.tsx
// Kalendář K4 – mřížka hodin jako v Apple Kalendáři (Den: 1 sloupec, Týden na počítači: 7 sloupců).
// Celých 24 h ve vlastním posuvném okně; po otevření se posune k aktuálnímu času (dnes) nebo k první
// události / volnu. Rezervace jako bloky podle času a délky (barva podle místa, stav jako štítek),
// pod nimi šrafovaná pauza / přesun; poznámky žlutě, blokace šedě, vypsané volno zeleně; volná místa
// v otevírací době jako světle zelené plochy (klik = ⚡). Překrývající se bloky stojí vedle sebe.
// Klik do prázdné hodiny → menu Bleskový termín / Poznámka / Blokovat čas s tím časem.

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Ban, StickyNote, Zap } from 'lucide-react'
import type { CalBooking, CalDayData, CalGap, CalItem } from '@/lib/actions/calendar'
import { cas, minutyOdPulnociPraha } from '@/lib/format'
import { WEEKDAYS, dayMinute, durationText, filterItems, type PlaceStyle } from './shared'

const HOUR = 52 // px na hodinu
const TOTAL = 24 * HOUR
const px = (min: number) => (min / 60) * HOUR

type Ev = { item: CalItem; s: number; vis: number; e: number; col: number; cols: number }

/** Rozložení překrývajících se bloků do sloupců (jako Apple) – e zahrnuje pauzu za rezervací */
function layout(items: CalItem[], date: string): Ev[] {
  const evs: Ev[] = items.map((item) => {
    const s = dayMinute(date, item.start)
    const vis = Math.max(dayMinute(date, item.end), s + 15)
    const e = item.type === 'booking' && item.bufferEnd ? Math.max(vis, dayMinute(date, item.bufferEnd)) : vis
    return { item, s, vis, e, col: 0, cols: 1 }
  }).sort((a, b) => a.s - b.s || b.e - a.e)

  let cluster: Ev[] = []
  let clusterEnd = -1
  let colEnds: number[] = []
  const flush = () => { const n = colEnds.length; for (const ev of cluster) ev.cols = n; cluster = []; colEnds = [] }
  for (const ev of evs) {
    if (ev.s >= clusterEnd && cluster.length > 0) flush()
    let col = colEnds.findIndex((end) => end <= ev.s)
    if (col === -1) { col = colEnds.length; colEnds.push(ev.e) } else colEnds[col] = ev.e
    ev.col = col
    cluster.push(ev)
    clusterEnd = Math.max(clusterEnd, ev.e)
  }
  flush()
  return evs
}

const STATE_NOTE: Partial<Record<CalBooking['state'], { text: string; cls: string }>> = {
  awaiting: { text: 'čeká na potvrzení', cls: 'text-amber-700' },
  pending_payment: { text: 'čeká na platbu', cls: 'text-slate-500' },
  no_show: { text: 'nahlášeno nedostavení', cls: 'text-red-600' },
}

const HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.35) 0 4px, transparent 4px 8px)' }

export default function TimeGrid({ days, today, place, styleOf, now, onGap, onEmpty, onItem, dayHref }: {
  days: CalDayData[]
  today: string
  place: string
  styleOf: (key: string) => PlaceStyle
  now: number | null
  onGap: (date: string, gap: CalGap) => void
  /** Klik do prázdna: den, minuta od půlnoci (po čtvrthodinách) a místo kliknutí na obrazovce */
  onEmpty: (date: string, minute: number, x: number, y: number) => void
  /** Poznámka, blokace, vypsané volno (rezervace vedou rovnou na detail) */
  onItem: (item: CalItem) => void
  /** Hlavičky dnů (Týden) – klik otevře Den */
  dayHref?: (date: string) => string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const multi = days.length > 1
  const cols = `3rem repeat(${days.length}, minmax(0, 1fr))`
  const nowMin = now != null ? minutyOdPulnociPraha(new Date(now)) : null
  const showsToday = days.some((d) => d.date === today)

  // Po otevření / změně dne posunout k aktuálnímu času, jinak k první události nebo volnu (výchozí 7:00)
  const daysKey = days.map((d) => d.date).join(',')
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let target = 7 * 60
    if (showsToday) {
      target = minutyOdPulnociPraha(new Date()) - 60
    } else {
      const starts = days.flatMap((d) => [
        ...filterItems(d.items, place).map((i) => dayMinute(d.date, i.start)),
        ...(d.gaps[place] ?? []).map((g) => dayMinute(d.date, g.start)),
      ])
      if (starts.length > 0) target = Math.min(...starts) - 30
    }
    el.scrollTop = Math.max(0, px(target))
    // jen při změně zobrazených dnů, ne při každém obnovení dat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey])

  const block = (ev: Ev, date: string) => {
    const it = ev.item
    const top = px(ev.s)
    const height = Math.max(18, px(ev.vis - ev.s))
    const pos = {
      top,
      height,
      left: `calc(${(ev.col / ev.cols) * 100}% + 2px)`,
      width: `calc(${100 / ev.cols}% - 4px)`,
    }
    const tall = height >= 34
    const stop = (e: React.MouseEvent) => e.stopPropagation()

    if (it.type === 'booking') {
      const ps = styleOf(it.placeKey)
      const note = STATE_NOTE[it.state]
      const running = it.state === 'confirmed' && now != null && now >= new Date(it.start).getTime() && now < new Date(it.end).getTime()
      return (
        <div key={`${date}-${it.id}`}>
          <Link href={`/dashboard/objednavky/${it.id}`} onClick={stop} style={pos} title={`${cas(it.start)}–${cas(it.end)} ${it.customer} · ${it.title}`}
            className={`absolute z-[2] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight shadow-sm transition hover:brightness-95 ${ps.border} ${ps.tint} ${ps.ink} ${running ? 'ring-2 ring-emerald-400' : ''}`}>
            {tall ? (
              <>
                <p className="truncate font-bold">{it.customer}</p>
                <p className="truncate opacity-80">{cas(it.start)} · {it.title}</p>
                {height >= 50 && note && <p className={`truncate font-semibold ${note.cls}`}>{note.text}</p>}
                {height >= 50 && running && <p className="truncate font-semibold text-emerald-700">probíhá</p>}
              </>
            ) : (
              <p className="truncate"><span className="font-bold">{cas(it.start)}</span> {it.customer}</p>
            )}
          </Link>
          {ev.e > ev.vis && (
            <div title="Pauza / přesun" className="absolute z-[1] rounded-b-md bg-slate-100"
              style={{ ...HATCH, top: top + height, height: Math.max(4, px(ev.e - ev.vis)), left: pos.left, width: pos.width }} />
          )}
        </div>
      )
    }

    if (it.type === 'slot') {
      return (
        <button key={`${date}-${it.id}`} type="button" onClick={(e) => { stop(e); onItem(it) }} style={pos} title={it.label}
          className="absolute z-[2] overflow-hidden rounded-md border border-l-[3px] border-emerald-300 border-l-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-left text-[11px] leading-tight text-emerald-900 transition hover:bg-emerald-100">
          <p className="truncate font-bold">Vypsané volno</p>
          {tall && <p className="truncate opacity-80">{cas(it.start)}–{cas(it.end)}</p>}
        </button>
      )
    }

    const isNote = it.kind === 'note'
    return (
      <button key={`${date}-${it.id}`} type="button" onClick={(e) => { stop(e); onItem(it) }} title={it.text ?? undefined}
        style={isNote ? pos : { ...pos, ...HATCH }}
        className={`absolute z-[2] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition ${
          isNote ? 'border-l-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-l-slate-400 bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}>
        <p className="flex items-center gap-1 truncate font-bold">
          {isNote ? <StickyNote className="h-3 w-3 shrink-0" /> : <Ban className="h-3 w-3 shrink-0" />}
          <span className="truncate">{it.text || (isNote ? 'Poznámka' : 'Blokováno')}</span>
        </p>
        {tall && <p className="truncate opacity-80">{cas(it.start)}–{cas(it.end)}</p>}
      </button>
    )
  }

  const column = (d: CalDayData) => {
    const evs = layout(filterItems(d.items, place), d.date)
    const gaps = d.gaps[place] ?? []
    const isT = d.date === today
    return (
      <div key={d.date}
        className={`relative cursor-pointer border-l border-slate-100 ${isT && multi ? 'bg-emerald-50/30' : ''}`}
        style={{ height: TOTAL, backgroundImage: 'linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)', backgroundSize: `100% ${HOUR}px` }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const minute = Math.floor(((e.clientY - rect.top) / HOUR) * 4) * 15
          onEmpty(d.date, Math.max(0, Math.min(23 * 60 + 45, minute)), e.clientX, e.clientY)
        }}>
        {gaps.map((g) => {
          const s = dayMinute(d.date, g.start)
          const h = px(dayMinute(d.date, g.end) - s)
          return (
            <button key={`gap-${g.start}`} type="button" onClick={(e) => { e.stopPropagation(); onGap(d.date, g) }}
              title={`Volno ${cas(g.start)}–${cas(g.end)} – vytvořit bleskový termín`}
              className="absolute inset-x-0.5 z-[1] flex items-start justify-center overflow-hidden rounded-md border border-dashed border-emerald-300/80 bg-emerald-50/50 pt-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100/70"
              style={{ top: px(s), height: h }}>
              {h >= 22 && (
                <span className="flex items-center gap-1 truncate px-1">
                  <Zap className="h-3 w-3 shrink-0 fill-orange-400 text-orange-500" />
                  {multi ? durationText(g.minutes) : <>Volno {durationText(g.minutes)} · vytvořit bleskový termín</>}
                </span>
              )}
            </button>
          )
        })}
        {evs.map((ev) => block(ev, d.date))}
        {isT && nowMin != null && (
          <div className="pointer-events-none absolute inset-x-0 z-[3]" style={{ top: px(nowMin) }}>
            <div className="relative h-0.5 bg-red-500">
              <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
      {multi && (
        <div className="sticky top-0 z-10 grid border-b border-slate-200 bg-white/95 backdrop-blur" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((d, i) => {
            const isT = d.date === today
            const inner = (
              <>
                <span className={`text-[11px] font-semibold ${isT ? 'text-emerald-700' : 'text-slate-400'}`}>{WEEKDAYS[i % 7]}</span>
                <span className={`ml-1 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-1 text-sm font-black tabular-nums ${
                  isT ? 'bg-emerald-500 text-white' : 'text-slate-900'
                }`}>{Number(d.date.slice(8, 10))}</span>
              </>
            )
            return dayHref
              ? <Link key={d.date} href={dayHref(d.date)} className="flex items-center justify-center border-l border-slate-100 py-2 transition hover:bg-slate-50">{inner}</Link>
              : <div key={d.date} className="flex items-center justify-center border-l border-slate-100 py-2">{inner}</div>
          })}
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: cols }}>
        {/* Hodiny */}
        <div className="relative" style={{ height: TOTAL }}>
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-slate-400" style={{ top: h * HOUR }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
          {showsToday && nowMin != null && (
            <span className="absolute right-0.5 z-[4] -translate-y-1/2 rounded bg-red-500 px-1 text-[10px] font-bold tabular-nums text-white" style={{ top: px(nowMin) }}>
              {cas(new Date(now as number))}
            </span>
          )}
        </div>
        {days.map(column)}
      </div>
    </div>
  )
}
