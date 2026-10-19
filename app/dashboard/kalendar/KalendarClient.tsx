'use client'
// app/dashboard/kalendar/KalendarClient.tsx
// Kalendář poskytovatele jako Apple Kalendář (K4, 19. 10. 2026): přepínač Den | Týden | Měsíc.
//   Den    – mřížka hodin (TimeGrid) + proužek dnů v týdnu, na počítači boční panel.
//   Týden  – počítač mřížka hodin 7 dní, mobil seznam po dnech (WeekView).
//   Měsíc  – MonthView (počítač mřížka se záznamy, mobil tečky + seznam vybraného dne).
// Klik do prázdné hodiny → Bleskový termín / Poznámka / Blokovat čas s tím časem; klik na volno → ⚡;
// klik na poznámku / blokaci / vypsané volno → detail se smazáním / sdílením; rezervace → detail objednávky.
// Filtr „Místo“ mění jen to, co se ukazuje, a otevírací dobu pro mezery – obsazenost je vždy celá.
// Poznámka („ruční rezervace“) je jen pro poskytovatele: blokuje čas, bez platby, není to rezervace přes Propojo.
// Ukázkový den (SampleDay) jen při prázdném týdnu (Den, Týden).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ban, ChevronLeft, ChevronRight, ListChecks, Loader2, StickyNote, Trash2, X, Zap } from 'lucide-react'
import type { CalendarDay, CalGap, CalItem } from '@/lib/actions/calendar'
import { blockTime, unblockTime } from '@/lib/actions/day-schedule'
import { cas, denDlouze, denKratce, isoZPrazskehoCasu } from '@/lib/format'
import { QuickSlotModal } from '@/components/ui/QuickSlotButton'
import type { QuickSlotInitial } from '@/components/ui/QuickSlotForm'
import ShareSlotButton from '@/components/ui/ShareSlotButton'
import UpcomingDrawer from '@/components/ui/UpcomingDrawer'
import TimeGrid from './TimeGrid'
import WeekView from './WeekView'
import MonthView from './MonthView'
import SampleDay from './SampleDay'
import { WEEKDAYS, bookingsText, durationText, filterItems, hhmm, makeStyleOf, noon, quickFromGap, shiftDate } from './shared'

type View = 'den' | 'tyden' | 'mesic'

const dayMonth = (dateStr: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(noon(dateStr)))
const monthYear = (dateStr: string) =>
  new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(noon(dateStr)))

/** První den sousedního měsíce */
function shiftMonth(dateStr: string, delta: number): string {
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1, 12)).toISOString().slice(0, 10)
}

type FormState = { mode: 'note' | 'block'; date: string; from: string; to: string; text: string }
type EmptyMenu = { date: string; minute: number; x: number; y: number }

