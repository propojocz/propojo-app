'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, PlayCircle } from 'lucide-react'
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

export default function OrderStatusButton({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const actions = NEXT_STATUS[currentStatus] ?? []
  if (actions.length === 0) return null

  const handleAction = async (status: string) => {
    setLoading(status)
    await updateOrderStatus(orderId, status as any)
    setLoading(null)
  }

  return (
    <>
      {actions.map((action) => (
        <button
          key={action.status}
          onClick={() => handleAction(action.status)}
          disabled={!!loading}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${action.color}`}
        >
          {loading === action.status ? <Loader2 className="h-4 w-4 animate-spin" /> : <action.icon className="h-4 w-4" />}
          {action.label}
        </button>
      ))}
    </>
  )
}
