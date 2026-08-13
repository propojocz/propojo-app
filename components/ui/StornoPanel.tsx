'use client'
// components/ui/StornoPanel.tsx
// Poskytovateli u zrušené objednávky: storno poplatek je jeho, ale může ho
// odpustit nebo snížit — třeba když se se zákazníkem domluvili na jiném
// termínu. Když nic neudělá, do 24 hodin se poplatek strhne sám.
//
// Snížit jde, zvýšit ne. Stejné pravidlo jako u nedostavení.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Loader2, HeartHandshake, Check } from 'lucide-react'
import { waiveStornoFee } from '@/lib/actions/payout'

export default function StornoPanel({
  orderId, poplatek, zaplaceno, markedAt,
}: {
  orderId: string
  poplatek: number
  zaplaceno: number
  markedAt: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [snizeni, setSnizeni] = useState(false)
  const [castka, setCastka] = useState(String(poplatek))

  // Kolik času zbývá do automatického strhnutí.
  const zbyva = (() => {
    const konec = new Date(markedAt).getTime() + 24 * 3600 * 1000
    const h = Math.max(0, Math.round((konec - Date.now()) / 3600000))
    return h
  })()

  const proved = async (nova: number, klic: string) => {
    setBusy(klic); setErr(null)
    const res = await waiveStornoFee(orderId, nova)
    setBusy(null)
    if (res.success) router.refresh(); else setErr(res.error)
  }

  const vratka = Math.max(0, zaplaceno - poplatek)

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-amber-700" />
        <h2 className="font-black text-slate-900">Zákazník zrušil — storno poplatek</h2>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-slate-600">
        Podle vašeho nastavení vám náleží <strong className="text-slate-900">{poplatek.toLocaleString('cs-CZ')} Kč</strong>
        {vratka > 0 && <> a zákazníkovi se vrátí {vratka.toLocaleString('cs-CZ')} Kč</>}.
        {zbyva > 0
          ? <> Převedeme to automaticky {zbyva === 1 ? 'do hodiny' : `do ${zbyva} hodin`}.</>
          : <> Převod proběhne při nejbližším zpracování.</>}
      </p>

      {!snizeni ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => proved(0, 'odpustit')}
            disabled={busy !== null}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
          >
            {busy === 'odpustit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartHandshake className="h-4 w-4" />}
            Odpustit celý poplatek
          </button>
          <button
            onClick={() => setSnizeni(true)}
            disabled={busy !== null}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Snížit částku
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">
            Nová výše poplatku (max {poplatek.toLocaleString('cs-CZ')} Kč)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={poplatek}
              value={castka}
              onChange={e => setCastka(e.target.value)}
              className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <button
              onClick={() => proved(Number(castka) || 0, 'snizit')}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {busy === 'snizit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Potvrdit
            </button>
            <button
              onClick={() => { setSnizeni(false); setCastka(String(poplatek)) }}
              disabled={busy !== null}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Zpět
            </button>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-xs leading-relaxed text-amber-800">
        Domluvili jste se na jiném termínu nebo je to stálý zákazník? Odpuštěním se
        mu vrátí celá zaplacená částka a dozví se, že jste mu vyšli vstříc.
      </p>

      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}