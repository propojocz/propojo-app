'use client'
// components/ui/SubscribeButton.tsx
// Tlačítko: spustí Stripe Checkout a přesměruje poskytovatele na platbu.
import { useState } from 'react'
import { Loader2, CreditCard } from 'lucide-react'
import { createCheckoutSession } from '@/lib/actions/subscription'

export default function SubscribeButton({ label = 'Aktivovat předplatné' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setBusy(true)
    setError('')
    const res = await createCheckoutSession()
    if (res.success) {
      // Přesměrování na Stripe Checkout
      window.location.href = res.url
    } else {
      setError(res.error)
      setBusy(false)
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Přesměrovávám…</> : <><CreditCard className="h-4 w-4" /> {label}</>}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}