export default function KalendarClient({ data, view, initialPlace }: {
  data: CalendarDay
  view: View
  initialPlace: string
}) {
  const router = useRouter()
  // Vlastní stav místo useTransition – v Reactu 18 transition nečeká na await, tlačítko by šlo kliknout dvakrát
  const [saving, setSaving] = useState(false)
  const [placePick, setPlace] = useState(initialPlace)
  // Místo, které v jiném rozsahu není, se ukáže jako „Všechna“
  const place = placePick === 'all' || data.places.some((p) => p.key === placePick) ? placePick : 'all'
  const [now, setNow] = useState<number | null>(null)
  const [quick, setQuick] = useState<QuickSlotInitial | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [emptyMenu, setEmptyMenu] = useState<EmptyMenu | null>(null)
  const [selItem, setSelItem] = useState<CalItem | null>(null)
  const [mounted, setMounted] = useState(false)

  // Čára „teď“ a stavy podle hodin prohlížeče – až po načtení (bez rozdílu proti serveru)
  useEffect(() => {
    setMounted(true)
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const isWeek = view === 'tyden'
  const isMonth = view === 'mesic'
  const isPast = data.date < data.today
  const isToday = data.date === data.today
  const day = data.days.find((d) => d.date === data.date) ?? data.days[0]
  const weekEmpty = !isMonth && data.days.every((d) => d.items.length === 0)
  const styleOf = useMemo(() => makeStyleOf(data.places), [data.places])
  const month = data.date.slice(0, 7)

  const pickPlace = (key: string) => {
    setPlace(key)
    try {
      const url = new URL(window.location.href)
      if (key === 'all') url.searchParams.delete('misto'); else url.searchParams.set('misto', key)
      window.history.replaceState(null, '', url.toString())
    } catch { /* jen pohodlí – filtr funguje i bez adresy */ }
  }

  const href = (d: string, v: View = view) => {
    const q = new URLSearchParams()
    if (d !== data.today) q.set('den', d)
    if (v !== 'den') q.set('pohled', v)
    if (place !== 'all') q.set('misto', place)
    const s = q.toString()
    return `/dashboard/kalendar${s ? `?${s}` : ''}`
  }
  const prevDate = isMonth ? shiftMonth(data.date, -1) : shiftDate(data.date, isWeek ? -7 : -1)
  const nextDate = isMonth ? shiftMonth(data.date, 1) : shiftDate(data.date, isWeek ? 7 : 1)

  // ── Souhrn ────────────────────────────────────────────────
  const shownDays = isMonth ? data.days.filter((d) => d.date.startsWith(month)) : isWeek ? data.days : [day]
  const summary = {
    bookings: shownDays.reduce((s, d) => s + filterItems(d.items, place).filter((i) => i.type === 'booking').length, 0),
    free: shownDays.reduce((s, d) => s + (d.gaps[place] ?? []).reduce((a, g) => a + g.minutes, 0), 0),
  }

  // ── Akce ──────────────────────────────────────────────────
  const openQuickGap = (date: string, g: CalGap) => setQuick(quickFromGap(date, g))

  const openQuickAt = (date: string, minute: number) => {
    const start = isoZPrazskehoCasu(date, hhmm(minute))
    const end = isoZPrazskehoCasu(date, hhmm(Math.min(minute + 60, 23 * 60 + 55)))
    setQuick(quickFromGap(date, { start, end, minutes: 60, cardIds: [] }))
  }

  const openForm = (mode: FormState['mode'], date: string = data.date, from = '', to = '') => {
    setError('')
    setForm({ mode, date, from, to, text: '' })
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
      .then((res) => { if (!res.success) alert(res.error); else setSelItem(null) })
      .catch(() => alert('Nepodařilo se smazat. Zkuste to prosím znovu.'))
      .finally(() => { setBusyId(null); router.refresh() })
  }

  // Bleskový termín bez konkrétního času: vybraný den, u minulého dnešek
  const quickDate = isPast ? data.today : data.date

  // ── Části ────────────────────────────────────────────────

  const addButtons = (layout: 'row' | 'panel') => {
    const cls = layout === 'row'
      ? 'flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-[11px] font-semibold leading-tight transition sm:flex-row sm:gap-1.5 sm:px-3 sm:text-xs'
      : 'flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-semibold transition'
    return (
      <>
        <button type="button" onClick={() => setQuick({ date: quickDate })}
          className={`${cls} ${layout === 'row' ? 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100' : 'text-slate-800 hover:bg-orange-50'}`}>
          <Zap className="h-4 w-4 shrink-0 fill-orange-400 text-orange-500" /> Bleskový termín
        </button>
        <button type="button" onClick={() => openForm('note')}
          className={`${cls} ${layout === 'row' ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'text-slate-800 hover:bg-amber-50'}`}>
          <StickyNote className="h-4 w-4 shrink-0 text-amber-500" /> {layout === 'row' ? 'Poznámka' : 'Poznámka (ruční rezervace)'}
        </button>
        <button type="button" onClick={() => openForm('block')}
          className={`${cls} ${layout === 'row' ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100' : 'text-slate-800 hover:bg-slate-100'}`}>
          <Ban className="h-4 w-4 shrink-0 text-slate-500" /> Blokovat čas
        </button>
      </>
    )
  }

  const legend = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-slate-900">Vaše místa</p>
      <ul className="mt-2 space-y-1.5">
        {data.places.map((p) => (
          <li key={p.key} className="flex items-start gap-2 text-xs text-slate-600">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${styleOf(p.key).dot}`} />
            <span className="min-w-0 break-words">{p.kind === 'vyjezdy' ? 'Výjezdy k zákazníkům' : p.label}</span>
          </li>
        ))}
        <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" /> Poznámka (mimo Propojo)</li>
        <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" /> Volno / vypsaný volný termín</li>
      </ul>
    </div>
  )

  const links = (
    <div className="space-y-2 px-1">
      <Link href="/dashboard/terminy" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
        <ListChecks className="h-4 w-4" /> Volné termíny dopředu → Termíny
      </Link>
      <div><UpcomingDrawer variant="text" /></div>
    </div>
  )

  const timeGridProps = {
    today: data.today,
    place,
    styleOf,
    now,
    onGap: openQuickGap,
    onEmpty: (date: string, minute: number, x: number, y: number) => setEmptyMenu({ date, minute, x, y }),
    onItem: (it: CalItem) => setSelItem(it),
  }

  const title = isMonth
    ? <span className="inline-block first-letter:uppercase">{monthYear(data.date)}</span>
    : isWeek
      ? <>{dayMonth(data.days[0].date)} – {dayMonth(data.days[data.days.length - 1].date)}</>
      : <span className="inline-block first-letter:uppercase">{denDlouze(noon(data.date))}</span>

  // ── Okna ──────────────────────────────────────────────────

  const emptyMenuEl = emptyMenu && mounted ? createPortal(
    <div className="fixed inset-0 z-[100]" onClick={() => setEmptyMenu(null)}>
      <div
        className="absolute w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
        style={{
          left: Math.max(8, Math.min(emptyMenu.x, window.innerWidth - 232)),
          top: Math.max(8, Math.min(emptyMenu.y, window.innerHeight - 190)),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-slate-500">
          {denKratce(noon(emptyMenu.date))} · {hhmm(emptyMenu.minute)}
        </p>
        <button type="button"
          disabled={emptyMenu.date < data.today}
          onClick={() => { openQuickAt(emptyMenu.date, emptyMenu.minute); setEmptyMenu(null) }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-orange-50 disabled:opacity-40">
          <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Bleskový termín
        </button>
        <button type="button"
          onClick={() => { openForm('note', emptyMenu.date, hhmm(emptyMenu.minute), hhmm(emptyMenu.minute + 60)); setEmptyMenu(null) }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-amber-50">
          <StickyNote className="h-4 w-4 text-amber-500" /> Poznámka
        </button>
        <button type="button"
          onClick={() => { openForm('block', emptyMenu.date, hhmm(emptyMenu.minute), hhmm(emptyMenu.minute + 60)); setEmptyMenu(null) }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-100">
          <Ban className="h-4 w-4 text-slate-500" /> Blokovat čas
        </button>
      </div>
    </div>,
    document.body,
  ) : null

  const itemModal = selItem && selItem.type !== 'booking' && mounted ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/30 px-4 pt-16" onClick={() => setSelItem(null)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 font-black text-slate-900">
            {selItem.type === 'slot'
              ? <><Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Vypsaný volný termín</>
              : selItem.kind === 'note'
                ? <><StickyNote className="h-4 w-4 text-amber-500" /> Poznámka</>
                : <><Ban className="h-4 w-4 text-slate-500" /> Blokováno</>}
          </p>
          <button type="button" onClick={() => setSelItem(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {denKratce(selItem.start)} · <span className="tabular-nums">{cas(selItem.start)}–{cas(selItem.end)}</span>
        </p>
        {selItem.type === 'slot' ? (
          <>
            <p className="mt-2 text-sm text-slate-700">{selItem.label}</p>
            <p className="mt-1 text-xs text-slate-500">Zákazníci si ho můžou rovnou zarezervovat.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ShareSlotButton slotId={selItem.id} variant="button" />
              <Link href="/dashboard/terminy" className="text-sm font-semibold text-emerald-700 underline">Upravit v Termínech</Link>
            </div>
          </>
        ) : (
          <>
            {selItem.text && <p className="mt-2 break-words text-sm text-slate-800">{selItem.text}</p>}
            {selItem.kind === 'note' && <p className="mt-1 text-xs text-slate-500">Jen pro vás, mimo Propojo. Čas je zablokovaný pro online rezervace.</p>}
            <button type="button" onClick={() => removeBlock(selItem.id, selItem.kind === 'note')} disabled={busyId === selItem.id}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
              {busyId === selItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {selItem.kind === 'note' ? 'Smazat poznámku' : 'Zrušit blokaci'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  ) : null

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

  // ── Stránka ───────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hlavička: titulek, Den | Týden | Měsíc, ‹ Dnes ›, filtr místa */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900">Kalendář</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {title}
              {!isWeek && !isMonth && isToday && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Dnes</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              {(['den', 'tyden', 'mesic'] as View[]).map((v) => (
                <Link key={v} href={href(data.date, v)}
                  className={`rounded-md px-3 py-1.5 transition ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {v === 'den' ? 'Den' : v === 'tyden' ? 'Týden' : 'Měsíc'}
                </Link>
              ))}
            </div>
            <Link href={href(prevDate)} aria-label="Předchozí"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link href={href(data.today)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
              Dnes
            </Link>
            <Link href={href(nextDate)} aria-label="Další"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Dny v týdnu (Den) */}
        {!isWeek && !isMonth && (
          <div className="mt-4 grid grid-cols-7 gap-1">
            {data.days.map((w, i) => {
              const on = w.date === data.date
              const isT = w.date === data.today
              const has = w.items.some((x) => x.type === 'booking')
              return (
                <Link key={w.date} href={href(w.date)}
                  className={`flex flex-col items-center rounded-xl py-1.5 transition ${
                    on ? (isT ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white') : isT ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-700 hover:bg-slate-100'
                  }`}>
                  <span className={`text-[11px] font-semibold ${on ? 'text-white/80' : 'text-slate-400'}`}>{WEEKDAYS[i]}</span>
                  <span className="text-base font-black tabular-nums">{Number(w.date.slice(8, 10))}</span>
                  <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${has ? (on ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent'}`} />
                </Link>
              )
            })}
          </div>
        )}

        {/* Filtr místa */}
        {data.places.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold text-slate-500">Místo</span>
            <button type="button" onClick={() => pickPlace('all')}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                place === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              Všechna
            </button>
            {data.places.map((p) => {
              const ps = styleOf(p.key)
              return (
                <button key={p.key} type="button" onClick={() => pickPlace(p.key)}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition sm:max-w-[16rem] ${
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
          {bookingsText(summary.bookings)}
          {summary.free > 0 && <> · volno {isMonth || isWeek ? 'ještě ' : ''}{durationText(summary.free)}</>}
          {!data.hasHours && <> · bez otevírací doby ukazujeme volno jen mezi rezervacemi</>}
          {!isMonth && <span className="hidden md:inline"> · klikněte do prázdné hodiny a přidejte termín, poznámku nebo blokaci</span>}
        </p>
      </div>

      {isMonth ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">{addButtons('row')}</div>
          <MonthView days={data.days} month={month} selectedInit={data.date} today={data.today}
            place={place} styleOf={styleOf} dayHref={(d) => href(d, 'den')} />
          <div className="grid gap-4 sm:grid-cols-2">{legend}{links}</div>
        </>
      ) : isWeek ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">{addButtons('row')}</div>
          <div className="hidden md:block">
            <TimeGrid days={data.days} dayHref={(d) => href(d, 'den')} {...timeGridProps} />
          </div>
          <WeekView days={data.days} today={data.today} place={place} styleOf={styleOf} dayHref={(d) => href(d, 'den')} />
          {weekEmpty && <SampleDay />}
          <div className="grid gap-4 sm:grid-cols-2">{legend}{links}</div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* Přidávání – tři tlačítka (na počítači v bočním panelu) */}
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap lg:hidden">{addButtons('row')}</div>
            <TimeGrid days={[day]} {...timeGridProps} />
            {weekEmpty && <SampleDay />}
          </div>
          <div className="space-y-4">
            <div className="hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
              <p className="px-3 pb-1 pt-1 text-sm font-black text-slate-900">Přidat do kalendáře</p>
              {addButtons('panel')}
            </div>
            {legend}
            {links}
          </div>
        </div>
      )}

      {emptyMenuEl}
      {itemModal}
      {formModal}
      <QuickSlotModal open={quick !== null} onClose={() => setQuick(null)} initial={quick ?? undefined} />
    </div>
  )
}
