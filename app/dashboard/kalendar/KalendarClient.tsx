'use client'
// app/dashboard/kalendar/KalendarClient.tsx
// Kalendář K1 – den jako časová osa: rezervace, pauza / přesun, vypsané volné termíny, blokace,
// poznámky a volné mezery s „Vytvořit bleskový termín“ (⚡ s předvyplněným časem a kartami).
// Filtr „Místo“ mění jen to, co se ukazuje, a otevírací dobu pro mezery – obsazenost je vždy celá.
// Poznámka („ruční rezervace“) je jen pro poskytovatele: blokuje čas, bez platby, není to rezervace přes Propojo.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Ban, CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin, Plus, StickyNote, X, Zap, Coffee, ListChecks,
} from 'lucide-react'
import type { CalendarDay, CalBooking, CalGap, CalItem } from '@/lib/actions/calendar'
import { blockTime, unblockTime } from '@/lib/actions/day-schedule'
import { cas, denDlouze } from '@/lib/format'
import { QuickSlotModal } from '@/components/ui/QuickSlotButton'
import type { QuickSlotInitial } from '@/components/ui/QuickSlotForm'
import ShareSlotButton from '@/components/ui/ShareSlotButton'
import UpcomingDrawer from '@/components/ui/UpcomingDrawer'

// Barvy míst – plné názvy tříd kvůli Tailwindu
const PALETTE = [
  { dot: 'bg-sky-400', border: 'border-l-sky-400', chip: 'border-sky-300 bg-sky-50 text-sky-800' },
  { dot: 'bg-violet-400', border: 'border-l-violet-400', chip: 'border-violet-300 bg-violet-50 text-violet-800' },
  { dot: 'bg-teal-400', border: 'border-l-teal-400', chip: 'border-teal-300 bg-teal-50 text-teal-800' },
  { dot: 'bg-rose-400', border: 'border-l-rose-400', chip: 'border-rose-300 bg-rose-50 text-rose-800' },
  { dot: 'bg-lime-500', border: 'border-l-lime-500', chip: 'border-lime-300 bg-lime-50 text-lime-800' },
]
const VYJEZDY = { dot: 'bg-indigo-400', border: 'border-l-indigo-400', chip: 'border-indigo-300 bg-indigo-50 text-indigo-800' }
const NEUTRAL = { dot: 'bg-slate-300', border: 'border-l-slate-300', chip: 'border-slate-300 bg-slate-50 text-slate-700' }

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

function durationText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const noon = (dateStr: string) => `${dateStr}T12:00:00Z`

/** Konec mezery o půlnoci by v poli času byl 00:00 – do formuláře 23:55 */
const timeField = (iso: string) => (cas(iso) === '00:00' ? '23:55' : cas(iso))

type Row =
  | { kind: 'item'; start: string; item: CalItem }
  | { kind: 'buffer'; start: string; end: string; id: string }
  | { kind: 'gap'; start: string; gap: CalGap }

type FormState = { mode: 'note' | 'block'; date: string; from: string; to: string; text: string }

