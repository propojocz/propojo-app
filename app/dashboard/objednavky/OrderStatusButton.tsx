'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, PlayCircle, Lock } from 'lucide-react'
import { updateOrderStatus } from '@/lib/actions/orders'

const NEXT_STATUS: Record<string, { status: string; label: string; icon: any; color: string }[]> = {
  cekajici: [
    { status: 'prijato', label: 'Přijmout', icon: CheckCircle2, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
    { status: 'zruseno', label: 'Odmítnout', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50' },
  ],
  prijato: [
    { status: 'v_procesu', label: 'Zahájit', icon: PlayCircle, color: 'text-indigo-600 border-indigo-200 hover:bg-indigo-50' },
    { status: 'zruseno', label: 'Zrušit', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50' },
  ],
  v_procesu: [
    { status: 'dokonceno', label: 'Dokončit', icon: CheckCircle2, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
  ],
}

export default function OrderStatusButton({
  orderId,
  currentStatus,
  depositStatus = null,
}: {
  orderId: string
  currentStatus: string
  depositStatus?: string | null
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const actions = NEXT_STATUS[currentStatus] ?? []
  if (actions.length === 0) return null

  // "Zahájit" (prijato → v_procesu) jen když není záloha ve stavu 'pending'.
  const waitingForDeposit = depositStatus === 'pending'

  const handleAction = async (status: string) => {
    setErr('')
    setLoading(status)
    const res = await updateOrderStatus(orderId, status as any)
    if (!res.success) setErr(res.error ?? 'Nepodařilo se změnit stav.')
    setLoading(null)
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const lockedStart = action.status === 'v_procesu' && waitingForDeposit
          return (
            <button
              key={action.status}
              onClick={() => !lockedStart && handleAction(action.status)}
              disabled={!!loading || lockedStart}
              title={lockedStart ? 'Čeká se na úhradu zálohy zákazníkem' : undefined}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${lockedStart ? 'cursor-not-allowed border-slate-200 text-slate-400' : action.color}`}
            >
              {loading === action.status
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : lockedStart ? <Lock className="h-4 w-4" /> : <action.icon className="h-4 w-4" />}
              {action.label}
            </button>
          )
        })}
      </div>
      {waitingForDeposit && (
        <p className="mt-2 text-xs text-slate-400">Práci půjde zahájit, jakmile zákazník uhradí zálohu.</p>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}