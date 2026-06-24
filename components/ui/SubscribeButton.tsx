'use client'
// components/ui/SubscribeButton.tsx
// Přepínač měsíčně/ročně + tlačítko, které spustí Stripe Checkout pro zvolenou variantu.
import { useState } from 'react'
import { Loader2, CreditCard } from 'lucide-react'
import { createCheckoutSession } from '@/lib/actions/subscription'

type Billing = 'monthly' | 'yearly'

export default function SubscribeButton() {
  const [billing, setBilling] = useState<Billing>('monthly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setBusy(true)
    setError('')
    const res = await createCheckoutSession(billing)
    if (res.success) {
      window.location.href = res.url
    } else {
      setError(res.error)
      setBusy(false)
    }
  }

  // Roční 2990 = 249,17/měs → ušetří ~17 % oproti 12×299 (3588)
  const monthlyTotal = 299
  const yearlyTotal = 2990
  const yearlyPerMonth = Math.round(yearlyTotal / 12)
  const savePct = Math.round((1 - yearlyTotal / (monthlyTotal * 12)) * 100)

  return (
    <div>
      {/* Přepínač */}
      <div className="mb-4 flex gap-1.5 rounded-xl bg-slate-100 p-1.5">
        <button
          type="button"
          onClick={() => setBilling('monthly')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-all ${billing === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Měsíčně
        </button>
        <button
          type="button"
          onClick={() => setBilling('yearly')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-all ${billing === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Ročně
          <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">−{savePct} %</span>
        </button>
      </div>

      {/* Cena podle volby */}
      <div className="mb-4 flex items-baseline gap-1">
        {billing === 'monthly' ? (
          <>
            <span className="text-3xl font-black text-slate-900">299 Kč</span>
            <span className="text-slate-500">/ měsíc</span>
          </>
        ) : (
          <>
            <span className="text-3xl font-black text-slate-900">2 990 Kč</span>
            <span className="text-slate-500">/ rok</span>
            <span className="ml-2 text-sm text-slate-400">(~{yearlyPerMonth} Kč/měs.)</span>
          </>
        )}
      </div>

      <button onClick={handleClick} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Přesměrovávám…</> : <><CreditCard className="h-4 w-4" /> Aktivovat předplatné</>}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}