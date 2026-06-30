'use client'
// app/admin/spory/DisputeActions.tsx
// Admin rozhodne spor: uvolnit poskytovateli, vrátit zákazníkovi, nebo rozdělit 50:50.
import { useState } from 'react'
import { Loader2, ArrowRight, RotateCcw, Split } from 'lucide-react'
import { resolveDispute } from '@/lib/actions/payout'

export default function DisputeActions({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState<'provider' | 'customer' | 'split' | null>(null)
  const [err, setErr] = useState('')

  const decide = async (decision: 'provider' | 'customer' | 'split') => {
    const label =
      decision === 'provider' ? 'uvolnit zálohu poskytovateli'
      : decision === 'customer' ? 'vrátit zálohu zákazníkovi'
      : 'rozdělit zálohu napůl (polovina zákazníkovi, zbytek poskytovateli)'
    if (!confirm(`Opravdu ${label}? Tuto akci nelze vrátit.`)) return
    setErr('')
    setLoading(decision)
    const res = await resolveDispute(orderId, decision)
    if (!res.success) {
      setErr(res.error)
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => decide('provider')}
          disabled={!!loading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading === 'provider' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Uvolnit poskytovateli
        </button>
        <button
          onClick={() => decide('customer')}
          disabled={!!loading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {loading === 'customer' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Vrátit zákazníkovi
        </button>
      </div>
      <button
        onClick={() => decide('split')}
        disabled={!!loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
      >
        {loading === 'split' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />}
        Rozdělit 50:50
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}