'use client'
// components/ui/BookingProviderActions.tsx
// Model v2: poskytovatel potvrdí nebo odmítne předautorizovanou rezervaci.
// Potvrzení = stržení platby (capture); teprve pak je rezervace potvrzená.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { confirmBooking, declineBooking } from '@/lib/actions/booking'
import ProviderCancelReason from '@/components/ui/ProviderCancelReason'
import { datumCas } from '@/lib/format'

export default function BookingProviderActions({
  orderId,
  amountKc,
  deadlineAt,
  paymentLabel,
}: {
  orderId: string
  amountKc: number
  deadlineAt: string | null
  /** „Rezervační poplatek“ / „Cena výjezdu“ */
  paymentLabel: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<'confirm' | 'decline' | null>(null)
  const [error, setError] = useState('')
  const castka = `${amountKc.toLocaleString('cs-CZ')} Kč`

  const confirm = async () => {
    setBusy('confirm'); setError('')
    const res = await confirmBooking(orderId)
    if (!res.success) setError(res.error)
    setBusy(null)
    router.refresh()
  }

  const decline = async (reason: string) => {
    const res = await declineBooking(orderId, reason)
    if (res.success) router.refresh()
    return res
  }

  return (
    <div className="rounded-2xl border-2 border-orange-300 bg-orange-50/60 p-5">
      <h2 className="font-black text-slate-900">
        Potvrďte rezervaci{deadlineAt ? ` do ${datumCas(deadlineAt)}` : ''}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Zákazník má na kartě předautorizovanou částku <strong>{castka}</strong> ({paymentLabel}). Potvrzením se částka
        strhne a rezervace je závazná. Pokud nepotvrdíte včas, blokace se uvolní sama.
      </p>

      <button
        type="button"
        onClick={confirm}
        disabled={busy !== null}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {busy === 'confirm'
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Potvrzuji a strhávám platbu…</>
          : <><CheckCircle2 className="h-5 w-5" /> Potvrdit rezervaci</>}
      </button>
      <p className="mt-1.5 text-center text-xs text-slate-500">
        Strhne se {castka}, peníze půjdou na váš Stripe účet.
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
