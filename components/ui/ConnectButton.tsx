'use client'
// components/ui/ConnectButton.tsx
// Spustí Stripe Connect onboarding (Express) a přesměruje poskytovatele na Stripe.
import { useState } from 'react'
import { Loader2, Landmark } from 'lucide-react'
import { createConnectOnboardingLink } from '@/lib/actions/connect'

export default function ConnectButton({ label = 'Napojit bankovní účet' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setBusy(true)
    setError('')
    const res = await createConnectOnboardingLink()
    if (res.success) {
      window.location.href = res.url
    } else {
      setError(res.error)
      setBusy(false)
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Přesměrovávám…</> : <><Landmark className="h-4 w-4" /> {label}</>}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}