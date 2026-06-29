'use client'
// components/ui/ConfirmCompletionButton.tsx
// Zákazník potvrdí splnění → uvolní se záloha poskytovateli (releaseDeposit).
import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { releaseDeposit } from '@/lib/actions/payout'

export default function ConfirmCompletionButton({ orderId, hasDeposit }: { orderId: string; hasDeposit: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setBusy(true)
    setError('')
    const res = await releaseDeposit(orderId)
    if (!res.success) {
      setError(res.error)
      setBusy(false)
    }
    // při úspěchu se stránka revaliduje serverem
  }

  return (
    <div>
      <button onClick={handleClick} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</> : <><CheckCircle2 className="h-4 w-4" /> Potvrdit a {hasDeposit ? 'uvolnit zálohu' : 'dokončit'}</>}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}