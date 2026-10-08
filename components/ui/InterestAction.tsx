'use client'
// components/ui/InterestAction.tsx
// Jedno místo pro akci „Mám zájem" + výběr karty. Používá ji nástěnka
// (PoptavkyBoard) i detail poptávky, ať nevznikají dvě implementace.
//
// Podle stavu ukáže: Mám zájem / Otevřít chat / Máte zájem / Plno. Bez přihlášení
// vede na login, bez karty na vytvoření nabídky, s víc kartami otevře picker
// s doporučenou (odpovídající obor), ale nezakáže ostatní.
//
// 3d (7. 10. 2026): odpověď = nabídka. Po výběru karty poskytovatel zvolí typ (služba /
// výjezd a nacenění), částku placenou přes Propojo (min. 200 Kč), případně nezávazný
// odhad ceny zakázky a zprávu. Zákazník nabídky porovná; po výběru se z nich platí.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Check, X, Star, ArrowLeft } from 'lucide-react'
import { expressInterest } from '@/lib/actions/requests'
import { sendConversationMessage, sendPriceEstimate } from '@/lib/actions/conversation-chat'
import { computeCommission } from '@/lib/booking/commission'
import { BOOKING_POLICY } from '@/lib/booking/policy'

export type PickerCard = {
  id: string
  title: string
  category: string | null
  subcategoryId: string | null
}

type OfferInput = {
  offerKind: 'A' | 'B'
  chargeKc: number
  quoteFeeDeductible: boolean
  estimateFrom: number | null
  estimateTo: number | null
  message: string
}

