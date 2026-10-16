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
// 9. 10. 2026: reagovat jde i bez karty (obecná nabídka) – objednávka pak vznikne bez karty.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Check, X, Star, ArrowLeft } from 'lucide-react'
import { expressInterest } from '@/lib/actions/requests'
import { sendConversationMessage, sendPriceEstimate, sendProviderAvailability } from '@/lib/actions/conversation-chat'
import GalleryUpload from '@/components/ui/GalleryUpload'
import { computeCommission } from '@/lib/booking/commission'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import AddressInput from '@/components/ui/AddressInput'
import { BOOKING_POLICY } from '@/lib/booking/policy'

export type PickerCard = {
  id: string
  title: string
  category: string | null
  subcategoryId: string | null
  /** Typ místa karty (u_zakaznika / u_poskytovatele) a adresa provozovny – předvyplní „Kde to proběhne“ */
  locationType?: string | null
  address?: { text: string; lat: number | null; lng: number | null } | null
}

type Place = 'u_zakaznika' | 'u_poskytovatele'

type OfferInput = {
  offerKind: 'A' | 'B'
  chargeKc: number
  quoteFeeDeductible: boolean
  estimateFrom: number | null
  estimateTo: number | null
  /** Materiál v odhadu (nepovinné) */
  estimateMaterial: 'with' | 'without' | null
  message: string
  /** Bez karty: obec, odkud poskytovatel vyjíždí (uloží se do profilu) */
  baseCity: string | null
  /** Kdy může (nepovinné) */
  availFrom: string | null
  availTo: string | null
  /** Fotky podobné práce (nepovinné) */
  photos: string[]
  /** Kde služba proběhne + adresa provozovny */
  place: Place
  placeAddress: { text: string; lat: number | null; lng: number | null } | null
}

