'use client'
// app/dashboard/kalendar/KalendarClient.tsx
// Kalendář poskytovatele (K4, 19. 10. 2026; vzhled podle mockupu Mateje v barvách Propoja): Den | Týden | Měsíc.
//   Den    – mřížka hodin (TimeGrid) + proužek dnů v týdnu, na počítači boční panel.
//   Týden  – počítač mřížka hodin 7 dní, mobil seznam po dnech (WeekView).
//   Měsíc  – MonthView (počítač mřížka se záznamy, mobil tečky + seznam vybraného dne).
// „+ Přidat termín“ = vlastní termín mimo Propojo (den, čas, poznámka; v datech provider_blocks kind 'note',
// blokuje čas) – sloučeno s dřívější „Poznámkou“. Klik do prázdné hodiny → Přidat termín / Bleskový termín /
// Blokovat čas s tím časem; klik na volno → ⚡; klik na vlastní termín / blokaci / vypsaný volný termín →
// detail se smazáním / sdílením; rezervace → detail objednávky.
// Filtr „Místo“ mění jen to, co se ukazuje, a otevírací dobu pro mezery – obsazenost je vždy celá.
// Vlastní termín („ruční rezervace“) je jen pro poskytovatele: blokuje čas, bez platby, není to rezervace přes Propojo.
// Ukázkový den (SampleDay) jen při prázdném týdnu (Den, Týden).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ban, CalendarDays, ChevronLeft, ChevronRight, ListChecks, Loader2, Plus, Search, StickyNote, Trash2, X, Zap } from 'lucide-react'
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
import CalendarSearch from './CalendarSearch'
import { WEEKDAYS, bookingsText, durationText, filterItems, gapsOf, hhmm, makeStyleOf, noon, quickFromGap, shiftDate, shortPlace, type PlaceSel } from './shared'

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
  // Vybraná místa – jedno i víc, klik místo přidá / odebere; prázdné = všechna (v adrese ?misto=a|b)
  const [selPick, setSelPick] = useState<PlaceSel>(() => (initialPlace && initialPlace !== 'all' ? initialPlace.split('|').filter(Boolean) : []))
  // Místa, která v jiném rozsahu nejsou, se z výběru vynechají
  const sel: PlaceSel = selPick.filter((k) => data.places.some((p) => p.key === k))
  const [now, setNow] = useState<number | null>(null)
  const [quick, setQuick] = useState<QuickSlotInitial | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [emptyMenu, setEmptyMenu] = useState<EmptyMenu | null>(null)
  const [selItem, setSelItem] = useState<CalItem | null>(null)
  const [mounted, setMounted] = useState(false)
  // Hledání – drží se i při přepnutí dne (stejná stránka), mřížka podle něj zvýrazňuje
  const [search, setSearch] = useState('')

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

  const setSel = (next: PlaceSel) => {
    setSelPick(next)
    try {
      const url = new URL(window.location.href)
      if (next.length === 0) url.searchParams.delete('misto'); else url.searchParams.set('misto', next.join('|'))
      window.history.replaceState(null, '', url.toString())
    } catch { /* jen pohodlí – filtr funguje i bez adresy */ }
  }
  // Klik na místo ho přidá do výběru nebo z něj odebere; „Všechna místa“ výběr zruší
  const togglePlace = (key: string) => setSel(sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key])

  const href = (d: string, v: View = view) => {
    const q = new URLSearchParams()
    if (d !== data.today) q.set('den', d)
    if (v !== 'den') q.set('pohled', v)
    if (sel.length > 0) q.set('misto', sel.join('|'))
    const s = q.toString()
    return `/dashboard/kalendar${s ? `?${s}` : ''}`
  }
  const prevDate = isMonth ? shiftMonth(data.date, -1) : shiftDate(data.date, isWeek ? -7 : -1)
  const nextDate = isMonth ? shiftMonth(data.date, 1) : shiftDate(data.date, isWeek ? 7 : 1)

  // ── Souhrn ────────────────────────────────────────────────
  const shownDays = isMonth ? data.days.filter((d) => d.date.startsWith(month)) : isWeek ? data.days : [day]
  const summary = {
    bookings: shownDays.reduce((s, d) => s + filterItems(d.items, sel).filter((i) => i.type === 'booking').length, 0),
    free: shownDays.reduce((s, d) => s + gapsOf(d, sel).reduce((a, g) => a + g.minutes, 0), 0),
  }

  // ── Akce ──────────────────────────────────────────────────
  const openQuickGap = (date: string, g: CalGap) => setQuick(quickFromGap(date, g))

  const openQuickAt = (date: string, minute: number) => {
    const start = isoZPrazskehoCasu(date, hhmm(minute))
    const end = isoZPrazskehoCasu(date, hhmm(Math.min(minute + 60, 23 * 60 + 45)))
    setQuick(quickFromGap(date, { start, end, minutes: 60, cardIds: [] }))
  }

  const openForm = (mode: FormState['mode'], date: string = data.date, from = '', to = '') => {
    setError('')
    setForm({ mode, date, from, to, text: '' })
  }

  const submitForm = () => {
    if (!form) return
    if (!form.date || !form.from || !form.to) { setError('Vyplňte den a čas od–do.'); return }
    if (form.mode === 'note' && !form.text.trim()) { setError('Napište do poznámky, kdo a co.'); return }
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
    if (!confirm(isNote ? 'Smazat vlastní termín? Čas se znovu uvolní pro online rezervace.' : 'Zrušit blokaci? Čas se znovu uvolní pro online rezervace.')) return
    setBusyId(id)
    unblockTime(id)
      .then((res) => { if (!res.success) alert(res.error); else setSelItem(null) })
      .catch(() => alert('Nepodařilo se smazat. Zkuste to prosím znovu.'))
      .finally(() => { setBusyId(null); router.refresh() })
  }

  // Bleskový termín bez konkrétního času: vybraný den, u minulého dnešek
  const quickDate = isPast ? data.today : data.date

  // ── Části ────────────────────────────────────────────────

  // Tři tlačítka v kartě „Místa a výjezdy“ (mockup): Přidat termín (hlavní), Bleskový termín, Blokovat čas
  const addCls = 'flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-bold leading-tight transition sm:flex-row sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm'
  const addButtons = (
    <>
      <button type="button" onClick={() => openForm('note')}
        className={`${addCls} bg-emerald-500 text-white shadow-sm hover:bg-emerald-600`}>
        <Plus className="h-4 w-4 shrink-0" /> Přidat termín
      </button>
      <button type="button" onClick={() => setQuick({ date: quickDate })}
        className={`${addCls} border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100`}>
        <Zap className="h-4 w-4 shrink-0 fill-orange-400 text-orange-500" /> Bleskový termín
      </button>
      <button type="button" onClick={() => openForm('block')}
        className={`${addCls} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
        <Ban className="h-4 w-4 shrink-0 text-slate-500" /> Blokovat čas
      </button>
    </>
  )

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
        <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" /> Vlastní termín (mimo Propojo)</li>
        <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-400" /> Vypsaný volný termín (⚡)</li>
        <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1 h-2 w-2 shrink-0 rounded-full border border-dashed border-slate-400 bg-slate-50" /> Volno (celé a půl hodiny) – klikněte a vypište bleskový termín</li>
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
    sel,
    search,
    hasHours: data.hasHours,
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
          onClick={() => { openForm('note', emptyMenu.date, hhmm(emptyMenu.minute), hhmm(emptyMenu.minute + 60)); setEmptyMenu(null) }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-emerald-50">
          <Plus className="h-4 w-4 text-emerald-600" /> Přidat termín
        </button>
        <button type="button"
          disabled={emptyMenu.date < data.today}
          onClick={() => { openQuickAt(emptyMenu.date, emptyMenu.minute); setEmptyMenu(null) }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-orange-50 disabled:opacity-40">
          <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Bleskový termín
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
                ? <><StickyNote className="h-4 w-4 text-amber-500" /> Vlastní termín</>
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
            {selItem.kind === 'note' && <p className="mt-1 text-xs text-slate-500">Mimo Propojo, vidíte ho jen vy. Čas je zablokovaný pro online rezervace.</p>}
            <button type="button" onClick={() => removeBlock(selItem.id, selItem.kind === 'note')} disabled={busyId === selItem.id}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
              {busyId === selItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {selItem.kind === 'note' ? 'Smazat termín' : 'Zrušit blokaci'}
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
              ? <><Plus className="h-4 w-4 text-emerald-600" /> Přidat termín</>
              : <><Ban className="h-4 w-4 text-slate-500" /> Blokovat čas</>}
          </p>
          <button type="button" onClick={() => setForm(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {form.mode === 'note'
            ? 'Vlastní termín mimo Propojo – třeba zákazník, který vám zavolal. Vidíte ho jen vy a čas se zablokuje pro online rezervace. Žádná platba ani pravidla rezervací Propoja se na něj nevztahují.'
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
          {form.mode === 'note' ? 'Poznámka – kdo a co' : 'Důvod (nepovinné)'}
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
              form.mode === 'note' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-800 hover:bg-slate-900'
            }`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : form.mode === 'note' ? <Plus className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {form.mode === 'note' ? 'Uložit termín' : 'Zablokovat'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  // ── Stránka ───────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hlavička: titulek vlevo, Den | Týden | Měsíc a ‹ Dnes › vpravo */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            {isMonth ? 'Váš pracovní měsíc' : isWeek ? 'Váš pracovní týden' : 'Váš pracovní den'}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600 sm:text-base">
            {title}
            {!isWeek && !isMonth && isToday && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Dnes</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold shadow-sm">
            {(['den', 'tyden', 'mesic'] as View[]).map((v) => (
              <Link key={v} href={href(data.date, v)}
                className={`rounded-lg px-3.5 py-1.5 transition ${view === v ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
                {v === 'den' ? 'Den' : v === 'tyden' ? 'Týden' : 'Měsíc'}
              </Link>
            ))}
          </div>
          <Link href={href(prevDate)} aria-label="Předchozí"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link href={href(data.today)}
            className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700">
            Dnes
          </Link>
          <Link href={href(nextDate)} aria-label="Další"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Hledání, místa a výjezdy, přidávání */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-18px_rgba(15,23,42,0.18)] sm:p-5">
        <div className="mb-4">
          <CalendarSearch query={search} onQuery={setSearch} styleOf={styleOf} onPick={() => setSel([])}
            dayHref={(d) => `/dashboard/kalendar${d !== data.today ? `?den=${d}` : ''}`} />
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {data.places.length > 1 && (
              <>
                <p className="mb-2 text-[13px] font-semibold text-slate-700">Místa a výjezdy <span className="font-normal text-slate-400">· klikněte na jedno nebo víc míst</span></p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setSel([])}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                      sel.length === 0 ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}>
                    Všechna místa
                  </button>
                  {data.places.map((p) => {
                    const ps = styleOf(p.key)
                    const on = sel.includes(p.key)
                    return (
                      <button key={p.key} type="button" onClick={() => togglePlace(p.key)} aria-pressed={on} title={p.kind === 'vyjezdy' ? 'Výjezdy k zákazníkům' : p.label}
                        className={`inline-flex max-w-[12rem] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                          on ? `${ps.chip} font-bold shadow-sm` : `${ps.tint} border-transparent text-slate-700 hover:brightness-95`
                        }`}>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${ps.dot}`} />
                        <span className="truncate">{p.kind === 'vyjezdy' ? 'Výjezdy' : shortPlace(p.label)}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <p className={`flex flex-wrap items-center gap-1.5 text-xs text-slate-500 ${data.places.length > 1 ? 'mt-3' : ''}`}>
              <CalendarDays className="h-4 w-4 text-slate-400" />
              {bookingsText(summary.bookings).replace('Žádná rezervace', 'Žádné rezervace')}{' '}
              {isMonth ? `v měsíci` : isWeek ? 'tento týden' : isToday ? 'dnes' : 'v tento den'}
              {summary.free > 0 && <> · volno {isMonth || isWeek ? 'ještě ' : ''}{durationText(summary.free)}</>}
              {!data.hasHours && <> · bez otevírací doby ukazujeme volno jen mezi rezervacemi</>}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap lg:shrink-0">{addButtons}</div>
        </div>

        {/* Dny v týdnu (Den) */}
        {!isWeek && !isMonth && (
          <div className="mt-4 grid grid-cols-7 gap-1 border-t border-slate-100 pt-4">
            {data.days.map((w, i) => {
              const on = w.date === data.date
              const isT = w.date === data.today
              const has = w.items.some((x) => x.type === 'booking')
              const hasSlot = w.items.some((x) => x.type === 'slot')
              return (
                <Link key={w.date} href={href(w.date)}
                  className={`flex flex-col items-center rounded-xl py-1.5 transition ${
                    on ? 'bg-emerald-500 text-white shadow-sm' : isT ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}>
                  <span className={`text-[11px] font-semibold ${on ? 'text-white/85' : 'text-slate-400'}`}>{WEEKDAYS[i]}</span>
                  <span className="text-base font-black tabular-nums">{Number(w.date.slice(8, 10))}</span>
                  <span className="mt-0.5 flex h-2 items-center gap-0.5">
                    {has && <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : 'bg-emerald-500'}`} />}
                    {hasSlot && <Zap className={`h-2.5 w-2.5 ${on ? 'fill-white text-white' : 'fill-orange-400 text-orange-500'}`} />}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Při hledání: co je zvýrazněné a jak hledání zrušit */}
      {search.trim().length >= 2 && !isMonth && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <Search className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="min-w-0 flex-1">
            Zvýrazněno: <span className="font-bold">„{search.trim()}“</span>
            <span className="text-emerald-800/80"> – ostatní záznamy jsou ztlumené.</span>
          </p>
          <button type="button" onClick={() => setSearch('')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100">
            <X className="h-3.5 w-3.5" /> Zrušit hledání
          </button>
        </div>
      )}

      {isMonth ? (
        <MonthView days={data.days} month={month} selectedInit={data.date} today={data.today}
          sel={sel} styleOf={styleOf} dayHref={(d) => href(d, 'den')} />
      ) : isWeek ? (
        <>
          <div className="hidden md:block">
            <TimeGrid days={data.days} dayHref={(d) => href(d, 'den')} {...timeGridProps} />
          </div>
          <WeekView days={data.days} today={data.today} sel={sel} styleOf={styleOf} dayHref={(d) => href(d, 'den')} />
        </>
      ) : (
        <TimeGrid days={[day]} {...timeGridProps} />
      )}

      {weekEmpty && <SampleDay />}
      <div className="grid gap-4 sm:grid-cols-2">{legend}{links}</div>

      {emptyMenuEl}
      {itemModal}
      {formModal}
      <QuickSlotModal open={quick !== null} onClose={() => setQuick(null)} initial={quick ?? undefined} />
    </div>
  )
}
