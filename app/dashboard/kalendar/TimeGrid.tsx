'use client'
// app/dashboard/kalendar/TimeGrid.tsx
// Kalendář – mřížka hodin (Den: 1 sloupec, Týden na počítači: 7 sloupců), vzhled podle mockupu Mateje
// (19. 10. 2026) v barvách Propoja. Celých 24 h ve vlastním posuvném okně; po otevření se posune
// k aktuálnímu času (dnes) nebo k první události / volnu.
//   Rezervace   – karta v barvě místa (podklad, levý okraj, kroužek s iniciálami), jméno, „09:00 – 09:45“,
//                 služba a štítek stavu s ikonou; pod ní šrafovaná pauza / přesun.
//   Volný termín (vypsaný) – oranžová čárkovaná karta s ⚡, časem, délkou a „Sdílet“.
//   Vlastní termín (poznámka, mimo Propojo) žlutě, blokace šedě šrafovaně.
//   Volno v otevírací době – světle zelené plochy (klik = ⚡); čas mimo otevírací dobu jemně šrafovaný.
//   Najetí myší do prázdna ukáže „+“, klik nabídne termín / bleskový termín / blokaci s tím časem.
//   Čára „teď“ smaragdová se štítkem času. Překrývající se bloky stojí vedle sebe.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Ban, CheckCircle2, Clock, CreditCard, Hourglass, MousePointerClick, Plus, StickyNote, Timer, UserX, Zap,
} from 'lucide-react'
import type { CalDayData, CalGap, CalItem } from '@/lib/actions/calendar'
import { cas, minutyOdPulnociPraha } from '@/lib/format'
import { normalizeText } from '@/lib/search'
import ShareSlotButton from '@/components/ui/ShareSlotButton'
import { WEEKDAYS, bookingStatus, dayMinute, durationText, filterItems, gapsOf, initials, openOf, type PlaceSel, type PlaceStyle, type StatusKind } from './shared'

const HOUR = 56 // px na hodinu
const TOTAL = 24 * HOUR
const px = (min: number) => (min / 60) * HOUR

type Ev = { item: CalItem; s: number; vis: number; e: number; col: number; cols: number }

/** Rozložení překrývajících se bloků do sloupců – e zahrnuje pauzu za rezervací */
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

const STATUS_ICON: Partial<Record<StatusKind, typeof Clock>> = {
  done: CheckCircle2,
  confirmed: CheckCircle2,
  soon: Clock,
  running: Timer,
  awaiting: Hourglass,
  pending: CreditCard,
  noshow: UserX,
}

const HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.35) 0 4px, transparent 4px 8px)' }
const HATCH_SOFT = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.14) 0 6px, transparent 6px 12px)' }
const HOUR_LINES = { backgroundImage: 'linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)', backgroundSize: `100% ${HOUR}px` }

