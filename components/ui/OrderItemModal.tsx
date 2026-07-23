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
// Cena a model se řídí ÚKONEM (service_item), ne kartou. Město = našeptávač obcí,
// předvyplní se z profilu. Délka se ukazuje jen u jednotek, kde dává smysl (ukon/hod).

import { useState, useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Loader2, MapPin, Home, Store, X, Clock, Wallet, CalendarDays, Truck } from 'lucide-react'
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

/** Podmínky výjezdu z karty — ukazují se u úkonů s naceněním (model B). */
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
  /** Podmínky výjezdu z karty — zobrazí se u úkonu s naceněním (model B). */
  quoteTerms?: QuoteTerms
  onClose: () => void
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
  item, serviceId, providerId, isLoggedIn, locationType = 'u_zakaznika', slots = [], quoteTerms, onClose,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<'form' | 'loading' | 'success' | 'error'>('form')
  const [message, setMessage] = useState('')
  const [city, setCity] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [place, setPlace] = useState<'u_zakaznika' | 'u_poskytovatele'>(
    locationType === 'u_poskytovatele' ? 'u_poskytovatele' : 'u_zakaznika'
  )

  const isModelB = item.payment_model === 'B'
  const isChoice = locationType === 'oboji'
  const atCustomer = isChoice ? place === 'u_zakaznika' : locationType === 'u_zakaznika'
  const needsCity = atCustomer

  const unit = PRICE_UNIT_LABELS[(item.price_unit as keyof typeof PRICE_UNIT_LABELS)] ?? ''
  const showDuration = UNITS_WITH_DURATION.includes(item.price_unit as PriceUnit) || isModelB
  const dur = showDuration ? formatDuration(item.duration_minutes) : null
  const deposit = !isModelB && item.deposit_amount ? Number(item.deposit_amount) : 0

  // Podmínky výjezdu z karty (jen model B).
  const quoteFee = Number(quoteTerms?.quote_fee ?? 0)
  const perKm = Number(quoteTerms?.price_per_km ?? 0)
  const freeKm = Number(quoteTerms?.free_km ?? 0)
  const quoteDays = Number(quoteTerms?.quote_days ?? 0)

  // Vhodná okna: budoucí a dost dlouhá na délku úkonu. U modelu B termín nenabízíme
  // (termín prohlídky se domlouvá zvlášť).
  const fitSlots: SlotOption[] = isModelB
    ? []
    : slots
        .filter((s) => new Date(s.starts_at) > new Date())
        .filter((s) => !item.duration_minutes || windowMinutes(s) >= item.duration_minutes)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const hasSlots = fitSlots.length > 0

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
    setState('loading'); setErrorMsg('')

    // Cesta 1: vybraný termín → rezervace okna
    if (hasSlots && selectedSlot) {
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

  // Když jsou termíny, k odeslání je potřeba jeden vybrat.
  const submitDisabled = state === 'loading' || (hasSlots && !selectedSlot)

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
                {isModelB ? 'Poptávka nacenění' : hasSlots ? 'Rezervace termínu' : 'Objednávka úkonu'}
              </p>
              <h3 className="mt-0.5 truncate text-lg font-black text-slate-900">{item.name}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Zavřít">
              <X className="h-5 w-5" />
            </button>
          </div>

          {state === 'success' ? (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-bold text-emerald-800">
                {hasSlots && selectedSlot ? 'Termín rezervován' : 'Objednávka odeslána'}
              </p>
              <p className="text-xs leading-relaxed text-emerald-700">
                {hasSlots && selectedSlot
                  ? 'Přesměrováváme na vaši objednávku…'
                  : isModelB
                    ? 'Živnostník se vám ozve a domluvíte se na termínu prohlídky.'
                    : 'Živnostník ji potvrdí a ozve se vám.'}
              </p>
              {!(hasSlots && selectedSlot) && (
                <Link href="/dashboard/objednavky" className="mt-1 text-xs font-bold text-emerald-700 underline">
                  Sledovat v Objednávkách
                </Link>
              )}
            </div>
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
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <Wallet className="h-3.5 w-3.5 text-slate-400" />
                    Rezervační záloha {deposit.toLocaleString('cs-CZ')} Kč — započítá se do konečné ceny.
                  </p>
                )}

                {/* Model B: co zákazník zaplatí za výjezd a nacenění. Musí to vědět
                    PŘED objednáním, ne až z faktury. */}
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
                </div>
              )}

              {/* U 'oboji': volba místa */}
              {isChoice && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Kde chcete službu využít?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPlace('u_poskytovatele')}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${place === 'u_poskytovatele' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Store className="h-4 w-4" /> U živnostníka
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlace('u_zakaznika')}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${place === 'u_zakaznika' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Home className="h-4 w-4" /> U mě
                    </button>
                  </div>
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
                    onPickObec={(picked) => setCity(picked.obec)}
                    onFreeText={(text) => setCity(text)}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Stačí obec — přesnou adresu doplníte až po přijetí objednávky.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>Služba probíhá na adrese živnostníka. Adresu uvidíte po přijetí objednávky.</span>
                </div>
              )}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isModelB ? 'Popište práci, kterou potřebujete nacenit…' : 'Zpráva pro živnostníka (volitelné)…'}
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
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {hasSlots && selectedSlot ? 'Rezervuji…' : 'Odesílám…'}</>
                  : hasSlots
                    ? <><CalendarDays className="h-4 w-4" /> Rezervovat termín</>
                    : isModelB ? 'Odeslat poptávku' : 'Odeslat objednávku'}
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