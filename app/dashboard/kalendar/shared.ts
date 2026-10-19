// app/dashboard/kalendar/shared.ts
// Společné pro Den, Týden a ukázku: barvy míst, filtr podle místa, texty délek.
// Třídy barev jsou vypsané celé, ať je Tailwind najde.

import type { CalItem, CalPlace } from '@/lib/actions/calendar'

export type PlaceStyle = { dot: string; border: string; chip: string }

const PALETTE: PlaceStyle[] = [
  { dot: 'bg-sky-400', border: 'border-l-sky-400', chip: 'border-sky-300 bg-sky-50 text-sky-800' },
  { dot: 'bg-violet-400', border: 'border-l-violet-400', chip: 'border-violet-300 bg-violet-50 text-violet-800' },
  { dot: 'bg-teal-400', border: 'border-l-teal-400', chip: 'border-teal-300 bg-teal-50 text-teal-800' },
  { dot: 'bg-rose-400', border: 'border-l-rose-400', chip: 'border-rose-300 bg-rose-50 text-rose-800' },
  { dot: 'bg-lime-500', border: 'border-l-lime-500', chip: 'border-lime-300 bg-lime-50 text-lime-800' },
]
export const VYJEZDY_STYLE: PlaceStyle = { dot: 'bg-indigo-400', border: 'border-l-indigo-400', chip: 'border-indigo-300 bg-indigo-50 text-indigo-800' }
export const NEUTRAL_STYLE: PlaceStyle = { dot: 'bg-slate-300', border: 'border-l-slate-300', chip: 'border-slate-300 bg-slate-50 text-slate-700' }

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

/** Co se ukáže při filtru místa – blokace a poznámky platí pro celý kalendář */
export function filterItems(items: CalItem[], place: string): CalItem[] {
  if (place === 'all') return items
  return items.filter((i) => {
    if (i.type === 'booking') return i.placeKey === place
    if (i.type === 'slot') return i.placeKeys.includes(place)
    return true
  })
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
