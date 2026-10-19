'use client'
// components/ui/QuickSlotForm.tsx
// Bleskový termín (⚡ v horní liště) – rychle jeden nebo víc volných termínů: den, od–do, karty
// a u každé karty, které služby z ceníku v termínu nabízíte (13. 10. 2026; služby delší než okno
// se nedají vybrat). Stejná serverová akce jako stránka Termíny (createSlot), včetně otázky
// „mimo otevírací dobu“. Termíny dopředu se dál vypisují v Moje nabídky / Termíny.
// Z Kalendáře (K1) se otevírá s předvyplněným dnem, časem a kartami volné mezery (initial).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, Trash2, Zap } from 'lucide-react'
import { createSlot, deleteSlot, type QuickSlotCard } from '@/lib/actions/slots'
import { getMyUpcomingSlots, type MyQuickSlot } from '@/lib/actions/slot-share'
import ShareSlotButton from '@/components/ui/ShareSlotButton'

function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 3600_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Výchozí okno: nejbližší čtvrthodina (aspoň za 15 min) a hodina po ní – pole nejsou prázdná */
function defaultWindow(): { from: string; to: string } {
  const d = new Date(Date.now() + 15 * 60_000)
  let min = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15
  if (min > 22 * 60) min = 9 * 60
  const end = Math.min(min + 60, 23 * 60 + 55)
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { from: hhmm(min), to: hhmm(end) }
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export type QuickSlotInitial = { date?: string; from?: string; to?: string; cardIds?: string[] }

export default function QuickSlotForm({
  cards,
  onClose,
  initial,
}: {
  cards: QuickSlotCard[]
  onClose: () => void
  /** Předvyplnění (volná mezera v Kalendáři) */
  initial?: QuickSlotInitial
}) {
  const router = useRouter()
  const [date, setDate] = useState(initial?.date ?? localDate(0))
  const [from, setFrom] = useState(() => initial?.from ?? defaultWindow().from)
  const [to, setTo] = useState(() => initial?.to ?? defaultWindow().to)
  // Předvyplněné karty, jinak jedna karta = rovnou vybraná
  const [checked, setChecked] = useState<string[]>(() => {
    const pre = (initial?.cardIds ?? []).filter((id) => cards.some((c) => c.id === id))
    if (pre.length > 0) return pre
    return cards.length === 1 ? [cards[0].id] : []
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [askOutside, setAskOutside] = useState(false)
  const [done, setDone] = useState<{ text: string; slotId: string | null } | null>(null)
  // Už vypsané volné termíny (nejbližší 3) – ať poskytovatel vidí, co už nabízí, a může je sdílet
  const [mine, setMine] = useState<MyQuickSlot[] | null>(null)
  const loadMine = () => { getMyUpcomingSlots(3).then(setMine).catch(() => setMine([])) }
  useEffect(() => { loadMine() }, [])
  const [deleting, setDeleting] = useState<string | null>(null)
  const removeSlot = async (m: MyQuickSlot) => {
    if (!confirm(`Smazat volný termín ${fmt(m.startsAt)}–${fmtTime(m.endsAt)}? Zákazníci ho přestanou vidět.`)) return
    setDeleting(m.id); setErr('')
    const res = await deleteSlot(m.id)
    setDeleting(null)
    if (!res.success) { setErr(res.error); return }
    setMine((prev) => (prev ?? []).filter((x) => x.id !== m.id))
    loadMine()
    router.refresh()
  }
  // Vybrané služby z ceníku podle karty – výchozí všechny
  const [itemSel, setItemSel] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, c.items.map((i) => i.id)])))

  // Délka okna v minutách – služba delší než okno se do něj nevejde
  const windowMin = from && to
    ? (() => { const [fh, fm] = from.split(':').map(Number); const [th, tm] = to.split(':').map(Number); return th * 60 + tm - (fh * 60 + fm) })()
    : null
  const fits = (i: { duration_minutes: number | null }) => windowMin == null || windowMin <= 0 || !i.duration_minutes || i.duration_minutes <= windowMin

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
        Termín zatím nemáte k čemu vypsat – žádná aktivní karta nemá službu s pevnou cenou.{' '}
        <Link href="/dashboard/nabidky" className="font-semibold underline">Moje nabídky</Link>
      </div>
    )
  }

  const submit = async (outsideHoursConfirmed = false) => {
    setErr(''); setAskOutside(false)
    if (!date || !from || !to) { setErr('Vyplňte den a čas od–do.'); return }
    if (checked.length === 0) { setErr('Vyberte, co se v termínu nabízí.'); return }
    // Jen vybrané služby, které se do okna vejdou; když jsou vybrané všechny, omezení se neukládá
    const item_ids: Record<string, string[]> = {}
    for (const cid of checked) {
      const card = cards.find((c) => c.id === cid)
      if (!card) continue
      const fitting = card.items.filter(fits)
      const chosen = fitting.filter((i) => (itemSel[cid] ?? []).includes(i.id))
      if (chosen.length === 0) { setErr(`U karty „${card.title}“ vyberte aspoň jednu službu, která se do termínu vejde.`); return }
      if (chosen.length < fitting.length) item_ids[cid] = chosen.map((i) => i.id)
    }
    const startsAt = new Date(`${date}T${from}:00`)
    const endsAt = new Date(`${date}T${to}:00`)
    setBusy(true)
    const res = await createSlot({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      service_ids: checked,
      item_ids,
      outsideHoursConfirmed,
    })
    setBusy(false)
    if (res.success) {
      setDone({ text: `${fmt(startsAt.toISOString())}–${fmtTime(endsAt.toISOString())}`, slotId: res.id ?? null })
      loadMine()
      router.refresh()
      return
    }
    setErr(res.error)
    if ('confirm' in res && res.confirm === 'outside_hours') setAskOutside(true)
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
        <p className="flex items-center gap-1.5 font-bold">
          <CheckCircle2 className="h-4 w-4" /> Vypsáno: {done.text}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          Zákazníci si ho teď můžou rovnou zarezervovat. Pošlete ho dál – na Facebook, Instagram, WhatsApp nebo jako QR kód.
        </p>
        {done.slotId && (
          <div className="mt-2.5">
            <ShareSlotButton slotId={done.slotId} variant="button" />
          </div>
        )}
        <div className="mt-2 flex gap-3 text-xs font-semibold">
          <button type="button" onClick={() => { setDone(null); const d = defaultWindow(); setFrom(d.from); setTo(d.to) }} className="text-emerald-700 underline">
            Vypsat další
          </button>
          <Link href="/dashboard/terminy" className="text-emerald-700 underline">Otevřít Termíny</Link>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500">Hotovo</button>
        </div>
      </div>
    )
  }

  const dayBtn = (offset: number, label: string) => (
    <button
      type="button"
      onClick={() => setDate(localDate(offset))}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        date === localDate(offset) ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-orange-300'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex max-h-[calc(100dvh-6rem)] flex-col rounded-2xl border border-orange-200 bg-white shadow-sm">
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-black text-slate-900">
        <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Vypsat bleskový termín
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">Rychle jeden nebo víc volných termínů. Termíny dopředu vypíšete v Termínech.</p>

      {/* Už vypsané volné termíny – jeden řádek na termín + sdílení */}
      {mine && mine.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold text-emerald-800">Už vypsané</p>
          <ul className="space-y-1.5">
            {mine.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{fmt(m.startsAt)}–{fmtTime(m.endsAt)}</p>
                  {m.label && <p className="truncate text-[11px] text-slate-500">{m.label}</p>}
                </div>
                <ShareSlotButton slotId={m.id} variant="icon" />
                <button
                  type="button"
                  onClick={() => removeSlot(m)}
                  disabled={deleting === m.id}
                  title="Smazat termín"
                  aria-label="Smazat termín"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                >
                  {deleting === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/terminy" className="mt-1.5 inline-block text-[11px] font-semibold text-emerald-700 underline">Všechny termíny</Link>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dayBtn(0, 'Dnes')}
        {dayBtn(1, 'Zítra')}
        <input
          type="date"
          value={date}
          min={localDate(0)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400"
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="min-w-0 text-[11px] font-semibold text-slate-500">
          Od
          <input type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 block w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 outline-none focus:border-orange-400" />
        </label>
        <label className="min-w-0 text-[11px] font-semibold text-slate-500">
          Do
          <input type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 block w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 outline-none focus:border-orange-400" />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500">Co v termínu nabízíte</p>
        {cards.map((c) => {
          const on = checked.includes(c.id)
          return (
            <div key={c.id} className={`rounded-xl border px-3 py-2 ${on ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200'}`}>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setChecked((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                  className="h-4 w-4 accent-orange-500"
                />
                <span className="truncate">{c.title}</span>
              </label>
              {/* Ceník karty – vyberte jen služby, které v termínu chcete nabídnout */}
              {on && (
                <div className="mt-1.5 space-y-1 border-t border-orange-100 pl-6 pt-1.5">
                  {c.items.map((it) => {
                    const ok = fits(it)
                    const sel = (itemSel[c.id] ?? []).includes(it.id)
                    return (
                      <label key={it.id} className={`flex items-center gap-2 text-xs ${ok ? 'cursor-pointer text-slate-700' : 'text-slate-400'}`}>
                        <input
                          type="checkbox"
                          disabled={!ok}
                          checked={ok && sel}
                          onChange={(e) => setItemSel((prev) => {
                            const cur = prev[c.id] ?? []
                            return { ...prev, [c.id]: e.target.checked ? [...cur, it.id] : cur.filter((x) => x !== it.id) }
                          })}
                          className="h-3.5 w-3.5 accent-orange-500"
                        />
                        <span className="min-w-0 flex-1 truncate">{it.name}</span>
                        {it.duration_minutes ? <span className="shrink-0">{it.duration_minutes} min</span> : null}
                        {!ok && <span className="shrink-0 font-semibold">nevejde se</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      </div>

      {/* Tlačítka vždy viditelná dole – posouvá se jen obsah nad nimi */}
      <div className="flex shrink-0 gap-2 border-t border-slate-100 p-3.5">
        <button type="button" onClick={onClose} disabled={busy}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
          Zpět
        </button>
        <button
          type="button"
          onClick={() => submit(askOutside)}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {askOutside ? 'Ano, v tomto čase pracuji – vypsat' : 'Vypsat'}
        </button>
      </div>
    </div>
  )
}
