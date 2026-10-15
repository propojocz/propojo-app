'use client'
// components/ui/BookingAfterPayment.tsx
// Vrstva 4, část 2: co jde dělat se zaplacenou (potvrzenou) rezervací a stav vrácení peněz.
// - poskytovatel: „Zrušit rezervaci“ do začátku termínu → zákazníkovi se automaticky vrátí celá částka;
// - zákazník: „Zrušit rezervaci“ před hranicí (§8) s vrácením peněz, jinak vysvětlení proč ne;
// - zákazník: samostatně „Odstoupit od smlouvy“ (14 dní, VOP 9.1) – peníze vrací poskytovatel;
// - obě strany: stav vrácení peněz podle Stripe („zahájeno“ ≠ „vráceno“).
// Část 3: poskytovatel „Původní termín nemohu dodržet“ + nový návrh, zákazník přijme / odmítne;
// poskytovatel „Vrátit peníze zákazníkovi“ (např. po odstoupení) a co ho stojí zrušení.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, Loader2, RotateCcw, Undo2, Wallet, XCircle } from 'lucide-react'
import ProviderCancelReason from '@/components/ui/ProviderCancelReason'
import {
  answerReschedule,
  cancelConfirmedBooking,
  declareCannotKeep,
  refundByProvider,
  withdrawFromBooking,
} from '@/lib/actions/booking'

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
  reschedule = null,
  providerRefundMaxKc = 0,
  cancelCost = null,
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
  /** „Nemohu dodržet termín“: otevřený návrh, nebo jestli ho poskytovatel smí vytvořit */
  reschedule?: { open: { proposedText: string; expiresText: string } | null; canDeclare: boolean; durationMin: number } | null
  /** Poskytovatel: kolik ještě jde vrátit (0 = nic) */
  providerRefundMaxKc?: number
  /** Poskytovatel: co ho stojí zrušení (provize + poplatek Stripe se nevracejí) */
  cancelCost?: { commissionKc: number; stripeFeeKc: number | null } | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wOpen, setWOpen] = useState(false)
  const [wNote, setWNote] = useState('')
  const castka = `${amountKc.toLocaleString('cs-CZ')} Kč`
  const [rOpen, setROpen] = useState(false)
  const [rStart, setRStart] = useState('')
  const rDur = String(reschedule?.durationMin || 60)
  const [rNote, setRNote] = useState('')
  const [refOpen, setRefOpen] = useState(false)
  const [refAmount, setRefAmount] = useState(String(providerRefundMaxKc || ''))
  const costText = cancelCost
    ? `provize Propoja ${cancelCost.commissionKc.toLocaleString('cs-CZ')} Kč${cancelCost.stripeFeeKc != null ? ` a poplatek Stripe ${cancelCost.stripeFeeKc.toLocaleString('cs-CZ')} Kč` : ' a poplatek Stripe'}`
    : null

  const run = async (fn: () => Promise<{ success: true } | { success: false; error: string }>, after?: () => void) => {
    setBusy(true); setError('')
    const res = await fn()
    setBusy(false)
    if (!res.success) setError(res.error)
    else { after?.(); router.refresh() }
  }

  const declare = () => {
    if (!rStart) { setError('Vyberte nový termín.'); return }
    const start = new Date(rStart)
    const end = new Date(start.getTime() + Math.max(15, Number(rDur) || 60) * 60_000)
    void run(() => declareCannotKeep(orderId, start.toISOString(), end.toISOString(), rNote), () => setROpen(false))
  }

  const answer = (accept: boolean) => {
    if (!accept && !confirm(`Opravdu nový termín odmítnout? Rezervace se zruší a vrátí se vám celá částka ${castka}.`)) return
    void run(() => answerReschedule(orderId, accept))
  }

  const refund = () => {
    const kcValue = Number(String(refAmount).replace(',', '.'))
    if (!(kcValue > 0)) { setError('Zadejte částku k vrácení.'); return }
    if (!confirm(`Vrátit zákazníkovi ${kcValue.toLocaleString('cs-CZ')} Kč z vašeho Stripe účtu?`)) return
    void run(() => refundByProvider(orderId, kcValue), () => setRefOpen(false))
  }

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
  const hasActions = (isProvider && (providerCanCancel || providerRefundMaxKc > 0 || !!reschedule?.canDeclare || !!reschedule?.open))
    || (!isProvider && (customerCancel !== null || withdrawal?.mode === 'available' || !!reschedule?.open))
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
          {isProvider && costText && (
            <p className="mt-1.5 text-xs text-slate-500">Při vrácení se nevrací {costText} – ty nesete vy.</p>
          )}
        </div>
      )}

      {/* „Nemohu dodržet termín“ – otevřený návrh */}
      {reschedule?.open && !isProvider && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-black text-amber-950"><CalendarClock className="h-4 w-4" /> Poskytovatel nemůže dodržet původní termín</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            Navrhuje nový termín <strong>{reschedule.open.proposedText}</strong>. Odpovězte do <strong>{reschedule.open.expiresText}</strong> –
            když nový termín odmítnete nebo nezareagujete, rezervace se zruší a vrátí se vám celá částka {castka}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => answer(true)} disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Přijmout nový termín
            </button>
            <button type="button" onClick={() => answer(false)} disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
              <XCircle className="h-4 w-4" /> Odmítnout a vrátit peníze
            </button>
          </div>
        </div>
      )}
      {reschedule?.open && isProvider && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
          Navrhli jste nový termín <strong>{reschedule.open.proposedText}</strong>. Zákazník odpoví do {reschedule.open.expiresText}.
          Když ho odmítne nebo nezareaguje, rezervace se zruší a zákazníkovi se vrátí celá částka {castka}.
        </p>
      )}

      {/* Poskytovatel: „Původní termín nemohu dodržet“ */}
      {isProvider && reschedule?.canDeclare && !reschedule.open && !rOpen && (
        <button type="button" onClick={() => { setROpen(true); setError('') }}
          className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50">
          <CalendarClock className="h-4 w-4" /> Původní termín nemohu dodržet
        </button>
      )}
      {isProvider && reschedule?.canDeclare && !reschedule.open && rOpen && (
        <div className="rounded-xl border border-amber-300 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">Původní termín nemohu dodržet</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Navrhněte zákazníkovi nový termín. Když ho přijme, rezervace pokračuje. Když ho odmítne nebo do 24 hodin
            (nejpozději do začátku původního termínu) nezareaguje, rezervace se zruší a zákazníkovi se z vašeho Stripe účtu
            vrátí celá částka {castka}. Nepřijatý termín se započítává do důvěryhodnosti účtu.
          </p>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Nový termín – začátek
            <input type="datetime-local" value={rStart} onChange={(e) => setRStart(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 sm:w-72" />
          </label>
          <p className="mt-1 text-xs text-slate-400">
            {offerKind === 'B'
              ? `Okno příjezdu zůstane stejně dlouhé jako původní (${rDur} min).`
              : `Délka zůstane stejná jako u původního termínu (${rDur} min).`}
          </p>
          <label className="mt-2 block text-xs font-semibold text-slate-600">
            Zpráva zákazníkovi <span className="font-normal text-slate-400">(nepovinné)</span>
            <textarea value={rNote} onChange={(e) => setRNote(e.target.value)} maxLength={500} rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setROpen(false)} disabled={busy}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Zpět</button>
            <button type="button" onClick={declare} disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Poslat nový termín zákazníkovi
            </button>
          </div>
        </div>
      )}

      {/* Poskytovatel: vrácení peněz vlastním tlačítkem (bez Stripe Dashboardu) */}
      {isProvider && providerRefundMaxKc > 0 && !refOpen && (
        <button type="button" onClick={() => { setRefOpen(true); setError(''); setRefAmount(String(providerRefundMaxKc)) }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Wallet className="h-4 w-4" /> Vrátit peníze zákazníkovi
        </button>
      )}
      {isProvider && providerRefundMaxKc > 0 && refOpen && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-900">Vrátit peníze zákazníkovi</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Peníze se vrátí z vašeho Stripe účtu na kartu zákazníka. Vrátit jde nejvýš {providerRefundMaxKc.toLocaleString('cs-CZ')} Kč.
            {costText ? ` Při vrácení se nevrací ${costText}.` : ''}
          </p>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Částka (Kč)
            <input type="number" min={1} max={providerRefundMaxKc} step="1" value={refAmount} onChange={(e) => setRefAmount(e.target.value)}
              className="mt-1 w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRefOpen(false)} disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Zpět</button>
            <button type="button" onClick={refund} disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Vrátit peníze
            </button>
          </div>
        </div>
      )}

      {isProvider && providerCanCancel && (
        <ProviderCancelReason
          buttonLabel="Zrušit rezervaci"
          submitLabel="Zrušit a vrátit zákazníkovi peníze"
          intro={`Zákazníkovi se automaticky vrátí celá zaplacená částka ${castka} z vašeho Stripe účtu (podle pokynu, který jste odsouhlasili). Nevrací se ${costText ?? 'provize Propoja a poplatek Stripe'} – zrušení vás tedy bude stát tuto částku. Zrušení z vaší strany se započítává do důvěryhodnosti účtu.`}
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
