'use client'
// components/ui/OrderItemModal.tsx
// Objednávka JEDNOHO úkonu z ceníku. Otevírá se z PriceListPublic kliknutím na
// „Objednat"/„Poptat" u položky.
//
// Dvě cesty v jednom modalu:
//  1) Úkon má dostupná VOLNÁ OKNA dost dlouhá na jeho délku → zákazník vybere termín,
//     jde přes reserveSlotForItem (objednávka rovnou 'prijato', okno se zabere).
//  2) Žádné vhodné okno / model B (nacenění) → poptávka bez termínu přes createOrder
//     (poskytovatel se ozve).
//
// Cena, model I PODMÍNKY VÝJEZDU se řídí ÚKONEM (service_item), ne kartou. Každý
// úkon modelu B může mít vlastní poplatek za nacenění, dopravu i lhůtu nabídky.
// Město = našeptávač obcí, předvyplní se z profilu. Délka se ukazuje jen u jednotek,
// kde dává smysl (ukon/hod).

import { useState, useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Loader2, MapPin, Store, X, Clock, Wallet, CalendarDays, Truck, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createOrder } from '@/lib/actions/orders'
import { reserveSlotForItem } from '@/lib/actions/slots'
import { createClient } from '@/lib/supabase/client'
import type { ServiceItem, PriceUnit } from '@/types/database'
import { PRICE_UNIT_LABELS } from '@/types/database'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'

export type SlotOption = {
  id: string
  starts_at: string
  ends_at: string
}

/**
 * Podmínky výjezdu a nacenění (model B).
 * Tato pole žijí na ÚKONU (service_items). Typ zůstává exportovaný kvůli
 * ostatním souborům, které si jím popisují data — modal už je ale nebere
 * z karty, čte je přímo z položky.
 */
export type QuoteTerms = {
  quote_fee?: number | null
  price_per_km?: number | null
  free_km?: number | null
  quote_days?: number | null
}

interface Props {
  item: ServiceItem
  serviceId: string
  providerId: string
  isLoggedIn: boolean
  /** 'u_poskytovatele' | 'u_zakaznika' | 'oboji' — z karty */
  locationType?: string | null
  /** Volná okna poskytovatele, do kterých se tento úkon nabízí (z detailu karty). */
  slots?: SlotOption[]
  /** Odkud poskytovatel vyjíždí a jak daleko — pro kontrolu dosahu. */
  providerGeo?: { lat: number | null; lng: number | null; radiusKm: number | null }
  /** Jméno poskytovatele do navádění („… se vám pokusí nabídnout časy"). */
  providerName?: string | null
  onClose: () => void
}

// Vzdálenost dvou bodů na zemi (km). Vlastní kopie, ať se dá počítat i v prohlížeči
// a zákazník dostal odpověď hned, ne až po odeslání.
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

const UNITS_WITH_DURATION: PriceUnit[] = ['ukon', 'hod']

function formatDuration(min: number | null): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Délka okna v minutách.
function windowMinutes(s: SlotOption): number {
  return Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)
}

