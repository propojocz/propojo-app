'use client'
// components/ui/ConfirmCompletionButton.tsx
// Zákazník u stavu ceka_potvrzeni: buď POTVRDÍ, nebo NAHLÁSÍ PROBLÉM (spor).
//
// TEXTY SE LIŠÍ podle toho, co si zákazník objednal. U výrobku nedává smysl
// mluvit o „uvolnění zálohy" (mohl zaplatit celou cenu) ani o „řemeslníkovi,
// co nedorazil" — proto se popisky předávají zvenčí.
import { useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { releaseDeposit, reportDispute } from '@/lib/actions/payout'

export default function ConfirmCompletionButton({
  orderId,
  hasDeposit,
  confirmLabel,
  disputeHint,
  heldAmount = null,
}: {
  orderId: string
  hasDeposit: boolean
  /** Např. „Potvrdit převzetí" u výrobku. Bez něj se použije text pro službu. */
  confirmLabel?: string
  /** Nápověda v hlášení problému — u výrobku se nemluví o řemeslníkovi. */
  disputeHint?: string
  /** Kolik peněz se potvrzením uvolní. Zákazník má vidět částku, ne pojem „záloha". */
  heldAmount?: number | null
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDispute, setShowDispute] = useState(false)
  const [reason, setReason] = useState('')

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    const res = await releaseDeposit(orderId)
    if (!res.success) {
      setError(res.error)
      setBusy(false)
    }
    // úspěch → stránka se revaliduje serverem
  }

  const handleDispute = async () => {
    if (!reason.trim()) {
      setError('Napište prosím, v čem je problém.')
      return
    }
    setBusy(true)
    setError('')
    const res = await reportDispute(orderId, reason)
    if (!res.success) {
      setError(res.error)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Hlavní akce: potvrdit */}
      <button onClick={handleConfirm} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy && !showDispute
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</>
          : <><CheckCircle2 className="h-4 w-4" /> {confirmLabel ?? `Potvrdit a ${hasDeposit ? 'uvolnit zálohu' : 'dokončit'}`}</>}
      </button>
      {hasDeposit && heldAmount != null && heldAmount > 0 && (
        <p className="-mt-1 text-center text-xs text-slate-500">
          Potvrzením se poskytovateli uvolní <strong className="text-slate-700">{heldAmount.toLocaleString('cs-CZ')} Kč</strong>.
        </p>
      )}

      {/* Sekundární: nahlásit problém */}
      {!showDispute ? (
        <button
          onClick={() => { setShowDispute(true); setError('') }}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <AlertTriangle className="h-4 w-4" /> Něco neproběhlo v pořádku
        </button>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" /> Nahlásit problém</p>
            <button onClick={() => { setShowDispute(false); setReason(''); setError('') }} className="text-amber-700 hover:text-amber-900"><X className="h-4 w-4" /></button>
          </div>
          <p className="mb-3 text-xs text-amber-800">
            {disputeHint ?? 'Popište, co neproběhlo (např. řemeslník nedorazil).'}{' '}
            Platbu zatím podržíme a problém posoudí Propojo.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="V čem je problém?"
            className="mb-3 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          <button
            onClick={handleDispute}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Odeslat nahlášení
          </button>
        </div>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}