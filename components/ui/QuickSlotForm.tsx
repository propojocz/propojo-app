'use client'
// components/ui/QuickSlotForm.tsx
// Rychlé vypsání volného termínu z kalendářového panelu u zvonečku – den, od–do, karty.
// Stejná serverová akce jako stránka Termíny (createSlot), včetně otázky „mimo otevírací dobu“.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, Zap } from 'lucide-react'
import { createSlot } from '@/lib/actions/slots'

function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 3600_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export default function QuickSlotForm({
  cards,
  onClose,
}: {
  cards: { id: string; title: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [date, setDate] = useState(localDate(0))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Jedna karta = rovnou vybraná
  const [checked, setChecked] = useState<string[]>(cards.length === 1 ? [cards[0].id] : [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [askOutside, setAskOutside] = useState(false)
  const [done, setDone] = useState<string | null>(null)

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
    const startsAt = new Date(`${date}T${from}:00`)
    const endsAt = new Date(`${date}T${to}:00`)
    setBusy(true)
    const res = await createSlot({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      service_ids: checked,
      outsideHoursConfirmed,
    })
    setBusy(false)
    if (res.success) {
      setDone(`${fmt(startsAt.toISOString())}–${fmtTime(endsAt.toISOString())}`)
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
          <CheckCircle2 className="h-4 w-4" /> Vypsáno: {done}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          Zákazníci si ho teď můžou rovnou zarezervovat. Rozeslat ho svým zákazníkům můžete v Termínech.
        </p>
        <div className="mt-2 flex gap-3 text-xs font-semibold">
          <button type="button" onClick={() => { setDone(null); setFrom(''); setTo('') }} className="text-emerald-700 underline">
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
    <div className="rounded-2xl border border-orange-200 bg-white p-3.5 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-black text-slate-900">
        <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Vypsat volný termín
      </p>

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
        <label className="text-[11px] font-semibold text-slate-500">
          Od
          <input type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 outline-none focus:border-orange-400" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Do
          <input type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 outline-none focus:border-orange-400" />
        </label>
      </div>

      {cards.length > 1 && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-semibold text-slate-500">Co v termínu nabízíte</p>
          {cards.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={checked.includes(c.id)}
                onChange={(e) => setChecked((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                className="h-4 w-4 accent-orange-500"
              />
              <span className="truncate">{c.title}</span>
            </label>
          ))}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      <div className="mt-3 flex gap-2">
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
