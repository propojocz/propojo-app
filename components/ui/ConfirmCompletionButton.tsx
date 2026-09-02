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
import GalleryUpload from '@/components/ui/GalleryUpload'

// Důvody problému. U výrobku a u služby jsou jiné — „dort byl poškozený"
// a „řemeslník nedorazil" spolu nemají nic společného.
const DUVODY_VYROBEK = [
  { id: 'nepredano', label: 'Objednávku jsem nepřevzal' },
  { id: 'poskozeno', label: 'Výrobek je poškozený' },
  { id: 'neodpovida', label: 'Neodpovídá objednávce' },
  { id: 'chybi', label: 'Něco v objednávce chybí' },
  { id: 'jine', label: 'Jiný problém' },
]

const DUVODY_SLUZBA = [
  { id: 'nedorazil', label: 'Poskytovatel nedorazil' },
  { id: 'neodpovida', label: 'Práce neodpovídá domluvě' },
  { id: 'jine', label: 'Jiný problém' },
]

// U těchhle důvodů má fotka největší cenu — bez ní se to dohaduje slovo
// proti slovu. Povinná ale není, ať to nikoho neblokuje.
const FOTKA_DOPORUCENA = ['poskozeno', 'neodpovida', 'chybi']

export default function ConfirmCompletionButton({
  orderId,
  hasDeposit,
  confirmLabel,
  heldAmount = null,
  isProduct = false,
}: {
  orderId: string
  hasDeposit: boolean
  /** Např. „Potvrdit převzetí" u výrobku. Bez něj se použije text pro službu. */
  confirmLabel?: string
  /** Kolik peněz se potvrzením uvolní. Zákazník má vidět částku, ne pojem „záloha". */
  heldAmount?: number | null
  /** Výrobek má jiné důvody problému než služba. */
  isProduct?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDispute, setShowDispute] = useState(false)
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState<string>('')
  const [photos, setPhotos] = useState<string[]>([])

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
    if (!category) {
      setError('Vyberte prosím, o jaký problém jde.')
      return
    }
    if (!reason.trim()) {
      setError('Napište prosím, v čem je problém.')
      return
    }
    setBusy(true)
    setError('')
    const res = await reportDispute(orderId, reason, { category, photos })
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
            Vyberte, o co jde, a krátce to popište. Platbu zatím podržíme a problém posoudí Propojo.
          </p>

          {/* Kategorie problému */}
          <div className="mb-3 space-y-1.5">
            {(isProduct ? DUVODY_VYROBEK : DUVODY_SLUZBA).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setCategory(d.id); setError('') }}
                className={`flex w-full items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-2 text-left text-sm font-semibold transition ${
                  category === d.id
                    ? 'border-amber-500 bg-amber-100 text-amber-900'
                    : 'border-amber-200 bg-white text-slate-700 hover:border-amber-400'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  category === d.id ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                }`}>
                  {category === d.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {d.label}
              </button>
            ))}
          </div>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="V čem je problém?"
            className="mb-3 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          {/* Fotky jako důkaz */}
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-amber-900">
              Fotky {FOTKA_DOPORUCENA.includes(category)
                ? <span className="font-normal text-amber-700">— u tohohle problému hodně pomůžou</span>
                : <span className="font-normal text-amber-700">(nepovinné)</span>}
            </p>
            <GalleryUpload value={photos} onChange={setPhotos} />
          </div>

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