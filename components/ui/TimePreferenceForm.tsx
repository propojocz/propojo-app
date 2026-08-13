'use client'
// components/ui/TimePreferenceForm.tsx
// Nad chatem u poptávky bez termínu: zákazník zadá přibližné okno (od–do)
// a denní dobu. Poskytovatel to vidí v TimeProposalPanel a navrhne podle
// toho konkrétní časy.
//
// Preference se navíc PROPÍŠE DO CHATU jako zpráva od zákazníka. Bez toho
// se uložila jen tiše do objednávky: poskytovateli nic necinklo a zákazník
// neměl potvrzení, že to někdo vidí. V konverzaci zůstane dohledatelná,
// i když se pak domluví jinak.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Loader2, Check } from 'lucide-react'
import { setTimePreference, type TimePref } from '@/lib/actions/time-preference'
import { sendOrderMessage } from '@/lib/actions/orders'

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

// „14. 8." — do zprávy stačí den a měsíc, rok se plete.
function denMesic(iso: string): string {
  try {
    return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' }).format(new Date(iso))
  } catch { return iso }
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
    if (!res.success) { setBusy(false); setError(res.error); return }

    // Do chatu — poskytovateli tím cinkne oznámení a informace neuteče.
    // Selhání zprávy nesmí shodit uložení preference, proto jen zalogujeme.
    try {
      const doba = TIME_OPTIONS.find(o => o.value === timePref)?.label ?? ''
      const rozsah = from === to ? denMesic(from) : `${denMesic(from)} – ${denMesic(to)}`
      const text = timePref === 'kdykoli'
        ? `Hodilo by se mi ${rozsah}, čas kdykoli.`
        : `Hodilo by se mi ${rozsah}, nejlépe ${doba.toLowerCase()}.`
      await sendOrderMessage(orderId, text)
    } catch (e) {
      console.error('[TimePreferenceForm] zpráva do chatu:', e)
    }

    setBusy(false)
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
        Odešleme mu to i jako zprávu, ať mu to nezapadne.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Od</label>
          <input
            type="date"
            value={from}
            min={todayStr()}
            onChange={(e) => { setFrom(e.target.value); setSaved(false) }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Do</label>
          <input
            type="date"
            value={to}
            min={from || todayStr()}
            onChange={(e) => { setTo(e.target.value); setSaved(false) }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <div className="col-span-2 sm:col-auto">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Denní doba</label>
          <select
            value={timePref}
            onChange={(e) => { setTimePref(e.target.value as TimePref); setSaved(false) }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          >
            {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !from || !to}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50 sm:col-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? 'Uloženo' : 'Uložit a odeslat'}
        </button>
      </div>

      {saved && !busy && (
        <p className="mt-2 text-xs text-emerald-700">
          Odesláno — poskytovatel to má ve zprávách a ozve se s návrhem termínů.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}