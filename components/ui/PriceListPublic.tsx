'use client'
// components/ui/PriceListPublic.tsx
// VEŘEJNÝ ceník úkonů na detailu karty — to, co vidí ZÁKAZNÍK. Jen výpis
// zveřejněných úkonů; u každého tlačítko, které otevře OrderItemModal
// (výběr termínu / poptávka + platba). ŽÁDNÉ editační prvky (přidat, upravit,
// mazat, řadit) — ty patří do editační komponenty PriceList, kterou vidí
// jen vlastník v /dashboard.

import { useState } from 'react'
import Link from 'next/link'
import { Clock, ChevronRight, Tag, Send, Truck, Package, CalendarDays } from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import { formatItemPrice, packageLabel } from '@/lib/price-format'
import OrderItemModal, { type SlotOption } from '@/components/ui/OrderItemModal'
import { getProductAvailability } from '@/lib/actions/product-order'
import { getItemPaymentDisplay } from '@/lib/item-payment-display'

interface Props {
  items: ServiceItem[]
  serviceId: string
  providerId: string
  isLoggedIn: boolean
  locationType?: string | null
  slots?: SlotOption[]
  providerGeo?: { lat: number | null; lng: number | null; radiusKm: number | null }
  providerName?: string | null
  /** Pro předvyplnění poptávky, když karta nemá ceník. */
  categoryName?: string | null
  city?: string | null
}

// Cenu skládá sdílená funkce (lib/price-format), aby ceník poskytovatele,
// veřejný ceník i objednávkový modal ukazovaly vždy totéž.

// Poplatek za výjezd a nacenění. „Nacenění na místě" za 500 Kč je pro
// zákazníka úplně jiná nabídka než nacenění zdarma — patří to do výpisu,
// ne až do objednávkového modalu.
function quoteFeeLabel(it: ServiceItem): string | null {
  if (it.payment_model !== 'B') return null
  const fee = (it as any).quote_fee as number | null | undefined
  if (fee == null) return null
  return fee > 0 ? `nacenění ${fee.toLocaleString('cs-CZ')} Kč` : 'nacenění zdarma'
}

// Kolik kusů zbývá — nízký sklad dostane naléhavější formulaci než běžný stav.
const LOW_STOCK_THRESHOLD = 5

function zbyvaLabel(pocet: number): string {
  if (pocet === 2 || pocet === 3 || pocet === 4) return `zbývají ${pocet} ks`
  return `zbývá ${pocet} ks`
}

function denLabel(pocet: number): string {
  if (pocet === 1) return 'den'
  if (pocet >= 2 && pocet <= 4) return 'dny'
  return 'dní'
}

function hourlyBillingLabel(it: ServiceItem): string | null {
  if (it.payment_model === 'B' || it.price_unit !== 'hod') return null
  return (it as any).hourly_started_billing === true
    ? 'každá započatá hodina se účtuje celá'
    : 'účtuje se poměrně podle skutečného času'
}

