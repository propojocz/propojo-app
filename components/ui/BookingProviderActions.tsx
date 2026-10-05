'use client'
// components/ui/BookingProviderActions.tsx
// Model v2: poskytovatel potvrdí nebo odmítne předautorizovanou rezervaci.
// Potvrzení = stržení platby (capture); teprve pak je rezervace potvrzená.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { confirmBooking, declineBooking } from '@/lib/actions/booking'
import ProviderCancelReason from '@/components/ui/ProviderCancelReason'
import { terminDlouze } from '@/lib/format'

export default function BookingProviderActions({
  orderId,
  amountKc,
  feeKc,
  deadlineAt,
  offerKind,
  quoteFeeDeductible = false,
}: {
  orderId: string
  amountKc: number
  /** Provize Propoja (application fee) v Kč */
  feeKc: number | null
  deadlineAt: string | null
  offerKind: string | null
  /** Výjezd: zákazníkovi jste slíbili odečíst Cenu výjezdu z ceny zakázky (snapshot při platbě) */
  quoteFeeDeductible?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const castka = `${amountKc.toLocaleString('cs-CZ')} Kč`
  const jeVyjezd = offerKind === 'B'
  const nazevPlatby = jeVyjezd ? 'Cenu výjezdu' : 'Rezervační poplatek'

  const confirm = async () => {
    setBusy(true); setError('')
    const res = await confirmBooking(orderId)
    if (!res.success) setError(res.error)
    setBusy(false)
    router.refresh()
  }

  const decline = async (reason: string) => {
    const res = await declineBooking(orderId, reason)
    if (res.success) router.refresh()
    return res
  }

  return (
    <div className="rounded-2xl border-2 border-orange-300 bg-orange-50/60 p-5">
      <h2 className="font-black text-slate-900">Nová rezervace čeká na vaše potvrzení</h2>
      {deadlineAt && (
        <p className="mt-0.5 text-sm font-semibold text-orange-700">Potvrďte ji nejpozději {terminDlouze(deadlineAt)}.</p>
      )}

      <p className="mt-2 text-sm text-slate-700">
        Zákazník už má na kartě zablokováno <strong>{castka}</strong> ({nazevPlatby.toLowerCase()}). Zatím se nic nestrhlo.
      </p>

      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        <li>
          <strong className="text-slate-800">Potvrdíte</strong> → {castka} vám přijde na Stripe účet a rezervace je závazná.
        </li>
        <li>
          <strong className="text-slate-800">Odmítnete</strong> → zákazníkovi se blokace uvolní a nic nezaplatí.
        </li>
        <li>
          <strong className="text-slate-800">Nepotvrdíte včas</strong> → rezervace propadne, zákazníkovi se blokace uvolní a zakázku nedostanete.
        </li>
      </ul>

      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji…</>
          : <><CheckCircle2 className="h-5 w-5" /> Potvrdit rezervaci</>}
      </button>
      <p className="mt-1.5 text-center text-xs leading-relaxed text-slate-500">
        {feeKc != null ? `Z ${castka} si Propojo strhne provizi ${feeKc.toLocaleString('cs-CZ')} Kč, poplatek Stripe podle vašeho účtu. ` : ''}
        {jeVyjezd
          ? (quoteFeeDeductible
              ? 'U této nabídky jste uvedli, že Cenu výjezdu odečtete z ceny zakázky, když zákazník přijme vaši nabídku – odečíst ji pak musíte.'
              : 'Cena výjezdu se do ceny následné zakázky nezapočítává.')
          : 'Když se se zákazníkem domluvíte na službě, poplatek mu odečtete z ceny.'}
      </p>

      <ProviderCancelReason
        buttonLabel="Odmítnout rezervaci"
        submitLabel="Odmítnout a dát vědět zákazníkovi"
        intro="Zákazníkovi se uvolní blokace na kartě a nic se mu nestrhne."
        onSubmit={decline}
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
