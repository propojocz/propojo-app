'use client'
// components/ui/TimePreferenceForm.tsx
// Nad chatem u poptávky bez termínu: zákazník zadá přibližné okno (od–do)
// a denní dobu. Poskytovatel to vidí v TimeProposalPanel a navrhne podle
// toho konkrétní časy.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Loader2, Check } from 'lucide-react'
import { setTimePreference, type TimePref } from '@/lib/actions/time-preference'

interface Props {
  orderId: string
  initialFrom?: string | null
  initialTo?: string | null
  initialTimePref?: string | null
}

const TIME_OPTIONS: { value: TimePref; label: string }[] = [
  { value: 'kdykoli', label: 'Kdykoli' },
  { value: 'rano', label: 'Ráno (8–12)' },
  { value: 'odpoledne', label: 'Odpoledne (12–17)' },
  { value: 'vecer', label: 'Večer (17–20)' },
]

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function TimePreferenceForm({ orderId, initialFrom, initialTo, initialTimePref }: Props) {
  const router = useRouter()
  const [from, setFrom] = useState(initialFrom ?? '')
  const [to, setTo] = useState(initialTo ?? '')
  const [timePref, setTimePref] = useState<TimePref>((initialTimePref as TimePref) ?? 'kdykoli')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(!!initialFrom)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true); setError('')
    const res = await setTimePreference(orderId, from, to, timePref)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setSaved(true)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <CalendarRange className="h-5 w-5 text-emerald-600" />
        <h2 className="font-black text-slate-900">Kdy se vám to hodí?</h2>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Zadejte přibližné okno — poskytovatel podle něj navrhne konkrétní časy.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Od</label>
          <input
            type="date"
            value={from}
            min={todayStr()}
            onChange={(e) => { setFrom(e.target.value); setSaved(false) }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Do</label>
          <input
            type="date"
            value={to}
            min={from || todayStr()}
            onChange={(e) => { setTo(e.target.value); setSaved(false) }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Denní doba</label>
          <select
            value={timePref}
            onChange={(e) => { setTimePref(e.target.value as TimePref); setSaved(false) }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          >
            {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !from || !to}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? 'Uloženo' : 'Uložit'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}