export default function InterestAction({
  requestId, category, subcategoryId, isFull,
  initialMyStatus = null, initialConversationId = null,
  myCards, isLoggedIn, isProvider = true, myCity = null, placePref = null, block = false, onReacted,
  chatMode = false, initialCardId = null, initialOffer = null, chatLabel = null,
}: {
  requestId: string
  category: string | null
  subcategoryId: string | null
  isFull: boolean
  initialMyStatus?: string | null
  initialConversationId?: string | null
  myCards: PickerCard[]
  isLoggedIn: boolean
  /** Reagovat smí jen poskytovatel; zákazník jde na registraci poskytovatele */
  isProvider?: boolean
  /** Obec z profilu – předvyplní „Odkud vyjíždíte“ u nabídky bez karty */
  myCity?: string | null
  /** Kde to zákazník chce (z poptávky) – předvyplní „Kde to proběhne“ */
  placePref?: string | null
  block?: boolean
  onReacted?: (conversationId: string | null) => void
  /** V chatu jednání (15. 10. 2026): jen tlačítko „Doplnit / Upravit nabídku“, bez „Mám zájem“ / „Otevřít chat“ */
  chatMode?: boolean
  /** Předvybraná karta (soukromá poptávka z karty) */
  initialCardId?: string | null
  /** Dosavadní nabídka – předvyplní formulář */
  initialOffer?: { kind: 'A' | 'B'; chargeKc: number; deductible: boolean; place?: Place | null; placeAddress?: { text: string; lat: number | null; lng: number | null } | null } | null
  /** Text tlačítka v chatu (výchozí „Doplnit / Upravit nabídku“), např. „Změnit místo“ */
  chatLabel?: string | null
}) {
  const router = useRouter()
  const [myStatus, setMyStatus] = useState<string | null>(initialMyStatus)
  const [convId, setConvId] = useState<string | null>(initialConversationId)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const react = async (cardId: string | null, offer: OfferInput): Promise<string | null> => {
    // Úprava už odeslané nabídky zůstává na místě; nová nabídka vede do chatu
    const editingOffer = !!myStatus && myStatus !== 'rejected'
    setBusy(true)
    setError(null)
    const res = await expressInterest(requestId, cardId, {
      offerKind: offer.offerKind, chargeKc: offer.chargeKc, quoteFeeDeductible: offer.quoteFeeDeductible,
      place: offer.place, placeAddress: offer.place === 'u_poskytovatele' ? offer.placeAddress : null,
    }, offer.baseCity)
    if (!res.success) {
      setBusy(false)
      return res.error
    }
    // Odhad ceny a zpráva jdou do chatu jednání (zákazník je uvidí i v přehledu zájemců).
    if (res.conversationId) {
      if (offer.estimateFrom) await sendPriceEstimate(res.conversationId, offer.estimateFrom, offer.estimateTo, offer.estimateMaterial)
      if (offer.availFrom) await sendProviderAvailability(res.conversationId, offer.availFrom, offer.availTo)
      // Úprava už odeslané nabídky → krátká zpráva, ať to druhá strana vidí (a obnoví se jí box „Co je domluveno“)
      if (editingOffer) {
        const what = `${offer.offerKind === 'B' ? 'Cena výjezdu' : 'Rezervační poplatek'} ${offer.chargeKc.toLocaleString('cs-CZ')} Kč`
        const where = offer.place === 'u_poskytovatele' ? `u mě${offer.placeAddress?.text ? ` (${offer.placeAddress.text})` : ''}` : 'u vás'
        await sendConversationMessage(res.conversationId, `✏️ Upravil(a) jsem nabídku: ${what}, místo: ${where}.`)
      }
      // Nejdřív komentář, pak fotky s jasným popiskem (ve Zprávách se jinak ukazovalo jen „Podobná práce“)
      if (offer.message.trim()) await sendConversationMessage(res.conversationId, offer.message.trim())
      const shots = offer.photos.slice(0, MAX_OFFER_PHOTOS)
      for (const [i, url] of shots.entries()) {
        await sendConversationMessage(res.conversationId, shots.length > 1 ? `📷 Ukázka mé podobné práce (${i + 1}/${shots.length})` : '📷 Ukázka mé podobné práce', url)
      }
    }
    setBusy(false)
    setPickerOpen(false)
    setMyStatus('interested')
    setConvId(res.conversationId)
    onReacted?.(res.conversationId)
    // Nová nabídka → rovnou do chatu se zákazníkem (navrhnout termín, domluvit se)
    if (res.conversationId && !editingOffer) {
      router.push(`/poptavky/${requestId}/jednani/${res.conversationId}`)
      return null
    }
    router.refresh()
    return null
  }

  const onInterest = () => {
    if (!isLoggedIn) { router.push(`/prihlasit?next=/poptavky/${requestId}`); return }
    if (!isProvider) { router.push('/pridat-sluzbu'); return }
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

  // Chat jednání: jen doplnění / úprava nabídky přímo u domluvy
  if (chatMode) {
    return (
      <div className={wrap}>
        {canEditOffer && (
          <button
            type="button"
            onClick={() => { setError(null); setPickerOpen(true) }}
            className={initialOffer
              ? 'text-xs font-semibold text-emerald-700 underline hover:text-emerald-800'
              : 'inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600'}
          >
            {chatLabel ?? (initialOffer ? 'Upravit nabídku' : 'Doplnit nabídku')}
          </button>
        )}
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        {pickerOpen && (
          <OfferPicker
            category={category}
            subcategoryId={subcategoryId}
            cards={myCards}
            myCity={myCity}
            placePref={placePref}
            busy={busy}
            editing={!!initialOffer}
            initialCardId={initialCardId}
            initialOffer={initialOffer}
            onSubmit={react}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
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
          myCity={myCity}
          placePref={placePref}
          busy={busy}
          editing={reacted}
          onSubmit={react}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

const NO_CARD = '__bez_karty__'
// Fotky podobné práce k nabídce – pár ukázek, ne galerie
const MAX_OFFER_PHOTOS = 4

function OfferPicker({
  category, subcategoryId, cards, myCity, placePref, busy, editing, onSubmit, onClose,
  initialCardId = null, initialOffer = null,
}: {
  category: string | null
  subcategoryId: string | null
  cards: PickerCard[]
  myCity: string | null
  placePref: string | null
  busy: boolean
  editing: boolean
  onSubmit: (cardId: string | null, offer: OfferInput) => Promise<string | null>
  onClose: () => void
  initialCardId?: string | null
  initialOffer?: { kind: 'A' | 'B'; chargeKc: number; deductible: boolean; place?: Place | null; placeAddress?: { text: string; lat: number | null; lng: number | null } | null } | null
}) {
  // NO_CARD = obecná nabídka bez karty; null = ještě nevybráno
  const [cardId, setCardId] = useState<string | null>(
    initialCardId && cards.some((c) => c.id === initialCardId) ? initialCardId : cards.length === 0 ? NO_CARD : null)
  const [kind, setKind] = useState<'A' | 'B' | null>(initialOffer?.kind ?? null)
  const [charge, setCharge] = useState(initialOffer ? String(initialOffer.chargeKc) : '')
  const [deductible, setDeductible] = useState(initialOffer?.deductible ?? false)
  const [estFrom, setEstFrom] = useState('')
  const [estTo, setEstTo] = useState('')
  const [estMaterial, setEstMaterial] = useState<'with' | 'without' | null>(null)
  const [message, setMessage] = useState('')
  const [baseCity, setBaseCity] = useState(myCity ?? '')
  const [availFrom, setAvailFrom] = useState('')
  const [availTo, setAvailTo] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [photosUploading, setPhotosUploading] = useState(false)
  // Kde to proběhne: podle karty, bez karty podle přání zákazníka
  const [place, setPlace] = useState<Place>('u_zakaznika')
  const [placeAddr, setPlaceAddr] = useState<{ text: string; lat: number | null; lng: number | null } | null>(null)
  const [placeKey, setPlaceKey] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const isRecommended = (c: PickerCard) =>
    (!!subcategoryId && c.subcategoryId === subcategoryId) ||
    (!!category && !!c.category && c.category.toLowerCase() === category.toLowerCase())
  const ordered = [...cards].sort((a, b) => Number(isRecommended(b)) - Number(isRecommended(a)))
  const card = cardId === NO_CARD
    ? { id: NO_CARD, title: 'Bez karty – obecná nabídka', category: null, subcategoryId: null }
    : cards.find((c) => c.id === cardId) ?? null

  // Adresa provozovny, kterou už známe (vybraná karta, jinak kterákoli karta s adresou) – „U mě“ ji předvyplní
  const knownPlace = (cards.find((x) => x.id === cardId)?.address) ?? cards.find((x) => x.address?.text)?.address ?? null
  const choosePlace = (v: Place) => {
    setPlace(v)
    setErr(null)
    if (v === 'u_poskytovatele') {
      if (!placeAddr?.text && knownPlace) { setPlaceAddr(knownPlace); setPlaceKey((k) => k + 1) }
      // Výjezd a nacenění znamená přijet k zákazníkovi – u vás dává smysl jen služba
      if (kind === 'B') setKind('A')
    }
  }

  // Při výběru karty předvyplnit místo a adresu provozovny (při úpravě nabídky poprvé z dosavadní nabídky)
  const [firstPlaceInit, setFirstPlaceInit] = useState(true)
  useEffect(() => {
    if (!cardId) return
    if (firstPlaceInit && initialOffer?.place) {
      setFirstPlaceInit(false)
      setPlace(initialOffer.place)
      setPlaceAddr(initialOffer.place === 'u_poskytovatele' ? (initialOffer.placeAddress ?? knownPlace) : null)
      setPlaceKey((k) => k + 1)
      return
    }
    setFirstPlaceInit(false)
    const c = cards.find((x) => x.id === cardId)
    if (c?.locationType === 'u_poskytovatele') { setPlace('u_poskytovatele'); setPlaceAddr(c.address ?? null) }
    else if (c) { setPlace('u_zakaznika'); setPlaceAddr(null) }
    else { setPlace(placePref === 'u_poskytovatele' ? 'u_poskytovatele' : 'u_zakaznika'); setPlaceAddr(null) }
    setPlaceKey((k) => k + 1)
  }, [cardId]) // eslint-disable-line react-hooks/exhaustive-deps

  const minKc = BOOKING_POLICY.minChargeHalere / 100
  const chargeNum = Number(charge)
  const fee = Number.isInteger(chargeNum) && chargeNum > 0
    ? (() => { const r = computeCommission(chargeNum * 100); return r.ok ? r.commission.applicationFeeHalere / 100 : null })()
    : null

  const submit = async () => {
    setErr(null)
    if (!cardId) { setErr('Vyberte nabídku.'); return }
    if (cardId === NO_CARD && !baseCity.trim()) { setErr('Vyberte obec, ze které vyjíždíte.'); return }
    if (place === 'u_poskytovatele' && (!placeAddr?.text || !/\d/.test(placeAddr.text) || placeAddr.lat == null || placeAddr.lng == null)) {
      setErr('Vyberte ze seznamu přesnou adresu, kde služba proběhne (ulice a číslo).')
      return
    }
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
    const e = await onSubmit(cardId === NO_CARD ? null : cardId, { offerKind: kind, chargeKc: chargeNum, quoteFeeDeductible: kind === 'B' && deductible, estimateFrom: from, estimateTo: to, estimateMaterial: from != null ? estMaterial : null, message, baseCity: cardId === NO_CARD ? baseCity.trim() : null, availFrom: availFrom || null, availTo: availTo || null, photos, place, placeAddress: placeAddr })
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
              Vyberte kartu, která poptávce odpovídá, nebo reagujte bez karty. Zákazník kartu uvidí u vaší nabídky.
            </p>
            <button
              onClick={() => setCardId(NO_CARD)}
              disabled={busy}
              className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-left transition hover:bg-slate-50 disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Bez karty – obecná nabídka</p>
                <p className="text-xs text-slate-500">Zákazník uvidí vaše jméno a profil, částku nastavíte v dalším kroku</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
            {cards.length > 0 && !ordered.some(isRecommended) && (
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
            {cards.length > 0 && (
              <button type="button" onClick={() => setCardId(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-3.5 w-3.5" /> {card.title}
              </button>
            )}

            {cardId === NO_CARD && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Odkud vyjíždíte (obec) *</p>
                <SearchAutocomplete
                  mode="obce"
                  defaultValue={myCity ?? ''}
                  placeholder="Začněte psát a vyberte obec…"
                  onPickObec={(o) => { setBaseCity(o.obec); setErr(null) }}
                  onFreeText={(t) => setBaseCity(t)}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Podle ní zákazník uvidí vzdálenost a pozná se, když bude adresa daleko. Uloží se do vašeho profilu.
                </p>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Kde to proběhne *</p>
              <div className="grid grid-cols-2 gap-2">
                {([['u_zakaznika', 'U zákazníka', 'přijedu na adresu zákazníka'], ['u_poskytovatele', 'U mě', 'v mé provozovně / salonu']] as const).map(([v, title, sub]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => choosePlace(v)}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${place === v ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <b className="block text-[13px] text-slate-900">{title}</b>
                    <span className="block text-[11px] leading-snug text-slate-500">{sub}</span>
                  </button>
                ))}
              </div>
              {placePref === 'u_poskytovatele' && place === 'u_zakaznika' && (
                <p className="mt-1 text-[11px] text-amber-700">Zákazník by raději přišel k vám.</p>
              )}
              {placePref === 'u_zakaznika' && place === 'u_poskytovatele' && (
                <p className="mt-1 text-[11px] text-amber-700">Zákazník by to raději měl u sebe.</p>
              )}
              {place === 'u_poskytovatele' && (
                <div className="mt-2">
                  <AddressInput
                    key={`place-${placeKey}`}
                    defaultValue={placeAddr?.text ?? ''}
                    placeholder="Adresa provozovny – vyberte ze seznamu…"
                    onPick={(a) => { setPlaceAddr({ text: a.address, lat: a.lat, lng: a.lng }); setErr(null) }}
                    onFreeText={(t) => setPlaceAddr({ text: t, lat: null, lng: null })}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Zákazník ji uvidí s mapou ve shrnutí před platbou.</p>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Co zákazníkovi nabízíte *</p>
              <div className="grid grid-cols-2 gap-2">
                {kindBtn('A', 'Službu', 'rezervace termínu, poplatek se odečte z ceny')}
                {place === 'u_poskytovatele' ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 px-3 py-2.5 text-left opacity-60">
                    <b className="block text-[13px] text-slate-500">Výjezd a nacenění</b>
                    <span className="block text-[11px] leading-snug text-slate-400">jen u zákazníka – u vás nabídněte službu</span>
                  </div>
                ) : kindBtn('B', 'Výjezd a nacenění', 'přijedete, prohlédnete a naceníte')}
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
                  {kind === 'A'
                    ? 'Tuto částku vám zákazník zaplatí předem při rezervaci termínu – víte tak, že to myslí vážně. Při placení služby mu ji odečtete z konečné ceny.'
                    : 'Tuto částku vám zákazník zaplatí předem při rezervaci výjezdu – za cestu, prohlídku a nacenění. Víte tak, že to myslí vážně.'}
                  {' '}Nejméně {minKc} Kč{fee != null ? `, provize Propojo ${fee.toLocaleString('cs-CZ')} Kč` : ''}.
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
              <div className="mt-2 flex gap-1.5">
                {([['with', 'včetně materiálu'], ['without', 'bez materiálu']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEstMaterial(estMaterial === v ? null : v)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      estMaterial === v ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Kdy můžete (nepovinné)</p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={availFrom} onChange={(e) => setAvailFrom(e.target.value)} aria-label="Od"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <span className="text-slate-400">–</span>
                <input type="date" value={availTo} min={availFrom || undefined} onChange={(e) => setAvailTo(e.target.value)} aria-label="Do"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Konkrétní termín pak navrhnete v chatu – zákazník ho potvrdí zaplacením.</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Fotky podobné práce (nepovinné, nejvýš {MAX_OFFER_PHOTOS})</p>
              <GalleryUpload value={photos} onChange={(v) => setPhotos(v.slice(0, MAX_OFFER_PHOTOS))} onUploadingChange={setPhotosUploading} />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Zpráva zákazníkovi (nepovinné)</p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Např. co je v ceně, materiál cca 1 200 Kč…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={busy || photosUploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : photosUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Nahrávám fotky…</> : editing ? 'Uložit nabídku' : 'Odeslat nabídku'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