export default function TimeGrid({ days, today, sel, hasHours, styleOf, now, onGap, onEmpty, onItem, dayHref, search = '' }: {
  days: CalDayData[]
  today: string
  /** Vybraná místa (prázdné = všechna) */
  sel: PlaceSel
  /** Má poskytovatel otevírací dobu? (jinak se čas mimo provoz nešrafuje) */
  hasHours: boolean
  styleOf: (key: string) => PlaceStyle
  now: number | null
  onGap: (date: string, gap: CalGap) => void
  /** Klik do prázdna: den, minuta od půlnoci (po čtvrthodinách) a místo kliknutí na obrazovce */
  onEmpty: (date: string, minute: number, x: number, y: number) => void
  /** Vlastní termín, blokace, vypsaný volný termín (rezervace vedou rovnou na detail) */
  onItem: (item: CalItem) => void
  /** Hlavičky dnů (Týden) – klik otevře Den */
  dayHref?: (date: string) => string
  /** Text z hledání – shodné záznamy se zvýrazní, ostatní ztlumí */
  search?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ date: string; minute: number } | null>(null)
  const multi = days.length > 1
  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`
  const nowMin = now != null ? minutyOdPulnociPraha(new Date(now)) : null
  const showsToday = days.some((d) => d.date === today)
  // Hledání: všechna slova (bez diakritiky) musí být ve jménu a službě / textu záznamu
  const words = normalizeText(search.trim()).split(/\s+/).filter(Boolean)
  const searching = words.join('').length >= 2
  const hl = (it: CalItem) => {
    if (!searching) return ''
    const text = it.type === 'booking' ? `${it.customer} ${it.title}` : it.type === 'slot' ? it.label : it.text ?? ''
    const t = normalizeText(text)
    return words.every((w) => t.includes(w)) ? ' ring-2 ring-emerald-500 ring-offset-1' : ' opacity-30'
  }

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
        ...filterItems(d.items, sel).map((i) => dayMinute(d.date, i.start)),
        ...gapsOf(d, sel).map((g) => dayMinute(d.date, g.start)),
        ...openOf(d, sel).map((r) => r.from),
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
    const height = Math.max(20, px(ev.vis - ev.s))
    const pos = {
      top: top + 1,
      height: height - 2,
      left: `calc(${(ev.col / ev.cols) * 100}% + 4px)`,
      width: `calc(${100 / ev.cols}% - 8px)`,
    }
    const tall = height >= 38
    const stop = (e: React.MouseEvent) => e.stopPropagation()
    // Nad blokem se „+“ pro prázdný čas neukazuje
    const clearHover = (e: React.MouseEvent) => { e.stopPropagation(); setHover(null) }

    if (it.type === 'booking') {
      const ps = styleOf(it.placeKey)
      const st = bookingStatus(it, now)
      const Icon = STATUS_ICON[st.kind]
      // Kroužek s iniciálami jen v Dni (v Týdnu je sloupec úzký)
      const avatar = !multi && ev.cols === 1 && height >= 48
      return (
        <div key={`${date}-${it.id}`}>
          <Link href={`/dashboard/objednavky/${it.id}`} onClick={stop} onMouseMove={clearHover} style={pos}
            title={`${cas(it.start)} – ${cas(it.end)} ${it.customer} · ${it.title} · ${st.text}`}
            className={`absolute z-[2] flex gap-2.5 overflow-hidden rounded-xl border border-l-4 border-slate-200/70 px-2.5 py-1.5 text-[11px] leading-snug shadow-sm transition hover:shadow-md ${ps.tint} ${ps.border} ${st.kind === 'running' && !searching ? 'ring-2 ring-emerald-400' : ''}${hl(it)}`}>
            {avatar && (
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black shadow-sm ${ps.ink}`}>
                {initials(it.customer)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {tall ? (
                <>
                  <p className="truncate text-[12px] font-bold text-slate-900">{it.customer}</p>
                  <p className="truncate tabular-nums text-slate-600">{cas(it.start)} – {cas(it.end)}</p>
                  {height >= 54 && <p className="truncate text-slate-500">{it.title}</p>}
                  {height >= (multi ? 96 : 80) && (
                    <span className={`mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                      {Icon && <Icon className="h-3 w-3 shrink-0" />} {st.text}
                    </span>
                  )}
                </>
              ) : (
                <p className="truncate text-slate-700"><span className="font-bold text-slate-900">{cas(it.start)}</span> {it.customer}</p>
              )}
            </div>
          </Link>
          {ev.e > ev.vis && (
            <div title="Pauza / přesun" className="absolute z-[1] rounded-lg bg-slate-50"
              style={{ ...HATCH, top: top + height, height: Math.max(4, px(ev.e - ev.vis) - 1), left: pos.left, width: pos.width }} />
          )}
        </div>
      )
    }

    if (it.type === 'slot') {
      const minutes = Math.round((new Date(it.end).getTime() - new Date(it.start).getTime()) / 60_000)
      return (
        <div key={`${date}-${it.id}`} role="button" tabIndex={0}
          onClick={(e) => { stop(e); onItem(it) }} onMouseMove={clearHover}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItem(it) } }}
          style={pos} title={`Vypsaný volný termín · ${it.label}`}
          className={`absolute z-[2] flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/90 px-2.5 py-1.5 text-left text-[11px] leading-snug text-orange-900 transition hover:border-orange-400 hover:bg-orange-50${hl(it)}`}>
          <p className="flex items-center gap-1 truncate text-[12px] font-black text-orange-600">
            <Zap className="h-3.5 w-3.5 shrink-0 fill-orange-400 text-orange-500" /> <span className="truncate">Volný termín</span>
          </p>
          {tall && <p className="truncate tabular-nums text-orange-800">{cas(it.start)} – {cas(it.end)}</p>}
          {height >= 58 && (
            <p className="flex items-center gap-1 truncate text-orange-700/80">
              <Clock className="h-3 w-3 shrink-0" /> {durationText(minutes)}
            </p>
          )}
          {height >= (multi ? 130 : 104) && (
            <span className="mt-auto block pt-1" onClick={stop}>
              <ShareSlotButton slotId={it.id} variant="slot" />
            </span>
          )}
        </div>
      )
    }

    const isNote = it.kind === 'note'
    return (
      <button key={`${date}-${it.id}`} type="button" onClick={(e) => { stop(e); onItem(it) }} onMouseMove={clearHover}
        title={it.text ?? undefined}
        style={isNote ? pos : { ...pos, ...HATCH }}
        className={`absolute z-[2] overflow-hidden rounded-xl border px-2.5 py-1.5 text-left text-[11px] leading-snug transition ${
          isNote ? 'border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
        }${hl(it)}`}>
        <p className="flex items-center gap-1 truncate text-[12px] font-bold">
          {isNote ? <StickyNote className="h-3 w-3 shrink-0 text-amber-500" /> : <Ban className="h-3 w-3 shrink-0" />}
          <span className="truncate">{it.text || (isNote ? 'Vlastní termín' : 'Blokováno')}</span>
        </p>
        {tall && <p className="truncate tabular-nums opacity-80">{cas(it.start)} – {cas(it.end)}</p>}
        {isNote && height >= 54 && <p className="truncate text-[10px] font-semibold text-amber-700">vlastní termín · mimo Propojo</p>}
      </button>
    )
  }

  const column = (d: CalDayData) => {
    const evs = layout(filterItems(d.items, sel), d.date)
    const gaps = gapsOf(d, sel)
    const open = openOf(d, sel)
    const isT = d.date === today
    const hov = hover && hover.date === d.date ? hover.minute : null
    return (
      <div key={d.date}
        className="relative cursor-pointer border-l border-slate-100"
        style={{ height: TOTAL }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const minute = Math.max(0, Math.min(23 * 60, Math.floor(((e.clientY - rect.top) / HOUR) * 4) * 15))
          if (!hover || hover.date !== d.date || hover.minute !== minute) setHover({ date: d.date, minute })
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          setHover(null)
          const rect = e.currentTarget.getBoundingClientRect()
          const minute = Math.floor(((e.clientY - rect.top) / HOUR) * 4) * 15
          onEmpty(d.date, Math.max(0, Math.min(23 * 60 + 45, minute)), e.clientX, e.clientY)
        }}>
        {/* Čas mimo otevírací dobu jemně šrafovaný, otevřeno bíle, přes to hodinové čáry */}
        {hasHours && <div className="pointer-events-none absolute inset-0 bg-slate-50/60" style={HATCH_SOFT} />}
        {hasHours && open.map((r) => (
          <div key={`open-${r.from}`} className="pointer-events-none absolute inset-x-0 bg-white" style={{ top: px(r.from), height: px(r.to - r.from) }} />
        ))}
        {isT && multi && <div className="pointer-events-none absolute inset-0 bg-emerald-50/30" />}
        <div className="pointer-events-none absolute inset-0" style={HOUR_LINES} />

        {gaps.map((g) => {
          const s = dayMinute(d.date, g.start)
          const h = px(dayMinute(d.date, g.end) - s)
          return (
            <button key={`gap-${g.start}`} type="button" onClick={(e) => { e.stopPropagation(); onGap(d.date, g) }} onMouseMove={(e) => { e.stopPropagation(); setHover(null) }}
              title={`Volno ${cas(g.start)}–${cas(g.end)} – vypsat bleskový termín`}
              className="group absolute inset-x-1 z-[1] flex items-start justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50/50 pt-1.5 text-[11px] font-semibold text-slate-400 transition hover:border-emerald-400 hover:bg-emerald-50/70 hover:text-emerald-700"
              style={{ top: px(s) + 1, height: h - 2 }}>
              {h >= 24 && (
                <span className="flex items-center gap-1 truncate px-1">
                  <Zap className="h-3 w-3 shrink-0 fill-slate-300 text-slate-400 group-hover:fill-orange-400 group-hover:text-orange-500" />
                  {multi ? `volno ${durationText(g.minutes)}` : <>Volno {durationText(g.minutes)} · vypsat bleskový termín</>}
                </span>
              )}
            </button>
          )
        })}

        {/* Najetí myší do prázdna (jen myš – na dotyku mousemove není) */}
        {hov != null && (
          <div className="pointer-events-none absolute inset-x-1 z-[1] flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white/70 text-emerald-500"
            style={{ top: px(hov) + 1, height: HOUR - 2 }}>
            <Plus className="h-4 w-4" />
          </div>
        )}

        {evs.map((ev) => block(ev, d.date))}

        {isT && nowMin != null && (
          <div className="pointer-events-none absolute inset-x-0 z-[3]" style={{ top: px(nowMin) }}>
            <div className="relative h-0.5 bg-emerald-500">
              <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-emerald-500" />
              <span className="absolute left-2 -top-2.5 rounded-full bg-emerald-500 px-1.5 py-px text-[10px] font-bold tabular-nums text-white shadow-sm">
                teď {cas(new Date(now as number))}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-18px_rgba(15,23,42,0.18)]">
      <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto overscroll-contain">
        {multi && (
          <div className="sticky top-0 z-10 grid border-b border-slate-200 bg-white/95 backdrop-blur" style={{ gridTemplateColumns: cols }}>
            <div className="flex items-center justify-center text-[11px] font-semibold text-slate-400">Čas</div>
            {days.map((d, i) => {
              const isT = d.date === today
              const hasSlot = filterItems(d.items, sel).some((x) => x.type === 'slot')
              const inner = (
                <>
                  <span className={`text-xs font-semibold ${isT ? 'text-white/85' : 'text-slate-500'}`}>{WEEKDAYS[i % 7]}</span>
                  <span className={`text-base font-black tabular-nums ${isT ? 'text-white' : 'text-slate-900'}`}>{Number(d.date.slice(8, 10))}</span>
                  {hasSlot && <Zap className={`h-3.5 w-3.5 ${isT ? 'fill-white text-white' : 'fill-orange-400 text-orange-500'}`} />}
                </>
              )
              const cls = `mx-1 my-2 flex items-center justify-center gap-1.5 rounded-xl py-2 transition ${
                isT ? 'bg-emerald-500 shadow-sm' : 'bg-slate-50 hover:bg-slate-100'
              }`
              return dayHref
                ? <Link key={d.date} href={dayHref(d.date)} className={cls} title="Otevřít den">{inner}</Link>
                : <div key={d.date} className={cls}>{inner}</div>
            })}
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {/* Hodiny */}
          <div className="relative" style={{ height: TOTAL }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-400" style={{ top: h * HOUR }}>
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map(column)}
        </div>
      </div>
      <p className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500">
        <MousePointerClick className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
        <span className="hidden sm:inline">Klikněte do volného času a přidejte termín, vypište bleskový termín nebo zablokujte čas.</span>
        <span className="sm:hidden">Ťukněte do volného času a přidejte termín, bleskový termín nebo blokaci.</span>
      </p>
    </div>
  )
}
