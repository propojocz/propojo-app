// app/dashboard/kalendar/shared.ts
// Společné pro Den, Týden, ukázku a Přehled (K3): barvy míst, filtr podle místa, texty délek,
// stav rezervace podle hodin a předvyplnění bleskového termínu z mezery.
// Třídy barev jsou vypsané celé, ať je Tailwind najde.

import type { CalBooking, CalDayData, CalGap, CalItem, CalPlace } from '@/lib/actions/calendar'
import type { QuickSlotInitial } from '@/components/ui/QuickSlotForm'
import { cas, isoZPrazskehoCasu, minutyOdPulnociPraha } from '@/lib/format'

/** dot = tečka, border = levý okraj, chip = vybraný štítek, tint = podklad štítku / kroužku, ink = text, soft = jemný podklad bloku */
export type PlaceStyle = { dot: string; border: string; chip: string; tint: string; ink: string; soft: string }

const PALETTE: PlaceStyle[] = [
  { dot: 'bg-sky-400', border: 'border-l-sky-400', chip: 'border-sky-300 bg-sky-50 text-sky-800', tint: 'bg-sky-50', ink: 'text-sky-900', soft: 'bg-sky-50/50' },
  { dot: 'bg-violet-400', border: 'border-l-violet-400', chip: 'border-violet-300 bg-violet-50 text-violet-800', tint: 'bg-violet-50', ink: 'text-violet-900', soft: 'bg-violet-50/50' },
  { dot: 'bg-teal-400', border: 'border-l-teal-400', chip: 'border-teal-300 bg-teal-50 text-teal-800', tint: 'bg-teal-50', ink: 'text-teal-900', soft: 'bg-teal-50/50' },
  { dot: 'bg-rose-400', border: 'border-l-rose-400', chip: 'border-rose-300 bg-rose-50 text-rose-800', tint: 'bg-rose-50', ink: 'text-rose-900', soft: 'bg-rose-50/50' },
  { dot: 'bg-lime-500', border: 'border-l-lime-500', chip: 'border-lime-300 bg-lime-50 text-lime-800', tint: 'bg-lime-50', ink: 'text-lime-900', soft: 'bg-lime-50/50' },
]
export const VYJEZDY_STYLE: PlaceStyle = { dot: 'bg-indigo-400', border: 'border-l-indigo-400', chip: 'border-indigo-300 bg-indigo-50 text-indigo-800', tint: 'bg-indigo-50', ink: 'text-indigo-900', soft: 'bg-indigo-50/50' }
export const NEUTRAL_STYLE: PlaceStyle = { dot: 'bg-slate-300', border: 'border-l-slate-300', chip: 'border-slate-300 bg-slate-50 text-slate-700', tint: 'bg-slate-50', ink: 'text-slate-800', soft: 'bg-slate-50/50' }

export const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

/** Barva každého místa – výjezdy vždy indigo, adresy podle pořadí */
export function makeStyleOf(places: CalPlace[]): (key: string) => PlaceStyle {
  const map = new Map<string, PlaceStyle>()
  let i = 0
  for (const p of places) {
    if (p.kind === 'vyjezdy') map.set(p.key, VYJEZDY_STYLE)
    else { map.set(p.key, PALETTE[i % PALETTE.length]); i += 1 }
  }
  return (key) => map.get(key) ?? NEUTRAL_STYLE
}

/** Vybraná místa ve filtru (jedno i víc, Matej 19. 10.) – prázdný výběr = všechna místa */
export type PlaceSel = string[]

/** Co se ukáže při výběru míst – blokace a vlastní termíny platí pro celý kalendář */
export function filterItems(items: CalItem[], sel: PlaceSel): CalItem[] {
  if (sel.length === 0) return items
  return items.filter((i) => {
    if (i.type === 'booking') return sel.includes(i.placeKey)
    if (i.type === 'slot') return i.placeKeys.some((k) => sel.includes(k))
    return true
  })
}

/**
 * Volno dne pro výběr míst. Server počítá volno pro každé místo zvlášť (otevírací doba místa minus vše
 * obsazené); obsazenost je u všech míst stejná, takže volno více míst = spojení jejich volna.
 */
export function gapsOf(d: CalDayData, sel: PlaceSel): CalGap[] {
  if (sel.length === 0) return d.gaps.all ?? []
  if (sel.length === 1) return d.gaps[sel[0]] ?? []
  const list = sel.flatMap((k) => d.gaps[k] ?? []).sort((a, b) => a.start.localeCompare(b.start))
  const out: CalGap[] = []
  for (const g of list) {
    const last = out[out.length - 1]
    if (last && g.start <= last.end) {
      if (g.end > last.end) last.end = g.end
      last.cardIds = Array.from(new Set([...last.cardIds, ...g.cardIds]))
      last.minutes = Math.round((new Date(last.end).getTime() - new Date(last.start).getTime()) / 60_000)
    } else {
      out.push({ ...g, cardIds: [...g.cardIds] })
    }
  }
  return out
}