export default function PriceListPublic({
  items, serviceId, providerId, isLoggedIn,
  locationType = 'u_zakaznika', slots = [], providerGeo, providerName,
  categoryName = null, city = null,
}: Props) {
  // Který úkon má otevřený objednávkový modal.
  const [openItem, setOpenItem] = useState<ServiceItem | null>(null)
  // Reálná dostupnost výrobku — dopočítá se ze serveru až při otevření modalu,
  // aby čísla nebyla zastaralá (mezitím mohl někdo objednat).
  const [available, setAvailable] = useState<number | null>(null)
  // Filtr Vše/Služby/Výrobky — jen na smíšené kartě má smysl ho vůbec ukazovat.
  const [filter, setFilter] = useState<'all' | 'service' | 'product'>('all')

  const otevri = async (it: ServiceItem) => {
    setOpenItem(it)
    setAvailable(null)
    if ((it as any).item_type === 'product' && ((it as any).stock_mode ?? 'stock') !== 'unlimited') {
      try {
        const res = await getProductAvailability(it.id)
        setAvailable(res.available)
      } catch { /* dostupnost je jen informativní, objednávku hlídá server */ }
    }
  }

  // Zákazníkovi ukazujeme jen zveřejněné položky.
  const activeItems = items.filter((i) => i.is_active).sort((a, b) => a.sort_order - b.sort_order)

  // Smíšená karta = obsahuje vedle sebe službu i výrobek. Počítáno ze VŠECH
  // aktivních položek (ne z filtrovaných), ať filtr Vše/Služby/Výrobky nezmizí
  // ve chvíli, kdy si zákazník zvolí jednu kategorii.
  const hasServiceHere = activeItems.some((i) => (i as any).item_type !== 'product')
  const hasProductHere = activeItems.some((i) => (i as any).item_type === 'product')
  const isMixed = hasServiceHere && hasProductHere

  const visible = !isMixed || filter === 'all'
    ? activeItems
    : activeItems.filter((i) => ((i as any).item_type === 'product') === (filter === 'product'))

  if (activeItems.length === 0) {
    // Bez úkonu nemá zákazník na co kliknout „Objednat" — a odejde.
    // Nabídneme aspoň poptávku, ať se ti dva potkají.
    const poptavkaHref = `/poptavky/nova${
      categoryName || city
        ? `?${[
            categoryName ? `category=${encodeURIComponent(categoryName)}` : '',
            city ? `city=${encodeURIComponent(city)}` : '',
          ].filter(Boolean).join('&')}`
        : ''
    }`
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-slate-600">Nabídka zatím není vyplněná</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          {providerName ? `${providerName} tu zatím nemá vypsané ceny.` : 'Poskytovatel tu zatím nemá vypsané ceny.'}
          {' '}Napište, co potřebujete — ozve se vám s cenou i termínem.
        </p>
        <Link
          href={poptavkaHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          <Send className="h-4 w-4" /> Poslat poptávku
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Filtr Vše/Služby/Výrobky — jen na smíšené kartě, jinde by byl zbytečný šum. */}
      {isMixed && (
        <div className="mb-3 inline-flex gap-1 rounded-xl bg-slate-100 p-1">
          {([['all', 'Vše'], ['service', 'Služby'], ['product', 'Výrobky']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                filter === id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {visible.map((it) => {
          const isB = it.payment_model === 'B'
          const jeVyrobek = (it as any).item_type === 'product'
          const rezim = (it as any).stock_mode ?? 'stock'
          const skladem = Number((it as any).stock_quantity ?? 0)
          const vyprodano = jeVyrobek && rezim === 'stock' && skladem <= 0
          const hourlyBilling = hourlyBillingLabel(it)
          const payment = getItemPaymentDisplay(it as any, 1)
          // Model B je nacenění na místě, ne obecná poptávka — konkrétnější sloveso
          // zákazníkovi hned řekne, co tlačítko dělá.
          const actionLabel = isB ? 'Objednat nacenění' : payment.action
          const quoteFee = quoteFeeLabel(it)
          return (
            <li key={it.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              {/* Fotka + text vždy jako vodorovná dvojice — i na mobilu, kde je
                  celá položka jinak flex-col (aby se tlačítko vešlo pod). */}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {(it as any).image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(it as any).image_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-bold text-slate-900">{it.name}</p>
                    {isMixed && (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        jeVyrobek ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {jeVyrobek ? 'Výrobek' : 'Služba'}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <Tag className="h-3.5 w-3.5" /> {formatItemPrice(it as any)}
                    </span>
                    {packageLabel((it as any).package_quantity, (it as any).package_unit) ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        balení {packageLabel((it as any).package_quantity, (it as any).package_unit)}
                      </span>
                    ) : null}
                    {quoteFee ? (
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5 text-slate-400" /> {quoteFee}
                      </span>
                    ) : null}
                    {/* Výrobek: dostupnost je pro zákazníka to hlavní. */}
                    {jeVyrobek && rezim === 'stock' ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${
                        vyprodano ? 'text-slate-400' : skladem <= LOW_STOCK_THRESHOLD ? 'text-amber-700' : 'text-slate-600'
                      }`}>
                        <Package className="h-3.5 w-3.5" />
                        {vyprodano ? 'vyprodáno' : skladem <= LOW_STOCK_THRESHOLD ? zbyvaLabel(skladem) : `skladem ${skladem} ks`}
                      </span>
                    ) : jeVyrobek && rezim === 'made_to_order' ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                        Na objednávku
                        {Number((it as any).lead_time_days ?? 0) > 0
                          ? ` · objednejte min. ${(it as any).lead_time_days} ${denLabel(Number((it as any).lead_time_days))} předem`
                          : ''}
                      </span>
                    ) : null}
                    {/* Délka se ukazuje jen tam, kde něco znamená: u ceny za úkon je to
                        délka práce, u nacenění délka prohlídky. U ceny za m²/kus/den
                        by šlo o zbytek po přepnutí jednotky — matoucí. */}
                    {!jeVyrobek && isB && it.duration_minutes ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" /> prohlídka {it.duration_minutes} min
                      </span>
                    ) : !jeVyrobek && !isB && it.price_unit === 'ukon' && it.duration_minutes ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" /> {it.duration_minutes} min
                      </span>
                    ) : null}
                    {hourlyBilling ? (
                      <span className="text-slate-500">{hourlyBilling}</span>
                    ) : null}
                  </div>

                  {/* Poznámka k ceně — poskytovatel ji vyplnil právě proto, aby ji
                      zákazník viděl („u dlouhých vlasů příplatek 100 Kč"). Držíme
                      ji na jednom řádku, ať z ceníku není stěna textu. */}
                  {it.price_note ? (
                    <p className="mt-1 truncate text-[11.5px] italic text-slate-400">{it.price_note}</p>
                  ) : null}
                </div>
              </div>

              {vyprodano ? (
                <span className="inline-flex flex-none items-center rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-400">
                  Vyprodáno
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => otevri(it)}
                  className="inline-flex w-full flex-none flex-col items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-white transition hover:bg-emerald-600 sm:w-auto sm:min-w-[180px]"
                >
                  <span className="inline-flex items-center gap-1 text-sm font-extrabold">
                    {actionLabel}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                  {payment.detail ? (
                    <span className="mt-0.5 max-w-[210px] text-center text-[10.5px] font-medium leading-tight text-emerald-50">
                      {payment.detail}
                    </span>
                  ) : null}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {openItem && (
        <OrderItemModal
          item={openItem}
          serviceId={serviceId}
          providerId={providerId}
          isLoggedIn={isLoggedIn}
          locationType={locationType}
          slots={slots}
          providerGeo={providerGeo}
          providerName={providerName}
          productAvailable={available}
          onClose={() => setOpenItem(null)}
        />
      )}
    </>
  )
}