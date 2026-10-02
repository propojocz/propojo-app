'use client'
// components/ui/ProviderCancelReason.tsx
// Poskytovatel ruší / odmítá objednávku a může zákazníkovi napsat proč (nepovinné).
// Zpráva se uloží do chatu objednávky a objeví se i v notifikaci zákazníkovi.

import { useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'

export default function ProviderCancelReason({
  buttonLabel,
  submitLabel,
  intro,
  onSubmit,
}: {
  /** Text tlačítka, které formulář otevře („Odmítnout rezervaci“) */
  buttonLabel: string
  /** Text potvrzovacího tlačítka („Odmítnout a dát vědět zákazníkovi“) */
  submitLabel: string
  /** Krátké vysvětlení, co se stane s penězi */
  intro: string
  onSubmit: (reason: string) => Promise<{ success: true } | { success: false; error: string }>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setError('') }}
        className="mt-3 flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
      >
        <XCircle className="h-4 w-4" /> {buttonLabel}
      </button>
    )
  }

  const submit = async () => {
    setBusy(true); setError('')
    const res = await onSubmit(reason)
    setBusy(false)
    if (!res.success) setError(res.error)
  }

  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-white p-4">
      <p className="text-sm font-bold text-slate-900">{buttonLabel}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{intro}</p>
      <label className="mt-3 block text-xs font-semibold text-slate-600">
        Zpráva zákazníkovi <span className="font-normal text-slate-400">(nepovinné)</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Například: V tomto termínu už bohužel nestihnu přijet, napište mi prosím, kdy se vám hodí jindy."
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-red-300"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          Zpět
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
