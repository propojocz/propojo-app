'use client'
// components/ui/OrderItemModal.tsx
// Objednávka JEDNOHO úkonu z ceníku. Otevírá se z PriceListPublic kliknutím na
// „Objednat"/„Poptat" u položky.
//
// VÝBĚR ČASU: z volných oken se spočítá mřížka konkrétních začátků po 15
// minutách — z okna 10:00–16:00 u půlhodinového úkonu vyjde 10:00, 10:15 …
// 15:30. Zákazník si tedy vybere čas, ne jen okno. Server si výběr ověřuje
// znovu (v prohlížeči se dá obejít) a okno kolem rezervace sám rozdělí.
//
// Dvě cesty v jednom modalu:
//  1) Úkon má volná okna dost dlouhá na jeho délku → zákazník vybere čas,
//     jde přes reserveSlotForItem. Má-li úkon zálohu, rezervace rovnou vrátí
//     odkaz na platbu — termín se drží 30 minut, pak se sám uvolní.
//  2) Žádné vhodné okno / model B (nacenění) → poptávka bez termínu přes
//     createOrder (poskytovatel se ozve).
//
// Cena, model I PODMÍNKY VÝJEZDU se řídí ÚKONEM (service_item), ne kartou.

import { useState, useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Loader2, MapPin, Store, X, Clock, Wallet, CalendarDays, Truck, AlertTriangle, MessageCircle, Package, Minus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createOrder } from '@/lib/actions/orders'
import { reserveSlotForItem } from '@/lib/actions/slots'
import { orderProduct } from '@/lib/actions/product-order'
import { createClient } from '@/lib/supabase/client'
import type { ServiceItem, PriceUnit } from '@/types/database'
import { formatItemPrice, packageLabel } from '@/lib/price-format'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import { getItemPaymentDisplay } from '@/lib/item-payment-display'

export type SlotOption = {
  id: string
  starts_at: string
  ends_at: string
}

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
  locationType?: string | null
  slots?: SlotOption[]
  providerGeo?: { lat: number | null; lng: number | null; radiusKm: number | null }
  providerName?: string | null
  /** Kolik kusů je reálně volných (u výrobku skladem). null = neomezeno. */
  productAvailable?: number | null
  onClose: () => void
}

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

const UNITS_WITH_DURATION: PriceUnit[] = ['ukon']

function formatDuration(min: number | null): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function windowMinutes(s: SlotOption): number {
  return Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)
}

// ── Mřížka časů ──────────────────────────────────────────────
// Krok 15 minut. Nabízíme jen začátky, do kterých se úkon vejde do konce okna,
// a jen budoucí (s pětiminutovou rezervou, ať zákazník nekliká na čas, který
// mu mezitím utekl). Strop 60 časů na okno drží seznam přehledný i u celodenních oken.
const STEP_MIN = 15
const MAX_TIMES_PER_SLOT = 60

type TimeOption = { slotId: string; startIso: string }

function buildTimes(slot: SlotOption, durMin: number | null): TimeOption[] {
  const start = new Date(slot.starts_at).getTime()
  const end = new Date(slot.ends_at).getTime()
  const potrebaMs = ((durMin && durMin > 0) ? durMin : Math.round((end - start) / 60000)) * 60000
  const hranice = Date.now() + 5 * 60000
  const out: TimeOption[] = []
  for (let t = start; t + potrebaMs <= end; t += STEP_MIN * 60000) {
    if (t >= hranice) out.push({ slotId: slot.id, startIso: new Date(t).toISOString() })
    if (out.length >= MAX_TIMES_PER_SLOT) break
  }
  return out
}

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10)

