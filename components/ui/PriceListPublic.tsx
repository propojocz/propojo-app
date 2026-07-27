'use client'
// components/ui/PriceListPublic.tsx
// Veřejný (read-only) ceník na detailu karty. Zákazník vidí úkony s cenou,
// délkou a zálohou; kliknutím na „Objednat"/„Poptat" se otevře OrderItemModal
// pro TEN konkrétní úkon (objednávka se naváže na service_item_id).
//
// Podmínky výjezdu (model B) se berou z ÚKONU, ne z karty — každý úkon může
// mít vlastní poplatek za nacenění i dopravu.

import { useState } from 'react'
import { Clock, Wallet, Package, ChevronDown } from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import { PRICE_UNIT_LABELS } from '@/types/database'
import OrderItemModal, { type SlotOption, type QuoteTerms } from '@/components/ui/OrderItemModal'

interface Props {
  items: ServiceItem[]
  serviceId: string
  providerId: string
  isLoggedIn?: boolean
  /** 'u_poskytovatele' | 'u_zakaznika' | 'oboji' — z karty, pro objednávkový modal */
  locationType?: string | null
  /** Volná okna poskytovatele (z detailu karty) — modal z nich nabídne termíny. */
  slots?: SlotOption[]
  /** Odkud poskytovatel vyjíždí a jak daleko — modal podle toho hlídá dosah. */
  providerGeo?: { lat: number | null; lng: number | null; radiusKm: number | null }
}

function formatDuration(min: number | null): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Co se ukáže vpravo u tlačítka. U modelu B je hlavním číslem POPLATEK ZA
// NACENĚNÍ — je to jediná částka, kterou zákazník v tu chvíli zná jistě.
// `small` = hlavní řádek je slovo, ne částka, takže se vysází menším písmem.
function priceText(it: ServiceItem, quote: Quote): { main: string; sub: string | null; small: boolean } {
  const unit = PRICE_UNIT_LABELS[(it.price_unit as keyof typeof PRICE_UNIT_LABELS)] ?? ''

  if (it.payment_model === 'B') {
    if (quote.fee > 0) {
      return { main: `${quote.fee.toLocaleString('cs-CZ')} Kč`, sub: 'za nacenění na místě', small: false }
    }
    return {
      main: 'Nacenění na místě',
      sub: quote.perKm > 0 ? null : 'výjezd zdarma',
      small: true,
    }
  }

  if (it.price_type === 'on_agreement') return { main: 'Cena dohodou', sub: null, small: true }
  if (it.price_type === 'range' && it.price != null && it.price_max != null) {
    return { main: `${it.price.toLocaleString('cs-CZ')} – ${it.price_max.toLocaleString('cs-CZ')} Kč`, sub: unit || null, small: false }
  }
  if (it.price != null && it.price > 0) {
    return { main: `${it.price.toLocaleString('cs-CZ')} Kč`, sub: unit || null, small: false }
  }
  return { main: 'Cena dohodou', sub: null, small: true }
}

// Podmínky výjezdu daného úkonu. Průnik typů drží kód funkční i kdyby
// types/database.ts zaostával za databází.
type Quote = { fee: number; perKm: number; freeKm: number; days: number }

function quoteOf(it: ServiceItem): Quote {
  const q = it as ServiceItem & QuoteTerms
  return {
    fee: Number(q.quote_fee ?? 0),
    perKm: Number(q.price_per_km ?? 0),
    freeKm: Number(q.free_km ?? 0),
    days: Number(q.quote_days ?? 0),
  }
}

export default function PriceListPublic({ items, serviceId, providerId, isLoggedIn = false, locationType = 'u_zakaznika', slots = [], providerGeo }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [orderItem, setOrderItem] = useState<ServiceItem | null>(null)

  const visible = items
    .filter(i => i.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Poskytovatel zatím nemá v ceníku žádné úkony.
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {visible.map((it) => {
          const quote = quoteOf(it)
          const { main, sub, small } = priceText(it, quote)
          const dur = formatDuration(it.duration_minutes)
          const isB = it.payment_model === 'B'
          const materialExtra = !isB && it.price_type !== 'on_agreement' && it.price_includes_material === false
          const deposit = !isB && it.deposit_amount ? Number(it.deposit_amount) : 0
          const note = (it.price_note ?? '').trim()
          const isOpen = openId === it.id
          const hasQuoteInfo = isB && (quote.fee > 0 || quote.perKm > 0 || quote.days > 0)
          // Délka se do panelu nevykresluje (je vidět v řádku výš), takže sama
          // o sobě „Detail" neotvírá — jinak by se otevřel prázdný panel.
          const hasDetail = !!note || deposit > 0 || materialExtra || hasQuoteInfo

          return (
            <li key={it.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{it.name}</p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {dur && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" /> {dur}
                      </span>
                    )}
                    {deposit > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5 text-slate-400" /> záloha {deposit.toLocaleString('cs-CZ')} Kč
                      </span>
                    )}
                    {materialExtra && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                        <Package className="h-3 w-3" /> bez materiálu
                      </span>
                    )}
                  </div>

                  {hasDetail && (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : it.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      {isOpen ? 'Skrýt detail' : 'Detail'}
                    </button>
                  )}
                  {isOpen && (
                    <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                      {note && <p>{note}</p>}
                      {!isB && (
                        materialExtra
                          ? <p>Uvedená cena je za práci. Materiál se účtuje zvlášť podle skutečné spotřeby.</p>
                          : it.price_type !== 'on_agreement' && <p>V ceně je i materiál — nic se nedoplácí.</p>
                      )}
                      {deposit > 0 && <p>Rezervační záloha {deposit.toLocaleString('cs-CZ')} Kč se započítá do konečné ceny.</p>}

                      {/* Model B: podmínky výjezdu tohoto úkonu */}
                      {hasQuoteInfo && (
                        <>
                          {quote.fee > 0 && (
                            <p>Nacenění stojí {quote.fee.toLocaleString('cs-CZ')} Kč. Přijmete-li nabídku, započítá se do celkové ceny.</p>
                          )}
                          {quote.perKm > 0 && (
                            <p>
                              {quote.freeKm > 0
                                ? `Doprava zdarma do ${quote.freeKm} km, nad rámec ${quote.perKm.toLocaleString('cs-CZ')} Kč/km.`
                                : `Doprava ${quote.perKm.toLocaleString('cs-CZ')} Kč/km.`}
                            </p>
                          )}
                          {quote.days > 0 && <p>Nabídku dodá do {quote.days} dnů od prohlídky.</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-none flex-col items-end gap-2">
                  <div className="text-right">
                    <div className={`font-black text-slate-900 ${small ? 'text-sm' : 'text-lg'}`}>{main}</div>
                    {sub && <div className="text-xs text-slate-400">{sub}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderItem(it)}
                    className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    {isB ? 'Poptat' : 'Objednat'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {orderItem && (
        <OrderItemModal
          item={orderItem}
          serviceId={serviceId}
          providerId={providerId}
          isLoggedIn={isLoggedIn}
          locationType={locationType}
          slots={slots}
          providerGeo={providerGeo}
          onClose={() => setOrderItem(null)}
        />
      )}
    </>
  )
}