'use client'
// components/ui/ManageSubscriptionButton.tsx
// Otevře Stripe Customer Portal (správa/zrušení předplatného, změna karty, faktury).
import { useState } from 'react'
import { Loader2, Settings } from 'lucide-react'
import { createPortalSession } from '@/lib/actions/subscription'

export default function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setBusy(true)
    setError('')
    const res = await createPortalSession()
    if (res.success) {
      window.location.href = res.url
    } else {
      setError(res.error)
      setBusy(false)
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={busy} className="btn-secondary w-full justify-center disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Otevírám…</> : <><Settings className="h-4 w-4" /> Spravovat předplatné</>}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}