export default function OrderItemModal({
  item, serviceId, providerId, isLoggedIn, locationType = 'u_zakaznika', slots = [], providerGeo, providerName,
  productAvailable = null, onClose,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<'form' | 'loading' | 'success' | 'error'>('form')
  const [message, setMessage] = useState('')
  const [city, setCity] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  // Vybraný konkrétní čas — okno i začátek dohromady.
  const [selected, setSelected] = useState<TimeOption | null>(null)
  const [skipSlot, setSkipSlot] = useState(false)
  const [cityGeo, setCityGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [goingToPay, setGoingToPay] = useState(false)
  // Modal může zůstat otevřený delší dobu. Každých 30 s ho přepočítáme, aby
  // časy, které mezitím přešly do minulosti, samy zmizely bez obnovy stránky.
  const [timeTick, setTimeTick] = useState(0)
  // ── Výrobek: počet kusů a den dodání ──
  const [pocet, setPocet] = useState(() => Math.max(1, Number((item as any).min_quantity_per_order ?? 1)))
  const [denDodani, setDenDodani] = useState('')

  const isModelB = item.payment_model === 'B'
  const itemAny = item as any
  const isProductItem = itemAny.item_type === 'product'
  const pickupMode = (itemAny.pickup_mode as 'pickup' | 'delivery' | 'both' | null) ?? 'pickup'
  const [productHandover, setProductHandover] = useState<'pickup' | 'delivery'>(() =>
    pickupMode === 'delivery' ? 'delivery' : 'pickup'
  )
  const productDelivery = isProductItem && (pickupMode === 'delivery' || (pickupMode === 'both' && productHandover === 'delivery'))
  const atCustomer = isProductItem ? productDelivery : locationType !== 'u_poskytovatele'
  const needsCity = atCustomer

  const isHourly = !isModelB && item.price_unit === 'hod'
  const hourlyStartedBilling = isHourly && (item as any).hourly_started_billing === true
  const hourlyBillingText = isHourly
    ? (hourlyStartedBilling
        ? 'Každá započatá hodina se účtuje celá.'
        : 'Cena se počítá poměrně podle skutečného času.')
    : null
  const showDuration = UNITS_WITH_DURATION.includes(item.price_unit as PriceUnit) || isModelB
  const dur = showDuration ? formatDuration(item.duration_minutes) : null
  const depositType = ((item as any).deposit_type as 'zaloha' | 'plna_platba' | 'bez_platby' | undefined) ?? 'zaloha'
  const noShowFee = (item as any).no_show_fee != null ? Number((item as any).no_show_fee) : 0
  const feeMode = ((item as any).fee_mode as 'noshow' | 'storno' | 'zadny' | undefined) ?? 'noshow'
  const hasFixedPrice = !isModelB && item.price_type !== 'on_agreement' && item.price != null && Number(item.price) > 0
  const isFullPayment = !isModelB && !isHourly && depositType === 'plna_platba' && hasFixedPrice
  const deposit = isModelB
    ? 0
    : isFullPayment
      ? Number(item.price)
      : (item.deposit_amount ? Number(item.deposit_amount) : 0)

  const q = item as ServiceItem & QuoteTerms
  const quoteFee = Number(q.quote_fee ?? 0)
  const perKm = Number(q.price_per_km ?? 0)
  const freeKm = Number(q.free_km ?? 0)
  const quoteDays = Number(q.quote_days ?? 0)

  // Vhodná okna: budoucí a dost dlouhá na délku úkonu.
  const fitSlots: SlotOption[] = isModelB
    ? []
    : slots
        .filter((s) => new Date(s.ends_at) > new Date())
        .filter((s) => !item.duration_minutes || windowMinutes(s) >= item.duration_minutes)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

  // Všechny nabízené časy, seskupené po dnech.
  const allTimes: TimeOption[] = fitSlots.flatMap((s) => buildTimes(s, item.duration_minutes))
  const days: { key: string; label: string; times: TimeOption[] }[] = []
  for (const t of allTimes) {
    const k = dayKey(t.startIso)
    let d = days.find((x) => x.key === k)
    if (!d) {
      d = {
        key: k,
        label: new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' }).format(new Date(t.startIso)),
        times: [],
      }
      days.push(d)
    }
    d.times.push(t)
  }
  const hasSlots = allTimes.length > 0

  const radius = providerGeo?.radiusKm ?? null
  const distance =
    atCustomer && cityGeo && providerGeo?.lat != null && providerGeo?.lng != null
      ? distanceKm(providerGeo.lat, providerGeo.lng, cityGeo.lat, cityGeo.lng)
      : null
  const outOfRange = distance != null && radius != null && distance > radius
  const blockedByRange = outOfRange && hasSlots && !!selected && !skipSlot

  useEffect(() => {
    const id = window.setInterval(() => setTimeTick((v) => v + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Pokud zákazník nechá modal otevřený a zvolený čas mezitím přestane být
  // rezervovatelný, výběr zrušíme stejně jako tlačítko v mřížce.
  useEffect(() => {
    if (!selected) return
    if (new Date(selected.startIso).getTime() < Date.now() + 5 * 60_000) {
      setSelected(null)
      setErrorMsg('Vybraný čas už není aktuální. Vyberte prosím jiný.')
    }
  }, [timeTick, selected])

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

  // Cenu skládá sdílená funkce, ať modal ukazuje totéž co ceník.
  const priceText = formatItemPrice(item as any)

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  // ── VÝROBEK ────────────────────────────────────────────────
  const it = itemAny
  const jeVyrobek = isProductItem
  const rezim: string = it.stock_mode ?? 'stock'
  const naObjednavku = jeVyrobek && rezim === 'made_to_order'
  const cenaZaKus = Number(it.price ?? 0)
  const minKusu = jeVyrobek ? Math.max(1, Number(it.min_quantity_per_order ?? 1)) : 1
  const maxKusu = (() => {
    if (!jeVyrobek) return 1
    const limity: number[] = []
    if (it.max_quantity_per_order != null) limity.push(Number(it.max_quantity_per_order))
    if (rezim === 'stock' && productAvailable != null) limity.push(productAvailable)
    if (rezim === 'made_to_order' && it.production_capacity != null) limity.push(Number(it.production_capacity))
    return limity.length ? Math.max(0, Math.min(...limity)) : 99
  })()
  const minimumNeniDostupne = jeVyrobek && maxKusu < minKusu
  const vyprodano = jeVyrobek && rezim === 'stock' && productAvailable != null && productAvailable <= 0

  // Nejbližší možný den dodání = dnes + předstih.
  const minDen = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + Number(it.lead_time_days ?? 0))
    return d.toISOString().slice(0, 10)
  })()

  // Vybraný den musí sedět do povolených dnů v týdnu.
  const denNepovoleny = (() => {
    if (!naObjednavku || !denDodani) return false
    const dny: number[] | null = it.available_days ?? null
    if (!dny || !dny.length) return false
    const d = new Date(`${denDodani}T00:00:00`)
    const dow = d.getDay() === 0 ? 7 : d.getDay()
    return !dny.includes(dow)
  })()

  const celkovaCena = cenaZaKus > 0 ? cenaZaKus * pocet : null
  const paymentDisplay = getItemPaymentDisplay(item as any, jeVyrobek ? pocet : 1)

  // Kolik se platí TEĎ a kolik při převzetí — záloha se počítá za kus, takže
  // roste s množstvím stejně jako to dělá orderProduct na serveru.
  const productDueNow = jeVyrobek && celkovaCena != null
    ? depositType === 'plna_platba'
      ? celkovaCena
      : depositType === 'zaloha'
        ? Math.min(celkovaCena, Number((item as any).deposit_amount ?? 0) * pocet)
        : 0
    : 0
  const productDueAtPickup = jeVyrobek && celkovaCena != null ? Math.max(0, celkovaCena - productDueNow) : 0

  const handleSubmit = async () => {
    // ── Výrobek má vlastní cestu (množství, sklad, den dodání) ──
    if (jeVyrobek) {
      if (needsCity && !city.trim()) {
        setState('error'); setErrorMsg('Zadejte prosím město nebo obec pro doručení.'); return
      }
      if (pocet < minKusu) {
        setState('error'); setErrorMsg(`Minimální množství je ${minKusu} ks.`); return
      }
      if (pocet > maxKusu) {
        setState('error'); setErrorMsg('Zvolené množství už není dostupné.'); return
      }
      if (naObjednavku && !denDodani) {
        setState('error'); setErrorMsg('Vyberte den, kdy výrobek potřebujete.'); return
      }
      if (denNepovoleny) {
        setState('error'); setErrorMsg('V tento den poskytovatel nevydává. Vyberte prosím jiný.'); return
      }
      setState('loading'); setErrorMsg('')
      const res = await orderProduct({
        service_id: serviceId,
        service_item_id: item.id,
        quantity: pocet,
        needed_at: naObjednavku ? denDodani : null,
        message: message || undefined,
        location_city: needsCity ? city.trim() : undefined,
        service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
      })
      if (res.success) {
        setState('success')
        setTimeout(() => router.push(`/dashboard/objednavky/${res.id}`), 1000)
      } else {
        setState('error'); setErrorMsg(res.error)
        router.refresh()
      }
      return
    }

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

    // Cesta 1: vybraný čas → rezervace
    if (hasSlots && selected && !skipSlot) {
      const res = await reserveSlotForItem({
        slot_id: selected.slotId,
        service_id: serviceId,
        service_item_id: item.id,
        starts_at: selected.startIso,
        message: message || undefined,
        location_city: needsCity ? city.trim() : undefined,
        service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
      })
      if (res.success) {
        if (res.payUrl) {
          setGoingToPay(true)
          setState('success')
          const cil = res.payUrl
          setTimeout(() => { window.location.href = cil }, 900)
        } else {
          setState('success')
          setTimeout(() => router.push(`/dashboard/objednavky/${res.id}`), 1200)
        }
      } else {
        setState('error'); setErrorMsg(res.error)
        router.refresh()
        setSelected(null)
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

  const submitDisabled = state === 'loading'
    || (jeVyrobek && (vyprodano || minimumNeniDostupne || pocet < minKusu || pocet > maxKusu || (naObjednavku && (!denDodani || denNepovoleny))))
    || (!jeVyrobek && ((hasSlots && !selected && !skipSlot) || blockedByRange))

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
                {jeVyrobek ? 'Objednávka výrobku' : isModelB ? 'Poptávka nacenění' : skipSlot ? 'Domluva termínu' : hasSlots ? 'Rezervace termínu' : 'Objednávka služby'}
              </p>
              <h3 className="mt-0.5 truncate text-lg font-black text-slate-900">{item.name}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Zavřít">
              <X className="h-5 w-5" />
            </button>
          </div>

          {state === 'success' ? (
            (() => {
              const bookedIso = hasSlots && selected && !skipSlot ? selected.startIso : null
              const bookedWhen = bookedIso
                ? new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(bookedIso))
                : null
              return (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 p-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  </div>
                  <p className="text-lg font-black text-emerald-800">
                    {bookedIso
                      ? (goingToPay ? 'Termín pro vás držíme' : 'Termín je váš! 🎉')
                      : jeVyrobek ? 'Objednávka vytvořena' : 'Objednávka odeslána'}
                  </p>
                  {bookedIso ? (
                    <>
                      <p className="text-sm leading-relaxed text-emerald-700">
                        <strong>{item.name}</strong>{bookedWhen ? <>, {bookedWhen}</> : null}.
                      </p>
                      {deposit > 0 && hasFixedPrice && !isFullPayment && (
                        <p className="text-xs text-emerald-600">
                          Zaplatíte zálohu {deposit.toLocaleString('cs-CZ')} Kč, na místě doplatíte {Math.max(0, Number(item.price) - deposit).toLocaleString('cs-CZ')} Kč.
                        </p>
                      )}
                      {goingToPay ? (
                        <p className="text-xs font-semibold text-emerald-700">
                          Otevírám platbu… termín držíme 30 minut, potvrdí ho zaplacení.
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-600">Přesměrovávám na objednávku…</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-emerald-700">
                      {jeVyrobek
                        ? 'Přesměrovávám na detail objednávky, kde dokončíte případnou platbu.'
                        : skipSlot
                          ? 'Teď se můžete s poskytovatelem domluvit v chatu. Až navrhne konkrétní časy, vyberete si jeden.'
                          : isModelB
                            ? 'Poskytovatel se vám ozve a domluvíte se na termínu prohlídky.'
                            : 'Poskytovatel ji potvrdí a ozve se vám.'}
                    </p>
                  )}
                  {!bookedIso && (
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
                {hourlyBillingText && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{hourlyBillingText}</p>
                )}
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
                {hourlyBillingText && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{hourlyBillingText}</p>
                )}
                {!jeVyrobek && deposit > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                        {(skipSlot || !hasSlots)
                          ? (isFullPayment ? 'Zaplatíte po potvrzení termínu' : 'Záloha po potvrzení termínu')
                          : (isFullPayment ? 'Zaplatíte teď (celá cena)' : 'Zaplatíte teď (záloha)')}
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
                      {(skipSlot || !hasSlots)
                        ? 'Platbu provedete až poté, co si s poskytovatelem potvrdíte konkrétní termín.'
                        : isFullPayment
                          ? 'Platíte celou cenu předem — na místě už nic nedoplácíte.'
                          : hasFixedPrice
                            ? 'Záloha se započítá do konečné ceny — na místě doplatíte jen rozdíl.'
                            : 'Záloha se započítá do konečné ceny. Zbytek doplatíte na místě podle skutečného rozsahu.'}
                    </p>
                  </div>
                )}

                {/* ── VÝROBEK: klasický přehled — počet, celkem, teď/při převzetí ── */}
                {jeVyrobek && celkovaCena != null && !vyprodano && !minimumNeniDostupne && (
                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="truncate pr-2">{pocet} × {item.name}</span>
                      <span className="shrink-0 font-semibold text-slate-900">{celkovaCena.toLocaleString('cs-CZ')} Kč</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                        {depositType === 'bez_platby'
                          ? 'Platba při převzetí'
                          : depositType === 'plna_platba'
                            ? 'Zaplatíte teď (celá cena)'
                            : 'Zaplatíte teď (záloha)'}
                      </span>
                      <strong className="text-emerald-700">{productDueNow.toLocaleString('cs-CZ')} Kč</strong>
                    </div>
                    {productDueAtPickup > 0 && (
                      <div className="flex items-center justify-between text-slate-500">
                        <span>{productDelivery ? 'Doplatíte při doručení' : 'Doplatíte při převzetí'}</span>
                        <span>{productDueAtPickup.toLocaleString('cs-CZ')} Kč</span>
                      </div>
                    )}
                    <p className="pt-0.5 text-[11px] leading-relaxed text-slate-400">
                      {depositType === 'bez_platby'
                        ? `Neplatíte nic předem — celou částku uhradíte při ${productDelivery ? 'doručení' : 'převzetí'}.`
                        : depositType === 'plna_platba'
                          ? `Platíte celou cenu předem — při ${productDelivery ? 'doručení' : 'převzetí'} už nic nedoplácíte.`
                          : `Záloha se započítá do konečné ceny — zbytek doplatíte při ${productDelivery ? 'doručení' : 'převzetí'}.`}
                    </p>
                  </div>
                )}

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

                {isModelB && quoteFee <= 0 && perKm <= 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
                    <Truck className="h-3.5 w-3.5" />
                    Výjezd a nacenění zdarma.
                  </p>
                )}
              </div>

              {/* ── VÝROBEK: počet kusů a den dodání ── */}
              {jeVyrobek && (
                <div className="space-y-4">
                  {vyprodano || minimumNeniDostupne ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{minimumNeniDostupne ? `Aktuálně není dostupné minimální objednatelné množství ${minKusu} ks.` : 'Tento výrobek je právě vyprodaný. Zkuste to prosím později.'}</span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-slate-600">Počet kusů</label>
                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center rounded-xl border-[1.5px] border-slate-200 bg-white">
                            <button
                              type="button"
                              onClick={() => setPocet(p => Math.max(minKusu, p - 1))}
                              disabled={pocet <= minKusu}
                              className="flex h-10 w-10 items-center justify-center text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                              aria-label="Ubrat"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-12 text-center text-[15px] font-bold text-slate-900">{pocet}</span>
                            <button
                              type="button"
                              onClick={() => setPocet(p => Math.min(maxKusu, p + 1))}
                              disabled={pocet >= maxKusu}
                              className="flex h-10 w-10 items-center justify-center text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                              aria-label="Přidat"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          {celkovaCena != null && (
                            <p className="text-sm text-slate-600">
                              Celkem <strong className="text-slate-900">{celkovaCena.toLocaleString('cs-CZ')} Kč</strong>
                            </p>
                          )}
                        </div>
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-slate-400">
                          <Package className="h-3.5 w-3.5" />
                          {rezim === 'stock' && productAvailable != null
                            ? `Skladem ${productAvailable} ks`
                            : rezim === 'made_to_order'
                              ? `Vyrábí se na objednávku${it.production_capacity ? ` · ${it.production_capacity} ks denně` : ''}`
                              : 'K dispozici'}
                          {minKusu > 1 ? ` · min. ${minKusu} ks` : ''}
                          {maxKusu < 99 ? ` · max. ${maxKusu} ks na objednávku` : ''}
                        </p>
                        {paymentDisplay.detail ? (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                            <Wallet className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            {paymentDisplay.detail}
                          </div>
                        ) : null}
                      </div>

                      {naObjednavku && (
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-600">
                            Kdy výrobek potřebujete?
                          </label>
                          <input
                            type="date"
                            value={denDodani}
                            min={minDen}
                            onChange={e => setDenDodani(e.target.value)}
                            className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-emerald-500"
                          />
                          {denNepovoleny ? (
                            <p className="mt-1.5 text-[11.5px] font-semibold text-amber-700">
                              V tento den poskytovatel nevydává — vyberte prosím jiný.
                            </p>
                          ) : (
                            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
                              {Number(it.lead_time_days ?? 0) > 0
                                ? `Poskytovatel potřebuje aspoň ${it.lead_time_days} ${Number(it.lead_time_days) === 1 ? 'den' : Number(it.lead_time_days) < 5 ? 'dny' : 'dní'} na přípravu.`
                                : 'Vyberte den vyzvednutí nebo doručení.'}
                            </p>
                          )}
                          {/* Storno pravidlo — zákazník ho musí znát PŘED objednáním,
                              ne až ve chvíli, kdy chce zrušit. */}
                          {Number(it.lead_time_days ?? 0) > 0 && depositType !== 'bez_platby' && (
                            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                              Zrušíte-li aspoň {it.lead_time_days} {Number(it.lead_time_days) === 1 ? 'den' : Number(it.lead_time_days) < 5 ? 'dny' : 'dní'} předem, vrátíme vše.
                              Blíž k termínu se vrací méně — od poloviny předstihu polovina, těsně před termínem nic.
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="mb-2 block text-xs font-semibold text-slate-600">Převzetí</label>
                        {pickupMode === 'both' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => { setProductHandover('pickup'); setErrorMsg('') }}
                              className={`rounded-xl border p-3 text-left transition ${productHandover === 'pickup' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                            >
                              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Store className="h-4 w-4 text-emerald-600" /> Osobní odběr</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setProductHandover('delivery'); setErrorMsg('') }}
                              className={`rounded-xl border p-3 text-left transition ${productHandover === 'delivery' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                            >
                              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Truck className="h-4 w-4 text-emerald-600" /> Doručení</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
                            {pickupMode === 'delivery' ? <Truck className="h-4 w-4 text-emerald-600" /> : <Store className="h-4 w-4 text-emerald-600" />}
                            {pickupMode === 'delivery' ? 'Doručení' : 'Osobní odběr'}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Jak chce zákazník termín vyřešit */}
              {!jeVyrobek && hasSlots && (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-600">
                    Jak chcete domluvit termín?
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSkipSlot(false)
                        setErrorMsg('')
                        setState('form')
                      }}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        !skipSlot
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
                          : 'border-slate-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <CalendarDays className="h-4 w-4 text-emerald-600" /> Vybrat volný termín
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                        Vyberete konkrétní čas a rezervujete ho rovnou.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSkipSlot(true)
                        setSelected(null)
                        setErrorMsg('')
                        setState('form')
                      }}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        skipSlot
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
                          : 'border-slate-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <MessageCircle className="h-4 w-4 text-emerald-600" /> Nejdřív se domluvit
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                        Objednávku odešlete bez času a termín doladíte s poskytovatelem.
                      </span>
                    </button>
                  </div>

                  {!skipSlot ? (
                    <div className="mt-3">
                      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <CalendarDays className="h-3.5 w-3.5 text-emerald-600" /> Vyberte čas *
                      </label>

                      <div className="space-y-3">
                        {days.map((d) => (
                          <div key={d.key}>
                            <p className="mb-1.5 text-xs font-bold capitalize text-slate-700">{d.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {d.times.map((t) => {
                                const isSel = selected?.startIso === t.startIso && selected?.slotId === t.slotId
                                return (
                                  <button
                                    key={`${t.slotId}-${t.startIso}`}
                                    type="button"
                                    onClick={() => { setSelected(isSel ? null : t); setErrorMsg('') }}
                                    className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-all ${
                                      isSel
                                        ? 'border-emerald-500 bg-emerald-500 text-white'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700'
                                    }`}
                                  >
                                    {fmtTime(t.startIso)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                        {dur ? `Úkon trvá ${dur}. ` : ''}
                        {deposit > 0
                          ? 'Termín potvrdí zaplacení zálohy — po výběru vás rovnou pustíme k platbě.'
                          : 'Vybraný čas je po rezervaci rovnou potvrzený — první bere.'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
                      Objednávku odešlete bez pevného času. V detailu objednávky můžete napsat, kdy se vám to hodí,
                      a poskytovatel vám navrhne konkrétní termíny. Dokud jeden nepotvrdíte, nic se nerezervuje ani neplatí.
                    </p>
                  )}
                </div>
              )}

              {/* Město */}
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
                    {jeVyrobek
                      ? 'Výrobek si vyzvednete u poskytovatele — adresu najdete na jeho kartě a v potvrzení objednávky.'
                      : <>Přijdete za poskytovatelem — adresu najdete na jeho kartě{hasSlots ? ' a v potvrzení termínu' : ' a v potvrzení objednávky'}.</>}
                  </span>
                </div>
              )}

              {!jeVyrobek && !isModelB && !hasSlots && (
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
                placeholder={jeVyrobek ? 'Poznámka k objednávce (volitelné)…' : isModelB ? 'Popište práci, kterou potřebujete nacenit…' : (skipSlot || !hasSlots) ? 'Napište, kdy se vám to hodí — např. „ideálně odpoledne příští týden"…' : 'Zpráva pro živnostníka (volitelné)…'}
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
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {jeVyrobek ? 'Vytvářím objednávku…' : hasSlots && selected && !skipSlot ? 'Rezervuji…' : 'Odesílám…'}</>
                  : jeVyrobek
                    ? <span className="flex flex-col items-center leading-tight">
                        <span className="inline-flex items-center gap-1.5"><Package className="h-4 w-4" /> Objednat {pocet} ks</span>
                        {paymentDisplay.detail ? <span className="mt-0.5 text-[11px] font-medium opacity-90">{paymentDisplay.detail}</span> : null}
                      </span>
                    : hasSlots && !skipSlot
                      ? (deposit > 0
                          ? <><Wallet className="h-4 w-4" /> {selected ? `Rezervovat ${fmtTime(selected.startIso)} a zaplatit` : 'Rezervovat a zaplatit'}</>
                          : <><CalendarDays className="h-4 w-4" /> {selected ? `Rezervovat ${fmtTime(selected.startIso)}` : 'Rezervovat termín'}</>)
                      : isModelB ? 'Odeslat poptávku' : skipSlot ? 'Odeslat objednávku bez termínu' : 'Odeslat objednávku'}
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