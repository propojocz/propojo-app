'use client'
// components/ui/ClaimHandoffButton.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { claimSharedHandoff } from '@/lib/actions/handoffs'

export default function ClaimHandoffButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleClaim = async () => {
    setBusy(true); setErr(null)
    const res = await claimSharedHandoff(token)
    setBusy(false)
    if (res.success) router.push('/dashboard/objednavky')
    else setErr(res.error)
  }

  return (
    <div>
      <button
        onClick={handleClaim}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Přebírám…</> : <><Check className="h-4 w-4" /> Vzít tuhle zakázku</>}
      </button>
      {err && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  )
}