export default function KalendarClient({ day, initialPlace }: { day: CalendarDay; initialPlace: string }) {
  const router = useRouter()
  // Vlastní stav místo useTransition – v Reactu 18 transition nečeká na await, tlačítko by šlo kliknout dvakrát
  const [saving, setSaving] = useState(false)
  const [placePick, setPlace] = useState(initialPlace)
  // Místo, které v jiném dni není, se ukáže jako „Všechna“
  const place = placePick === 'all' || day.places.some((p) => p.key === placePick) ? placePick : 'all'
  const [now, setNow] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [quick, setQuick] = useState<QuickSlotInitial | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Stav „Probíhá“ / „Za 20 min“ podle hodin prohlížeče – až po načtení (bez rozdílu proti serveru)
  useEffect(() => {
    setMounted(true)
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const isToday = day.date === day.today
  const isPast = day.date < day.today

  const styleOf = useMemo(() => {
    const map = new Map<string, typeof NEUTRAL>()
    let i = 0
    for (const p of day.places) {
      if (p.kind === 'vyjezdy') map.set(p.key, VYJEZDY)
      else { map.set(p.key, PALETTE[i % PALETTE.length]); i += 1 }
    }
    return (key: string) => map.get(key) ?? NEUTRAL
  }, [day.places])

  const pickPlace = (key: string) => {
    setPlace(key)
    try {
      const url = new URL(window.location.href)
      if (key === 'all') url.searchParams.delete('misto'); else url.searchParams.set('misto', key)
      window.history.replaceState(null, '', url.toString())
    } catch { /* jen pohodlí – filtr funguje i bez adresy */ }
  }

  const dayHref = (d: string) => {
    const q = new URLSearchParams()
    if (d !== day.today) q.set('den', d)
    if (place !== 'all') q.set('misto', place)
    const s = q.toString()
    return `/dashboard/kalendar${s ? `?${s}` : ''}`
  }

  const visible = day.items.filter((i) => {
    if (place === 'all') return true
    if (i.type === 'booking') return i.placeKey === place
    if (i.type === 'slot') return i.placeKeys.includes(place)
    return true // blokace a poznámky platí pro celý kalendář
  })
  const gaps = day.gaps[place] ?? []
  const bestGap = gaps.reduce<CalGap | null>((best, g) => (!best || g.minutes > best.minutes ? g : best), null)
  const bookings = visible.filter((i): i is CalBooking => i.type === 'booking')
  const freeMinutes = gaps.reduce((s, g) => s + g.minutes, 0)

  const rows: Row[] = []
  for (const it of visible) {
    rows.push({ kind: 'item', start: it.start, item: it })
    if (it.type === 'booking' && it.bufferEnd) rows.push({ kind: 'buffer', start: it.end, end: it.bufferEnd, id: `${it.id}-buf` })
  }
  for (const g of gaps) rows.push({ kind: 'gap', start: g.start, gap: g })
  rows.sort((a, b) => a.start.localeCompare(b.start) || (a.kind === 'gap' ? 1 : 0) - (b.kind === 'gap' ? 1 : 0))

  const openQuick = (g?: CalGap) => {
    setMenuOpen(false)
    if (!g) { setQuick(isPast ? {} : { date: day.date }); return }
    // Dnešní mezera začíná „teď“ – volný termín nesmí začínat v minulosti, začátek posuneme o čtvrthodinu
    const soonest = Math.ceil((Date.now() + 15 * 60_000) / (5 * 60_000)) * 5 * 60_000
    const startMs = Math.max(new Date(g.start).getTime(), soonest)
    const from = startMs < new Date(g.end).getTime() ? cas(new Date(startMs)) : cas(g.start)
    setQuick({ date: day.date, from, to: timeField(g.end), cardIds: g.cardIds })
  }

  const openForm = (mode: FormState['mode'], g?: CalGap) => {
    setMenuOpen(false)
    setError('')
    setForm({
      mode,
      date: day.date,
      from: g ? cas(g.start) : '',
      to: g ? timeField(g.end) : '',
      text: '',
    })
  }

  const submitForm = () => {
    if (!form) return
    if (!form.date || !form.from || !form.to) { setError('Vyplňte den a čas od–do.'); return }
    if (form.mode === 'note' && !form.text.trim()) { setError('Napište, co je v poznámce.'); return }
    setError('')
    setSaving(true)
    blockTime({ date: form.date, from: form.from, to: form.to, reason: form.text || undefined, kind: form.mode })
      .then((res) => {
        if (!res.success) { setError(res.error); return }
        setForm(null)
        router.refresh()
      })
      .catch(() => setError('Nepodařilo se uložit. Zkuste to prosím znovu.'))
      .finally(() => setSaving(false))
  }

  const removeBlock = (id: string, isNote: boolean) => {
    if (!confirm(isNote ? 'Smazat poznámku? Čas se znovu uvolní pro online rezervace.' : 'Zrušit blokaci? Čas se znovu uvolní pro online rezervace.')) return
    setBusyId(id)
    unblockTime(id)
      .then((res) => { if (!res.success) alert(res.error) })
      .catch(() => alert('Nepodařilo se smazat. Zkuste to prosím znovu.'))
      .finally(() => { setBusyId(null); router.refresh() })
  }

  const statusOf = (b: CalBooking): { text: string; cls: string } => {
    if (b.state === 'pending_payment') return { text: 'Čeká na platbu', cls: 'bg-slate-100 text-slate-600' }
    if (b.state === 'awaiting') return { text: 'Čeká na potvrzení', cls: 'bg-amber-100 text-amber-800' }
    if (b.state === 'no_show') return { text: 'Nahlášeno nedostavení', cls: 'bg-red-100 text-red-700' }
    if (b.state === 'legacy') return { text: 'Rezervace', cls: 'bg-slate-100 text-slate-600' }
    const s = new Date(b.start).getTime()
    const e = new Date(b.end).getTime()
    if (now != null && now >= s && now < e) return { text: b.arrivalWindow ? 'Okno příjezdu běží' : 'Probíhá', cls: 'bg-emerald-500 text-white' }
    if (now != null && now >= e) return { text: 'Proběhlo', cls: 'bg-slate-100 text-slate-500' }
    if (now != null && s - now <= 3 * 3600_000) return { text: `Za ${durationText(Math.max(1, Math.round((s - now) / 60_000)))}`, cls: 'bg-sky-100 text-sky-800' }
    return { text: 'Potvrzeno', cls: 'bg-emerald-100 text-emerald-700' }
  }

  // ── Části ────────────────────────────────────────────────

  const bestGapPanel = bestGap && (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
      <p className="flex items-center gap-1.5 text-sm font-black text-slate-900">
        <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Využijte volné místo
      </p>
      <p className="mt-1 text-sm text-slate-700">
        Největší volno {isToday ? 'dnes' : 'v tento den'}: <span className="font-bold tabular-nums">{cas(bestGap.start)}–{cas(bestGap.end)}</span> ({durationText(bestGap.minutes)})
      </p>
      <button type="button" onClick={() => openQuick(bestGap)}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-orange-600">
        <Zap className="h-4 w-4" /> Vytvořit bleskový termín
      </button>
    </div>
  )

  const addMenuItems = (
    <>
      <button type="button" onClick={() => openQuick()} disabled={isPast}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-orange-50 disabled:opacity-40">
        <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Bleskový termín
      </button>
      <button type="button" onClick={() => openForm('note')}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-amber-50">
        <StickyNote className="h-4 w-4 text-amber-500" /> Poznámka (ruční rezervace)
      </button>
      <button type="button" onClick={() => openForm('block')}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-100">
        <Ban className="h-4 w-4 text-slate-500" /> Blokovat čas
      </button>
    </>
  )

  const renderRow = (r: Row) => {
    if (r.kind === 'buffer') {
      return (
        <li key={r.id} className="flex gap-3">
          <div className="w-12 shrink-0 pt-1.5 text-right text-[11px] tabular-nums text-slate-400">{cas(r.start)}</div>
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
            <Coffee className="h-3.5 w-3.5 shrink-0" /> Pauza / přesun {cas(r.start)}–{cas(r.end)}
          </div>
        </li>
      )
    }

    if (r.kind === 'gap') {
      const g = r.gap
      return (
        <li key={`gap-${g.start}`} className="flex gap-3">
          <div className="w-12 shrink-0 pt-2.5 text-right text-xs font-semibold tabular-nums text-slate-400">{cas(g.start)}</div>
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-emerald-300 bg-white px-3.5 py-2.5">
            <p className="min-w-0 flex-1 text-sm text-slate-700">
              <span className="font-bold text-emerald-700">Volno</span>{' '}
              <span className="tabular-nums">{cas(g.start)}–{cas(g.end)}</span>{' '}
              <span className="text-slate-500">({durationText(g.minutes)})</span>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openForm('note', g)}
                className="text-xs font-semibold text-slate-500 underline hover:text-slate-700">
                Poznámka
              </button>
              <button type="button" onClick={() => openQuick(g)}
                className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600">
                <Zap className="h-3.5 w-3.5" /> Vytvořit bleskový termín
              </button>
            </div>
          </div>
        </li>
      )
    }

    const it = r.item
    const timeCol = (
      <div className="w-12 shrink-0 pt-2.5 text-right">
        <p className="text-sm font-black tabular-nums text-slate-900">{cas(it.start)}</p>
        <p className="text-[11px] tabular-nums text-slate-400">{cas(it.end)}</p>
      </div>
    )

    if (it.type === 'booking') {
      const st = statusOf(it)
      const ps = styleOf(it.placeKey)
      return (
        <li key={it.id} className="flex gap-3">
          {timeCol}
          <Link href={`/dashboard/objednavky/${it.id}`}
            className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-emerald-300 ${ps.border}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
              {initials(it.customer)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate font-bold text-slate-900">{it.customer}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span>
              </div>
              <p className="truncate text-sm text-slate-600">
                {it.title}{it.arrivalWindow ? ' · okno příjezdu' : ''}
              </p>
              {it.placeLabel && (
                <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  <span className="line-clamp-1">{it.placeLabel}</span>
                </p>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-semibold text-emerald-700">
              Detail <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </li>
      )
    }

    if (it.type === 'slot') {
      return (
        <li key={it.id} className="flex gap-3">
          {timeCol}
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-800">Vypsaný volný termín</p>
              <p className="truncate text-xs text-slate-600">{it.label}</p>
            </div>
            <ShareSlotButton slotId={it.id} variant="icon" />
          </div>
        </li>
      )
    }

    const isNote = it.kind === 'note'
    return (
      <li key={it.id} className="flex gap-3">
        {timeCol}
        <div className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl border px-3.5 py-2.5 ${
          isNote ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-100'
        }`}>
          {isNote
            ? <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            : <Ban className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold ${isNote ? 'text-amber-900' : 'text-slate-600'}`}>
              {isNote ? 'Poznámka' : 'Blokováno'}
              {isNote && <span className="ml-1.5 text-[11px] font-semibold text-amber-700">· mimo Propojo</span>}
            </p>
            {it.text && <p className={`break-words text-sm ${isNote ? 'text-slate-800' : 'text-slate-500'}`}>{it.text}</p>}
          </div>
          <button type="button" onClick={() => removeBlock(it.id, isNote)} disabled={busyId === it.id}
            aria-label={isNote ? 'Smazat poznámku' : 'Zrušit blokaci'} title={isNote ? 'Smazat poznámku' : 'Zrušit blokaci'}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-slate-600 disabled:opacity-50">
            {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        </div>
      </li>
    )
  }

  const formModal = form && mounted ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/30 px-4 pt-4 sm:pt-16" onClick={() => setForm(null)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 font-black text-slate-900">
            {form.mode === 'note'
              ? <><StickyNote className="h-4 w-4 text-amber-500" /> Poznámka do kalendáře</>
              : <><Ban className="h-4 w-4 text-slate-500" /> Blokovat čas</>}
          </p>
          <button type="button" onClick={() => setForm(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {form.mode === 'note'
            ? 'Třeba zákazník, který vám zavolal. Poznámku vidíte jen vy a čas se zablokuje pro online rezervace. Není to rezervace přes Propojo – žádná platba ani pravidla rezervací se na ni nevztahují.'
            : 'Dovolená, lékař, cokoli. Zákazníci si v tomto čase nic nezarezervují.'}
          {' '}Vypsané volné termíny v tomto čase se smažou.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="col-span-3 text-[11px] font-semibold text-slate-500">
            Den
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" />
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-slate-500">
            Od
            <input type="time" step={300} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}
              className="mt-0.5 block w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" />
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-slate-500">
            Do
            <input type="time" step={300} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}
              className="mt-0.5 block w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" />
          </label>
        </div>
        <label className="mt-2 block text-[11px] font-semibold text-slate-500">
          {form.mode === 'note' ? 'Co a pro koho' : 'Důvod (nepovinné)'}
          <input type="text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}
            maxLength={form.mode === 'note' ? 200 : 60}
            placeholder={form.mode === 'note' ? 'Např. Jana N. – střih, u mě' : 'Např. dovolená'}
            className="mt-0.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" />
        </label>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setForm(null)} disabled={saving}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            Zpět
          </button>
          <button type="button" onClick={submitForm} disabled={saving}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white transition disabled:opacity-60 ${
              form.mode === 'note' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-800 hover:bg-slate-900'
            }`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : form.mode === 'note' ? <StickyNote className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {form.mode === 'note' ? 'Uložit poznámku' : 'Zablokovat'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div className="space-y-4">
      {/* Hlavička: den, přepínání, týden, filtr místa */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900">Kalendář</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="inline-block first-letter:uppercase">{denDlouze(noon(day.date))}</span>
              {isToday && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Dnes</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href={dayHref(shiftDate(day.date, -1))} aria-label="Předchozí den"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link href={dayHref(day.today)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
              Dnes
            </Link>
            <Link href={dayHref(shiftDate(day.date, 1))} aria-label="Další den"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300">
              <ChevronRight className="h-4 w-4" />
            </Link>
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Přidat do kalendáře" aria-expanded={menuOpen}
                className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600">
                <Plus className="h-5 w-5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    {addMenuItems}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dny v týdnu */}
        <div className="mt-4 grid grid-cols-7 gap-1">
          {day.week.map((w, i) => {
            const on = w.date === day.date
            const isT = w.date === day.today
            return (
              <Link key={w.date} href={dayHref(w.date)}
                className={`flex flex-col items-center rounded-xl py-1.5 transition ${
                  on ? 'bg-emerald-500 text-white' : isT ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                <span className={`text-[11px] font-semibold ${on ? 'text-emerald-50' : 'text-slate-400'}`}>{WEEKDAYS[i]}</span>
                <span className="text-base font-black tabular-nums">{Number(w.date.slice(8, 10))}</span>
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${w.count > 0 ? (on ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent'}`} />
              </Link>
            )
          })}
        </div>

        {/* Filtr místa */}
        {day.places.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold text-slate-500">Místo</span>
            <button type="button" onClick={() => pickPlace('all')}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                place === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              Všechna
            </button>
            {day.places.map((p) => {
              const ps = styleOf(p.key)
              return (
                <button key={p.key} type="button" onClick={() => pickPlace(p.key)}
                  className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    place === p.key ? ps.chip : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ps.dot}`} />
                  <span className="truncate">{p.kind === 'vyjezdy' ? 'Výjezdy' : p.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          {bookings.length === 0 ? 'Žádná rezervace' : bookings.length === 1 ? '1 rezervace' : bookings.length < 5 ? `${bookings.length} rezervace` : `${bookings.length} rezervací`}
          {!isPast && freeMinutes > 0 && <> · volno celkem {durationText(freeMinutes)}</>}
          {!day.hasHours && <> · bez otevírací doby ukazujeme volno jen mezi rezervacemi</>}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Časová osa dne */}
        <div className="space-y-4 lg:col-span-2">
          <div className="lg:hidden">{bestGapPanel}</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 font-bold text-slate-700">Na tento den nic nemáte</p>
                <p className="mt-1 text-sm text-slate-500">
                  {isPast ? 'Tento den už proběhl.' : 'Vypište bleskový termín nebo si poznamenejte, kdo přijde.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">{rows.map(renderRow)}</ul>
            )}
          </div>
        </div>

        {/* Boční panel */}
        <div className="space-y-4">
          <div className="hidden lg:block">{bestGapPanel}</div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-3 pb-1 pt-1 text-sm font-black text-slate-900">Přidat do kalendáře</p>
            {addMenuItems}
          </div>

          {day.places.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-slate-900">Vaše místa</p>
              <ul className="mt-2 space-y-1.5">
                {day.places.map((p) => (
                  <li key={p.key} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${styleOf(p.key).dot}`} />
                    <span className="min-w-0 break-words">{p.kind === 'vyjezdy' ? 'Výjezdy k zákazníkům' : p.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 px-1">
            <Link href="/dashboard/terminy" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              <ListChecks className="h-4 w-4" /> Volné termíny dopředu → Termíny
            </Link>
            <div><UpcomingDrawer variant="text" /></div>
          </div>
        </div>
      </div>

      {formModal}
      <QuickSlotModal open={quick !== null} onClose={() => setQuick(null)} initial={quick ?? undefined} />
    </div>
  )
}