export default function InterestAction({
  requestId, category, subcategoryId, isFull,
  initialMyStatus = null, initialConversationId = null,
  myCards, isLoggedIn, block = false, onReacted,
}: {
  requestId: string
  category: string | null
  subcategoryId: string | null
  isFull: boolean
  initialMyStatus?: string | null
  initialConversationId?: string | null
  myCards: PickerCard[]
  isLoggedIn: boolean
  block?: boolean
  onReacted?: (conversationId: string | null) => void
}) {
  const router = useRouter()
  const [myStatus, setMyStatus] = useState<string | null>(initialMyStatus)
  const [convId, setConvId] = useState<string | null>(initialConversationId)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const react = async (cardId: string, offer: OfferInput): Promise<string | null> => {
    setBusy(true)
    setError(null)
    const res = await expressInterest(requestId, cardId, { offerKind: offer.offerKind, chargeKc: offer.chargeKc, quoteFeeDeductible: offer.quoteFeeDeductible })
    if (!res.success) {
      setBusy(false)
      return res.error
    }
    // Odhad ceny a zpráva jdou do chatu jednání (zákazník je uvidí i v přehledu zájemců).
    if (res.conversationId) {
      if (offer.estimateFrom) await sendPriceEstimate(res.conversationId, offer.estimateFrom, offer.estimateTo)
      if (offer.message.trim()) await sendConversationMessage(res.conversationId, offer.message.trim())
    }
    setBusy(false)
    setPickerOpen(false)
    setMyStatus('interested')
    setConvId(res.conversationId)
    onReacted?.(res.conversationId)
    router.refresh()
    return null
  }

  const onInterest = () => {
    if (!isLoggedIn) { router.push(`/prihlasit?next=/poptavky/${requestId}`); return }
    if (myCards.length === 0) { router.push('/pridat-sluzbu'); return }
    // Vždy vědomý výběr — i u jediné karty. Tiché dosazení dřív vedlo k tomu, že
    // se do reakce (a pak do objednávky) dostala karta, co s poptávkou nesouvisí.
    setError(null)
    setPickerOpen(true)
  }

  // rejected = poskytovatel dřív couvl → smí reagovat znovu, netváříme se jako „zájem".
  const reacted = !!myStatus && myStatus !== 'rejected'
  const canEditOffer = myStatus === 'interested' || myStatus === 'negotiating'
  const wrap = block ? 'w-full' : ''
  const btn = `inline-flex items-center justify-center gap-1 rounded-xl px-3.5 py-2 text-sm font-bold transition ${block ? 'w-full' : ''}`

  let control
  if (reacted) {
    const label = myStatus === 'selected' ? 'Vybráno' : myStatus === 'not_selected' ? 'Nevybráno' : 'Máte zájem'
    control = convId && myStatus !== 'not_selected' ? (
      <Link href={`/poptavky/${requestId}/jednani/${convId}`} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
        <Check className="h-4 w-4" /> Otevřít chat
      </Link>
    ) : (
      <span className={`${btn} bg-emerald-50 text-emerald-700`}>
        <Check className="h-4 w-4" /> {label}
      </span>
    )
  } else if (isFull) {
    control = <span className={`${btn} bg-slate-100 text-slate-400`}>Plno</span>
  } else {
    control = (
      <button onClick={onInterest} disabled={busy} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Mám zájem <ChevronRight className="h-4 w-4" /></>}
      </button>
    )
  }

  return (
    <div className={wrap}>
      {control}
      {reacted && canEditOffer && (
        <button
          type="button"
          onClick={() => { setError(null); setPickerOpen(true) }}
          className="mt-1 block text-xs font-semibold text-slate-500 underline hover:text-slate-700"
        >
          Upravit nabídku
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {pickerOpen && (
        <OfferPicker
          category={category}
          subcategoryId={subcategoryId}
          cards={myCards}
          busy={busy}
          editing={reacted}
          onSubmit={react}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function OfferPicker({
  category, subcategoryId, cards, busy, editing, onSubmit, onClose,
}: {
  category: string | null
  subcategoryId: string | null
  cards: PickerCard[]
  busy: boolean
  editing: boolean
  onSubmit: (cardId: string, offer: OfferInput) => Promise<string | null>
  onClose: () => void
}) {
  const [cardId, setCardId] = useState<string | null>(cards.length === 1 ? cards[0].id : null)
  const [kind, setKind] = useState<'A' | 'B' | null>(null)
  const [charge, setCharge] = useState('')
  const [deductible, setDeductible] = useState(false)
  const [estFrom, setEstFrom] = useState('')
  const [estTo, setEstTo] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const isRecommended = (c: PickerCard) =>
    (!!subcategoryId && c.subcategoryId === subcategoryId) ||
    (!!category && !!c.category && c.category.toLowerCase() === category.toLowerCase())
  const ordered = [...cards].sort((a, b) => Number(isRecommended(b)) - Number(isRecommended(a)))
  const card = cards.find((c) => c.id === cardId) ?? null

  const minKc = BOOKING_POLICY.minChargeHalere / 100
  const chargeNum = Number(charge)
  const fee = Number.isInteger(chargeNum) && chargeNum > 0
    ? (() => { const r = computeCommission(chargeNum * 100); return r.ok ? r.commission.applicationFeeHalere / 100 : null })()
    : null

  const submit = async () => {
    setErr(null)
    if (!cardId) { setErr('Vyberte nabídku.'); return }
    if (!kind) { setErr('Vyberte, jestli jde o službu, nebo výjezd a nacenění.'); return }
    if (!Number.isInteger(chargeNum) || chargeNum < minKc) { setErr(`Částka musí být celé číslo, nejméně ${minKc} Kč.`); return }
    const from = estFrom.trim() ? Math.round(Number(estFrom)) : null
    const to = estTo.trim() ? Math.round(Number(estTo)) : null
    if (from != null && (!Number.isFinite(from) || from <= 0)) { setErr('Odhad ceny musí být kladné číslo.'); return }
    if (to != null && (from == null || to < from)) { setErr('Horní hranice odhadu nemůže být nižší než dolní.'); return }
    // Poplatek se z ceny zakázky odečítá → odhad zakázky nemůže být nižší než on.
    if (from != null && (kind === 'A' || deductible) && from < chargeNum) {
      setErr(`Odhad ceny zakázky nemůže být nižší než ${chargeNum.toLocaleString('cs-CZ')} Kč – ${kind === 'A' ? 'Rezervační poplatek' : 'Cena výjezdu'} se z ní odečítá.`)
      return
    }
    const e = await onSubmit(cardId, { offerKind: kind, chargeKc: chargeNum, quoteFeeDeductible: kind === 'B' && deductible, estimateFrom: from, estimateTo: to, message })
    if (e) setErr(e)
  }

  const kindBtn = (k: 'A' | 'B', title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${kind === k ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
    >
      <b className="block text-[13px] text-slate-900">{title}</b>
      <span className="block text-[11px] leading-snug text-slate-500">{sub}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[9990] flex items-end justify-center sm:items-center">
      <button aria-label="Zavřít" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">
            {!card ? 'Za kterou nabídku reagujete?' : editing ? 'Upravit nabídku' : 'Vaše nabídka'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {!card ? (
          <>
            <p className="mb-3 text-xs text-slate-500">
              Vyberte kartu, která poptávce odpovídá. Zákazník ji uvidí u vaší nabídky.
            </p>
            {!ordered.some(isRecommended) && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700">
                Žádná vaše nabídka oborem přesně nesedí k této poptávce. Reagovat můžete,
                ale ověřte, že vybraná nabídka dává smysl — zákazník ji uvidí.
              </p>
            )}
            <div className="space-y-2">
              {ordered.map((c) => {
                const rec = isRecommended(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => setCardId(c.id)}
                    disabled={busy}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition disabled:opacity-60 ${
                      rec ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{c.title}</p>
                      {c.category && <p className="text-xs text-slate-500">{c.category}</p>}
                    </div>
                    {rec ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <Star className="h-3 w-3 fill-emerald-600 text-emerald-600" /> doporučeno
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {cards.length > 1 && (
              <button type="button" onClick={() => setCardId(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-3.5 w-3.5" /> {card.title}
              </button>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Co zákazníkovi nabízíte *</p>
              <div className="grid grid-cols-2 gap-2">
                {kindBtn('A', 'Službu', 'rezervace termínu, poplatek se odečte z ceny')}
                {kindBtn('B', 'Výjezd a nacenění', 'přijedete, prohlédnete a naceníte')}
              </div>
            </div>

            {kind && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  {kind === 'B' ? 'Cena výjezdu (Kč) *' : 'Rezervační poplatek (Kč) *'}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={minKc}
                  step={1}
                  value={charge}
                  onChange={(e) => { setCharge(e.target.value); setErr(null) }}
                  placeholder={String(minKc)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Tolik zákazník zaplatí přes Propojo, až potvrdí termín. Nejméně {minKc} Kč.
                  {fee != null ? ` Provize Propojo ${fee.toLocaleString('cs-CZ')} Kč.` : ''}
                  {kind === 'A' ? ' Při placení služby ho zákazníkovi odečtete z ceny.' : ''}
                </p>
                {kind === 'B' && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                    <span>Když zákazník přijme moji nabídku, Cenu výjezdu mu <strong>odečtu z ceny zakázky</strong>.</span>
                  </label>
                )}
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Odhad ceny zakázky (nepovinné, nezávazné)</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={1} value={estFrom} onChange={(e) => setEstFrom(e.target.value)} placeholder="od (Kč)"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
                <input type="number" min={1} value={estTo} onChange={(e) => setEstTo(e.target.value)} placeholder="do (Kč)"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Zpráva zákazníkovi (nepovinné)</p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Např. kdy můžete začít, co je v ceně…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Uložit nabídku' : 'Odeslat nabídku'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
