'use client'
// components/ui/BookingAfterPayment.tsx
// Vrstva 4, část 2: co jde dělat se zaplacenou (potvrzenou) rezervací a stav vrácení peněz.
// - poskytovatel: „Zrušit rezervaci“ do začátku termínu → zákazníkovi se automaticky vrátí celá částka;
// - zákazník: „Zrušit rezervaci“ před hranicí (§8) s vrácením peněz, jinak vysvětlení proč ne;
// - zákazník: samostatně „Odstoupit od smlouvy“ (14 dní, VOP 9.1) – peníze vrací poskytovatel;
// - obě strany: stav vrácení peněz podle Stripe („zahájeno“ ≠ „vráceno“).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw, Undo2, XCircle } from 'lucide-react'
import ProviderCancelReason from '@/components/ui/ProviderCancelReason'
import { cancelConfirmedBooking, withdrawFromBooking } from '@/lib/actions/booking'

export type RefundView = { id: string; amountKc: number; status: string; createdText: string }

const REFUND_TEXT: Record<string, string> = {
  requested: 'Vrácení částky bylo zahájeno.',
  pending: 'Vrácení částky bylo zahájeno.',
  requires_action: 'Vrácení částky bylo zahájeno.',
  succeeded: 'Částka byla vrácena. Banka ji může připsat až za několik pracovních dnů.',
  failed: 'Vrácení se nezdařilo. Povinnost vrátit částku má dál poskytovatel.',
  canceled: 'Vrácení bylo zrušeno.',
}

export default function BookingAfterPayment({
  orderId,
  isProvider,
  amountKc,
  offerKind,
  providerCanCancel,
  customerCancel,
  withdrawal,
  refunds,
}: {
  orderId: string
  isProvider: boolean
  amountKc: number
  offerKind: string | null
  /** Poskytovatel smí zrušit (potvrzená, termín nezačal) */
  providerCanCancel: boolean
  /** Zákazník: null = rezervace není potvrzená; auto = zrušení s vrácením; none = vysvětlení */
  customerCancel: { mode: 'auto' } | { mode: 'none'; text: string } | null
  withdrawal: { mode: 'available'; untilText: string } | { mode: 'done'; atText: string } | null
  refunds: RefundView[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wOpen, setWOpen] = useState(false)
  const [wNote, setWNote] = useState('')
  const castka = `${amountKc.toLocaleString('cs-CZ')} Kč`

  const cancelAsCustomer = async () => {
    if (!confirm(`Opravdu rezervaci zrušit? Vrátí se vám celá zaplacená částka ${castka}.`)) return
    setBusy(true); setError('')
    const res = await cancelConfirmedBooking(orderId)
    setBusy(false)
    if (!res.success) setError(res.error)
    else router.refresh()
  }

  const withdraw = async () => {
    setBusy(true); setError('')
    const res = await withdrawFromBooking(orderId, wNote)
    setBusy(false)
    if (!res.success) setError(res.error)
    else { setWOpen(false); router.refresh() }
  }

  // Stav po odstoupení ukazuje BookingStateBadge nahoře – tady jen akce a vrácení peněz
  const hasActions = (isProvider && providerCanCancel)
    || (!isProvider && (customerCancel !== null || withdrawal?.mode === 'available'))
  if (!hasActions && refunds.length === 0) return null

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {refunds.length > 0 && (
        <div>
          <p className="text-sm font-black text-slate-900">Vrácení peněz</p>
          <ul className="mt-1.5 space-y-1.5">
            {refunds.map((r) => (
              <li key={r.id} className={`rounded-xl border px-3 py-2 text-sm ${r.status === 'succeeded' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : r.status === 'failed' || r.status === 'canceled' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                <strong>{r.amountKc.toLocaleString('cs-CZ')} Kč</strong> · {REFUND_TEXT[r.status] ?? r.status}
                <span className="block text-xs opacity-70">Zadáno {r.createdText}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isProvider && providerCanCancel && (
        <ProviderCancelReason
          buttonLabel="Zrušit rezervaci"
          submitLabel="Zrušit a vrátit zákazníkovi peníze"
          intro={`Zákazníkovi se automaticky vrátí celá zaplacená částka ${castka} z vašeho Stripe účtu (podle pokynu, který jste odsouhlasili). Provize Propojo a poplatek Stripe se nevracejí. Zrušení z vaší strany se započítává do důvěryhodnosti účtu.`}
          onSubmit={async (reason) => {
            const res = await cancelConfirmedBooking(orderId, reason)
            if (res.success) router.refresh()
            return res
          }}
        />
      )}

      {!isProvider && customerCancel?.mode === 'auto' && (
        <div>
          <button
            type="button"
            onClick={cancelAsCustomer}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Zrušit rezervaci
          </button>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            {offerKind === 'B'
              ? `Do začátku okna příjezdu (a dokud poskytovatel není na místě) můžete výjezd zrušit – vrátí se vám celá částka ${castka}.`
              : offerKind === 'C'
                ? `Dokud vám poskytovatel nepředá Závaznou nabídku a nezačal termín, můžete rezervaci zrušit – vrátí se vám celá částka ${castka}.`
                : `Do začátku termínu můžete rezervaci zrušit – vrátí se vám celá částka ${castka}.`}
          </p>
        </div>
      )}

      {!isProvider && customerCancel?.mode === 'none' && (
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          {customerCancel.text} Domluvte se s poskytovatelem ve zprávách.
        </p>
      )}

      {/* Zákazník: odstoupení od smlouvy – samostatná cesta vedle zrušení (VOP 9.1) */}
      {!isProvider && withdrawal?.mode === 'available' && !wOpen && (
        <button
          type="button"
          onClick={() => { setWOpen(true); setError('') }}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          <Undo2 className="h-3.5 w-3.5" /> Odstoupit od smlouvy (do {withdrawal.untilText})
        </button>
      )}
      {!isProvider && withdrawal?.mode === 'available' && wOpen && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-900">Odstoupení od smlouvy</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Ze zákona můžete od rezervace odstoupit bez udání důvodu do {withdrawal.untilText}. Potvrzení s datem a časem vám pošleme
            e-mailem. Zaplacenou částku {castka} vám pak vrací poskytovatel, nejpozději do 14 dnů.
            {offerKind === 'B' ? ' Pokud výjezd už proběhl, právo odstoupit zaniklo – o provedení před uplynutím lhůty jste požádali ve shrnutí.' : ''}
          </p>
          {customerCancel?.mode === 'auto' && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
              Tip: rezervaci teď můžete ještě <strong>zrušit</strong> (tlačítko výše) – peníze se vám pak vrátí automaticky a hned.
            </p>
          )}
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Poznámka <span className="font-normal text-slate-400">(nepovinné)</span>
          </label>
          <textarea
            value={wNote}
            onChange={(e) => setWNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setWOpen(false)} disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              Zpět
            </button>
            <button type="button" onClick={withdraw} disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Odstoupit od smlouvy
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