/** Otevírací doba dne pro výběr míst (spojení), minuty od půlnoci */
export function openOf(d: CalDayData, sel: PlaceSel): { from: number; to: number }[] {
  const list = (sel.length === 0 ? d.open.all ?? [] : sel.flatMap((k) => d.open[k] ?? []))
    .map((r) => ({ ...r })).sort((a, b) => a.from - b.from)
  const out: { from: number; to: number }[] = []
  for (const r of list) {
    const last = out[out.length - 1]
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to)
    else out.push(r)
  }
  return out
}

export function durationText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → poledne téhož dne, pro formátování data bez posunu zóny */
export const noon = (dateStr: string) => `${dateStr}T12:00:00Z`

/** „2 rezervace“ / „5 rezervací“ */
export function bookingsText(n: number): string {
  if (n === 0) return 'Žádná rezervace'
  if (n === 1) return '1 rezervace'
  return n < 5 ? `${n} rezervace` : `${n} rezervací`
}

export type StatusKind = 'pending' | 'awaiting' | 'noshow' | 'legacy' | 'running' | 'done' | 'soon' | 'confirmed'

/** Stav rezervace pro štítek – „Za 20 min“ / „Probíhá“ podle hodin (now null = před načtením v prohlížeči) */
export function bookingStatus(b: CalBooking, now: number | null): { text: string; cls: string; kind: StatusKind } {
  if (b.state === 'pending_payment') return { text: 'Čeká na platbu', cls: 'bg-slate-100 text-slate-600', kind: 'pending' }
  if (b.state === 'awaiting') return { text: 'Čeká na potvrzení', cls: 'bg-amber-100 text-amber-800', kind: 'awaiting' }
  if (b.state === 'no_show') return { text: 'Nahlášeno nedostavení', cls: 'bg-red-100 text-red-700', kind: 'noshow' }
  if (b.state === 'legacy') return { text: 'Rezervace', cls: 'bg-slate-100 text-slate-600', kind: 'legacy' }
  const s = new Date(b.start).getTime()
  const e = new Date(b.end).getTime()
  if (now != null && now >= s && now < e) return { text: b.arrivalWindow ? 'Okno příjezdu běží' : 'Probíhá', cls: 'bg-emerald-500 text-white', kind: 'running' }
  if (now != null && now >= e) return { text: 'Proběhlo', cls: 'bg-slate-100 text-slate-500', kind: 'done' }
  if (now != null && s - now <= 3 * 3600_000) return { text: `Za ${durationText(Math.max(1, Math.round((s - now) / 60_000)))}`, cls: 'bg-sky-100 text-sky-800', kind: 'soon' }
  return { text: 'Potvrzeno', cls: 'bg-emerald-100 text-emerald-700', kind: 'confirmed' }
}

/** Konec mezery o půlnoci by v poli času byl 00:00 – do formuláře 23:45 (bleskový termín jen po 15 minutách) */
export const timeField = (iso: string) => (cas(iso) === '00:00' ? '23:45' : cas(iso))

/**
 * Předvyplnění bleskového termínu z volné mezery. Dnešní mezera začíná „teď“ a volný termín nesmí
 * začínat v minulosti – začátek posuneme aspoň o čtvrthodinu.
 */
export function quickFromGap(date: string, g: CalGap): QuickSlotInitial {
  const soonest = Math.ceil((Date.now() + 15 * 60_000) / (15 * 60_000)) * 15 * 60_000
  const startMs = Math.max(new Date(g.start).getTime(), soonest)
  const from = startMs < new Date(g.end).getTime() ? cas(new Date(startMs)) : cas(g.start)
  return { date, from, to: timeField(g.end), cardIds: g.cardIds }
}

/** Minuty od pražské půlnoci daného dne (0–1440); co začíná dřív nebo končí později, se ořízne na den */
export function dayMinute(date: string, iso: string): number {
  const ms = new Date(iso).getTime()
  if (ms <= new Date(isoZPrazskehoCasu(date, '00:00')).getTime()) return 0
  if (ms >= new Date(isoZPrazskehoCasu(shiftDate(date, 1), '00:00')).getTime()) return 24 * 60
  return minutyOdPulnociPraha(iso)
}

/** Minuty → 'HH:MM' */
export function hhmm(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 55, min))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Krátký název místa do štítku: „1. máje 2634, Rožnov…“ → „1. máje“, „Dolní Bečva 690, …“ → „Dolní Bečva“ */
export function shortPlace(label: string): string {
  const first = label.split(',')[0].trim()
  const noNumber = first.replace(/\s+\d+[a-zA-Z]?(\/\d+[a-zA-Z]?)?$/, '').trim()
  return noNumber || first
}
