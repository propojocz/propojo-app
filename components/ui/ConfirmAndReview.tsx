'use client'
// components/ui/ConfirmAndReview.tsx
// Jeden krok pro zákazníka u stavu ceka_potvrzeni: potvrdit dokončení + rovnou
// ohodnotit. Dřív to byly dvě oddělené obrazovky (ConfirmCompletionButton zvlášť,
// ReviewForm zvlášť) — teď hvězdy, nepovinný text a jedno tlačítko „Potvrdit".
//
// Hvězdy jsou povinné (pár slov nepovinné — zákazník může dát jen hvězdy).
// Potvrzením se uvolní záloha/plná platba poskytovateli (releaseDeposit).
// Vedle je záložní cesta „něco neproběhlo v pořádku" → spor (reportDispute).

import { useState } from 'react'
import { Star, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { releaseDeposit, reportDispute } from '@/lib/actions/payout'
import { createReview } from '@/lib/actions/reviews'

interface Props {
  orderId: string
  hasDeposit: boolean
}

export default function ConfirmAndReview({ orderId, hasDeposit }: Props) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDispute, setShowDispute] = useState(false)
  const [reason, setReason] = useState('')

  const shown = hover || rating

  const handleConfirm = async () => {
    if (rating < 1) {
      setError('Vyberte prosím počet hvězd — stačí kliknout.')
      return
    }
    setBusy(true)
    setError('')

    // Nejdřív hodnocení: kdyby selhalo potvrzení, recenze aspoň nezůstane viset.
    // Chyba hodnocení ale nesmí zablokovat uvolnění peněz — proto ji jen zalogujeme.
    const rev = await createReview({ orderId, rating, comment: comment.trim() || undefined })
    if (!rev.success) {
      console.error('[ConfirmAndReview] recenze:', rev.error)
    }

    const res = await releaseDeposit(orderId)
    if (!res.success) {
      setError(res.error)
      setBusy(false)
      return
    }
    // úspěch → server revaliduje stránku, objeví se poděkování
  }

  const handleDispute = async () => {
    if (!reason.trim()) { setError('Napište prosím, v čem je problém.'); return }
    setBusy(true)
    setError('')
    const res = await reportDispute(orderId, reason)
    if (!res.success) { setError(res.error); setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* Hodnocení */}
      <div>
        <p className="mb-1 text-sm font-bold text-slate-800">Jak jste byli spokojeni?</p>
        <p className="mb-2 text-xs text-slate-500">Stačí hvězdy, pár slov je nepovinných.</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setRating(i); setError('') }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(0)}
              className="transition-transform hover:scale-110"
              aria-label={`${i} z 5 hvězd`}
            >
              <Star
                className={`h-8 w-8 ${i <= shown ? 'text-amber-400' : 'text-slate-200'}`}
                fill={i <= shown ? 'currentColor' : 'none'}
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Napište pár slov o vaší zkušenosti (nepovinné)…"
          rows={2}
          maxLength={600}
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {/* Hlavní akce: potvrdit */}
      <button
        onClick={handleConfirm}
        disabled={busy}
        className="btn-primary w-full justify-center py-3 text-base disabled:opacity-60"
      >
        {busy && !showDispute
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</>
          : <><CheckCircle2 className="h-4 w-4" /> Potvrdit a odeslat hodnocení</>}
      </button>
      {hasDeposit && (
        <p className="-mt-2 text-center text-[11px] text-slate-400">
          Potvrzením se řemeslníkovi uvolní zaplacená částka.
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
            Popište, co neproběhlo (např. řemeslník nedorazil). {hasDeposit ? 'Zálohu zatím podržíme a problém posoudí Propojo.' : 'Problém posoudí Propojo.'}
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