export default function OrderItemModal({
  item, serviceId, providerId, isLoggedIn, locationType = 'u_zakaznika', slots = [], providerGeo, providerName, onClose,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<'form' | 'loading' | 'success' | 'error'>('form')
  const [message, setMessage] = useState('')
  const [city, setCity] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  // Zákazníkovi nevyhovuje žádné z nabízených oken → pošle poptávku a
  // poskytovatel mu navrhne čas (vrstva 4). Bez tohohle byl v pasti:
  // tlačítko šlo stisknout jen po výběru okna.
  const [skipSlot, setSkipSlot] = useState(false)
  // Souřadnice vybrané obce — bez nich dosah spočítat nejde.
  const [cityGeo, setCityGeo] = useState<{ lat: number; lng: number } | null>(null)

  const isModelB = item.payment_model === 'B'
  // Místo výkonu určuje KARTA, ne zákazník. Kdo jezdí za zákazníky i přijímá
  // v provozovně, má na to dvě karty — jinak by zákazník rozhodoval o tom,
  // co si poskytovatel nastavil.
  const atCustomer = locationType !== 'u_poskytovatele'
  const needsCity = atCustomer

  const unit = PRICE_UNIT_LABELS[(item.price_unit as keyof typeof PRICE_UNIT_LABELS)] ?? ''
  const showDuration = UNITS_WITH_DURATION.includes(item.price_unit as PriceUnit) || isModelB
  const dur = showDuration ? formatDuration(item.duration_minutes) : null
  const depositType = ((item as any).deposit_type as 'zaloha' | 'plna_platba' | undefined) ?? 'zaloha'
  const noShowFee = (item as any).no_show_fee != null ? Number((item as any).no_show_fee) : 0
  const feeMode = ((item as any).fee_mode as 'noshow' | 'storno' | 'zadny' | undefined) ?? 'noshow'
  // Známe pevnou konečnou cenu? Jen tehdy má smysl ukazovat rozklad záloha/doplatek.
  const hasFixedPrice = !isModelB && item.price_type !== 'on_agreement' && item.price != null && Number(item.price) > 0
  const isFullPayment = !isModelB && depositType === 'plna_platba' && hasFixedPrice
  // Kolik zákazník platí předem: u plné platby celá cena, jinak záloha.
  const deposit = isModelB
    ? 0
    : isFullPayment
      ? Number(item.price)
      : (item.deposit_amount ? Number(item.deposit_amount) : 0)

  // ── Podmínky výjezdu (model B) — z ÚKONU ─────────────────────
  // Dřív se braly z karty, takže všechny úkony modelu B na jedné kartě
  // ukazovaly stejný poplatek. Teď má každý úkon svůj. Průnik typů drží
  // kód funkční i kdyby types/database.ts zaostával za databází.
  const q = item as ServiceItem & QuoteTerms
  const quoteFee = Number(q.quote_fee ?? 0)
  const perKm = Number(q.price_per_km ?? 0)
  const freeKm = Number(q.free_km ?? 0)
  const quoteDays = Number(q.quote_days ?? 0)

  // Vhodná okna: budoucí a dost dlouhá na délku úkonu. U modelu B termín nenabízíme
  // (termín prohlídky se domlouvá zvlášť).
  const fitSlots: SlotOption[] = isModelB
    ? []
    : slots
        .filter((s) => new Date(s.starts_at) > new Date())
        .filter((s) => !item.duration_minutes || windowMinutes(s) >= item.duration_minutes)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const hasSlots = fitSlots.length > 0

  // ── Dosah poskytovatele ──────────────────────────────────────
  // Masér z Valmezu nemá jezdit do Prahy. U REZERVACE TERMÍNU objednávku
  // rovnou nepustíme (přijímá se automaticky, poskytovatel nemá šanci
  // zasáhnout). U POPTÁVKY jen upozorníme — tam rozhoduje on sám a může
  // výjimku udělat.
  const radius = providerGeo?.radiusKm ?? null
  const distance =
    atCustomer && cityGeo && providerGeo?.lat != null && providerGeo?.lng != null
      ? distanceKm(providerGeo.lat, providerGeo.lng, cityGeo.lat, cityGeo.lng)
      : null
  const outOfRange = distance != null && radius != null && distance > radius
  const blockedByRange = outOfRange && hasSlots && !!selectedSlot && !skipSlot

  // Předvyplnění města z profilu.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('city').eq('id', user.id).single()
      const c = (data as { city: string | null } | null)?.city
      if (!cancelled && c) setCity(c)
    }
    load()
    return () => { cancelled = true }
  }, [])

  let priceText: string
  if (isModelB) priceText = 'Nacenění na místě'
  else if (item.price_type === 'on_agreement') priceText = 'Cena dohodou'
  else if (item.price_type === 'range' && item.price != null && item.price_max != null)
    priceText = `${item.price.toLocaleString('cs-CZ')} – ${item.price_max.toLocaleString('cs-CZ')} Kč`
  else if (item.price != null && item.price > 0)
    priceText = `${item.price.toLocaleString('cs-CZ')} Kč ${unit}`.trim()
  else priceText = 'Cena dohodou'

  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso))
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  const handleSubmit = async () => {
    if (needsCity && !city.trim()) {
      setState('error')
      setErrorMsg('Zadejte prosím město nebo obec, kde se má služba provést.')
      return
    }
    if (blockedByRange) {
      setState('error')
      setErrorMsg('Tato obec je mimo dosah poskytovatele — termín rezervovat nelze.')
      return
    }
    setState('loading'); setErrorMsg('')

    // Cesta 1: vybraný termín → rezervace okna
    if (hasSlots && selectedSlot && !skipSlot) {
      const res = await reserveSlotForItem({
        slot_id: selectedSlot,
        service_id: serviceId,
        service_item_id: item.id,
        message: message || undefined,
        location_city: needsCity ? city.trim() : undefined,
        service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
      })
      if (res.success) {
        setState('success')
        setTimeout(() => router.push(`/dashboard/objednavky/${res.id}`), 1200)
      } else {
        setState('error'); setErrorMsg(res.error)
        router.refresh()
        setSelectedSlot(null)
      }
      return
    }

    // Cesta 2: poptávka bez termínu
    const result = await createOrder({
      service_id: serviceId,
      service_item_id: item.id,
      provider_id: providerId,
      message: message || undefined,
      location_city: needsCity ? city.trim() : undefined,
      service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
    })
    if (result.success) setState('success')
    else { setState('error'); setErrorMsg(result.error) }
  }

  // Když jsou termíny, k odeslání je potřeba jeden vybrat. A rezervaci mimo
  // dosah nepustíme vůbec — poskytovatel by dostal potvrzený termín, kam nedojede.
  const submitDisabled = state === 'loading' || (hasSlots && !selectedSlot && !skipSlot) || blockedByRange

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
          className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        >
          {/* Hlavička */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                {isModelB ? 'Poptávka nacenění' : skipSlot ? 'Poptávka termínu' : hasSlots ? 'Rezervace termínu' : 'Objednávka úkonu'}
              </p>
              <h3 className="mt-0.5 truncate text-lg font-black text-slate-900">{item.name}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Zavřít">
              <X className="h-5 w-5" />
            </button>
          </div>

          {state === 'success' ? (
            (() => {
              const bookedSlot = hasSlots && selectedSlot && !skipSlot
                ? (slots.find((sl) => sl.id === selectedSlot) ?? null)
                : null
              const bookedWhen = bookedSlot
                ? new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(bookedSlot.starts_at))
                : null
              return (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 p-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  </div>
                  <p className="text-lg font-black text-emerald-800">
                    {bookedSlot ? 'Termín je váš! 🎉' : skipSlot ? 'Poptávka odeslána' : 'Objednávka odeslána'}
                  </p>
                  {bookedSlot ? (
                    <>
                      <p className="text-sm leading-relaxed text-emerald-700">
                        <strong>{item.name}</strong>{bookedWhen ? <>, {bookedWhen}</> : null}.
                      </p>
                      {deposit > 0 && hasFixedPrice && (
                        <p className="text-xs text-emerald-600">
                          Zaplatíte zálohu {deposit.toLocaleString('cs-CZ')} Kč, na místě doplatíte {Math.max(0, Number(item.price) - deposit).toLocaleString('cs-CZ')} Kč.
                        </p>
                      )}
                      <p className="text-xs text-emerald-600">Otevírám platbu…</p>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-emerald-700">
                      {skipSlot
                        ? 'Živnostník vám navrhne konkrétní termíny — přijde vám upozornění a vyberete si.'
                        : isModelB
                          ? 'Živnostník se vám ozve a domluvíte se na termínu prohlídky.'
                          : 'Živnostník ji potvrdí a ozve se vám.'}
                    </p>
                  )}
                  {!bookedSlot && (
                    <Link href="/dashboard/objednavky" className="mt-1 text-xs font-bold text-emerald-700 underline">
                      Sledovat v Objednávkách
                    </Link>
                  )}
                </div>
              )
            })()
          ) : !isLoggedIn ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{priceText}</span>
                  {dur && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" /> {dur}</span>}
                </div>
              </div>
              <Link href={`/prihlasit?next=/sluzby/${serviceId}`} className="btn-primary w-full">
                Přihlásit se a objednat
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Rekapitulace */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-slate-900">{priceText}</span>
                  {dur && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5 text-slate-400" /> {dur}</span>}
                </div>
                {deposit > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                        {isFullPayment ? 'Zaplatíte teď (celá cena)' : 'Zaplatíte teď (záloha)'}
                      </span>
                      <strong className="text-emerald-700">{deposit.toLocaleString('cs-CZ')} Kč</strong>
                    </div>
                    {hasFixedPrice && !isFullPayment && (
                      <>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Celková cena</span>
                          <span>{Number(item.price).toLocaleString('cs-CZ')} Kč</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Doplatíte na místě</span>
                          <span>{Math.max(0, Number(item.price) - deposit).toLocaleString('cs-CZ')} Kč</span>
                        </div>
                      </>
                    )}
                    {isFullPayment && (
                      <div className="flex items-center justify-between font-semibold text-emerald-700">
                        <span>Na místě doplatíte</span>
                        <span>0 Kč</span>
                      </div>
                    )}
                    <p className="pt-0.5 text-[11px] leading-relaxed text-slate-400">
                      {isFullPayment
                        ? 'Platíte celou cenu předem — na místě už nic nedoplácíte.'
                        : hasFixedPrice
                          ? 'Záloha se započítá do konečné ceny — na místě doplatíte jen rozdíl.'
                          : 'Záloha se započítá do konečné ceny. Zbytek doplatíte na místě podle skutečného rozsahu.'}
                    </p>
                  </div>
                )}

                {/* Storno poplatek — zákazník musí vědět předem, na čem je. */}
                {!isModelB && noShowFee > 0 && feeMode !== 'zadny' && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>
                      {feeMode === 'storno'
                        ? <>Když termín zrušíte příliš pozdě, poskytovatel si účtuje <strong>{noShowFee.toLocaleString('cs-CZ')} Kč</strong>.</>
                        : <>Když nedorazíte a neozvete se, poskytovatel si účtuje <strong>{noShowFee.toLocaleString('cs-CZ')} Kč</strong>.</>}
                    </span>
                  </p>
                )}

                {/* Model B: co zákazník zaplatí za výjezd a nacenění. Musí to vědět
                    PŘED objednáním, ne až z faktury. Údaje jsou z tohoto úkonu. */}
                {isModelB && (quoteFee > 0 || perKm > 0 || quoteDays > 0) && (
                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-600">
                    {quoteFee > 0 && (
                      <p className="flex items-start gap-1.5">
                        <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>
                          Nacenění stojí <strong className="text-slate-900">{quoteFee.toLocaleString('cs-CZ')} Kč</strong>.
                          Přijmete-li nabídku, započítá se do celkové ceny.
                        </span>
                      </p>
                    )}
                    {perKm > 0 && (
                      <p className="flex items-start gap-1.5">
                        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>
                          {freeKm > 0
                            ? <>Doprava zdarma do <strong className="text-slate-900">{freeKm} km</strong>, nad rámec <strong className="text-slate-900">{perKm.toLocaleString('cs-CZ')} Kč/km</strong>.</>
                            : <>Doprava <strong className="text-slate-900">{perKm.toLocaleString('cs-CZ')} Kč/km</strong>.</>}
                        </span>
                      </p>
                    )}
                    {quoteDays > 0 && (
                      <p className="flex items-start gap-1.5">
                        <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>Nabídku dodá do <strong className="text-slate-900">{quoteDays} dnů</strong> od prohlídky.</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Model B bez poplatků — taky to řekneme, ať zákazník neváhá. */}
                {isModelB && quoteFee <= 0 && perKm <= 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
                    <Truck className="h-3.5 w-3.5" />
                    Výjezd a nacenění zdarma.
                  </p>
                )}
              </div>

              {/* Výběr termínu (když jsou vhodná okna) */}
              {hasSlots && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <CalendarDays className="h-3.5 w-3.5 text-emerald-600" /> Vyberte termín *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {fitSlots.map((s) => {
                      const isSel = selectedSlot === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { setSelectedSlot(isSel ? null : s.id); setErrorMsg('') }}
                          className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                            isSel
                              ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                          }`}
                        >
                          <span className="font-semibold">{fmtDay(s.starts_at)}</span>{' '}
                          {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">Vybraný termín je po rezervaci rovnou potvrzený — první bere.</p>

                  {/* Únikový východ: žádné z oken nevyhovuje → poptávka, poskytovatel
                      navrhne čas. Dřív tady zákazník uvízl. */}
                  <button
                    type="button"
                    onClick={() => {
                      setSkipSlot((v) => !v)
                      setSelectedSlot(null)
                      setErrorMsg('')
                      setState('form')
                    }}
                    className={`mt-2 text-xs font-semibold underline ${skipSlot ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {skipSlot ? '← Zpět k nabízeným termínům' : 'Žádný termín mi nevyhovuje — napsat poskytovateli'}
                  </button>

                  {skipSlot && (
                    <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
                      Pošlete poptávku a napište níže, kdy se vám to hodí. Poskytovatel vám
                      navrhne konkrétní termín, který pak potvrdíte zaplacením zálohy.
                    </p>
                  )}
                </div>
              )}

              {/* Město — jen když se koná u zákazníka. Našeptávač obcí. */}
              {needsCity ? (
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> Město nebo obec *
                  </label>
                  <SearchAutocomplete
                    mode="obce"
                    defaultValue={city}
                    placeholder="Začněte psát a vyberte obec…"
                    onPickObec={(picked) => {
                      setCity(picked.obec)
                      setCityGeo({ lat: picked.latitude, lng: picked.longitude })
                    }}
                    onFreeText={(text) => { setCity(text); setCityGeo(null) }}
                  />
                  {outOfRange ? (
                    <div className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
                      blockedByRange
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {blockedByRange ? (
                          <>
                            <strong>Mimo dosah.</strong> Poskytovatel jezdí do {radius} km,
                            vaše obec je asi {Math.round(distance as number)} km daleko.
                            Termín takhle rezervovat nejde — zkuste někoho blíž.
                          </>
                        ) : (
                          <>
                            <strong>Pozor, je to daleko.</strong> Poskytovatel obvykle jezdí do {radius} km,
                            vaše obec je asi {Math.round(distance as number)} km. Poptávku poslat můžete,
                            ale počítejte s tím, že ji nemusí přijmout.
                          </>
                        )}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">Stačí obec — přesnou adresu doplníte až po přijetí objednávky.</p>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>
                    Přijdete za živnostníkem — adresu najdete na jeho kartě{hasSlots ? ' a v potvrzení termínu' : ' a v potvrzení objednávky'}.
                  </span>
                </div>
              )}

              {/* Objednávka naslepo (karta nemá vypsaná okna): navedeme zákazníka,
                  co se stane dál, ať netápe. Poskytovatel mu navrhne konkrétní čas. */}
              {!isModelB && !hasSlots && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-xs leading-relaxed text-emerald-800">
                    Napište níže termín, který by vám vyhovoval — <strong>{providerName || 'poskytovatel'}</strong> se
                    vám pak pokusí nabídnout konkrétní časy. Jakmile je pošle, přijde vám upozornění a termín
                    potvrdíte zaplacením zálohy.
                  </p>
                </div>
              )}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isModelB ? 'Popište práci, kterou potřebujete nacenit…' : (skipSlot || !hasSlots) ? 'Napište, kdy se vám to hodí — např. „ideálně odpoledne příští týden"…' : 'Zpráva pro živnostníka (volitelné)…'}
                rows={3}
                className="form-input resize-none text-sm"
                maxLength={500}
              />

              {state === 'error' && <p className="text-xs text-red-600">{errorMsg}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitDisabled}
                className="btn-primary w-full py-3 text-base disabled:opacity-60"
              >
                {state === 'loading'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {hasSlots && selectedSlot && !skipSlot ? 'Rezervuji…' : 'Odesílám…'}</>
                  : hasSlots && !skipSlot
                    ? <><CalendarDays className="h-4 w-4" /> Rezervovat termín</>
                    : isModelB ? 'Odeslat poptávku' : skipSlot ? 'Odeslat poptávku' : 'Odeslat objednávku'}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                Objednávkou vzniká smlouva přímo mezi vámi a živnostníkem. Propojo je pouze zprostředkovatel.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}