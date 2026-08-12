'use client'
// components/ui/OrderStatusButton.tsx
// Akce poskytovatele na detailu objednávky.
//
// Tok je zkrácený: zaplacením vzniká potvrzený termín (prijato), takže mezikrok
// „Zahájit / v procesu" nic nepřidával a byl odstraněn. Po zaplacení poskytovatel
// rovnou uzavírá zakázku tlačítkem „Potvrdit pro uvolnění výplaty" → ceka_potvrzeni,
// čímž se u zákazníka objeví potvrzení + hodnocení a spustí se výplata.

import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Wallet } from 'lucide-react'
import { updateOrderStatus } from '@/lib/actions/orders'

const NEXT_STATUS: Record<string, { status: string; label: string; icon: any; color: string }[]> = {
  cekajici: [
    { status: 'prijato', label: 'Přijmout', icon: CheckCircle2, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
    { status: 'zruseno', label: 'Odmítnout', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50' },
  ],
  // 'prijato' řešíme níž samostatně (hlavní výzva k uzavření), ne v téhle řadě.
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

  const handleAction = async (status: string) => {
    setErr('')
    setLoading(status)
    const res = await updateOrderStatus(orderId, status as any)
    if (!res.success) setErr(res.error ?? 'Nepodařilo se změnit stav.')
    setLoading(null)
  }

  // Ve stavu "čeká na potvrzení" poskytovatel jen čeká na zákazníka.
  if (currentStatus === 'ceka_potvrzeni') {
    return <p className="text-sm text-slate-500">Čeká se na potvrzení od zákazníka — jakmile potvrdí, převedeme vám platbu.</p>
  }

  // ── HLAVNÍ VÝZVA K UZAVŘENÍ (po zaplacení) ──────────────────
  // Zaplacená a přijatá zakázka: poskytovatel po dokončení práce uzavře.
  // Výrazná zelená výzva, ať je jasné, že tohle spouští výplatu.
  if (currentStatus === 'prijato') {
    const waitingForDeposit = depositStatus === 'pending'

    if (waitingForDeposit) {
      // Stav „čeká se na úhradu" hlásí už pruh nad tlačítky (OrderDetailClient),
      // tady bychom ho psali podruhé. Zobrazíme jen to, co má poskytovatel udělat.
      return (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
          Zakázku půjde uzavřít, jakmile zákazník zaplatí. Do té doby není z čeho vyplatit.
        </p>
      )
    }

    return (
      <div className="w-full">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
          <p className="mb-0.5 text-sm font-bold text-slate-900">Až budete s prací hotovi</p>
          <p className="mb-3 text-xs leading-relaxed text-slate-600">
            Klepnutím uzavřete zakázku a spustíte výplatu. Zákazník pak potvrdí a ohodnotí.
          </p>
          <button
            onClick={() => handleAction('ceka_potvrzeni')}
            disabled={!!loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading === 'ceka_potvrzeni'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</>
              : <><Wallet className="h-4 w-4" /> Potvrdit pro uvolnění výplaty</>}
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
            Pošleme peníze na váš účet. Když zákazník potvrdí, převod se spustí hned — jinak nejpozději do 7 dnů.
          </p>
        </div>

        {/* Zrušení zůstává dostupné i tady, ale nenápadně. */}
        <button
          onClick={() => handleAction('zruseno')}
          disabled={!!loading}
          className="mt-2 flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {loading === 'zruseno' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Zrušit zakázku
        </button>
        {depositStatus === 'paid' && (
          <p className="mt-1 text-xs text-slate-400">Při zrušení se zákazníkovi vrátí zaplacená částka.</p>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
    )
  }

  // ── Ostatní stavy (cekajici): přijmout / odmítnout ──────────
  const actions = NEXT_STATUS[currentStatus] ?? []
  if (actions.length === 0) return null

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.status}
            onClick={() => handleAction(action.status)}
            disabled={!!loading}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${action.color}`}
          >
            {loading === action.status
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <action.icon className="h-4 w-4" />}
            {action.label}
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}