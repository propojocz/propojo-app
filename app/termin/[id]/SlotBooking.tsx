'use client'
// app/termin/[id]/SlotBooking.tsx
// Klientská část veřejné stránky termínu: seznam úkonů, které se do okna vejdou,
// a otevření objednávky (OrderItemModal) s TÍMHLE jedním termínem.

import { useState } from 'react'
import { Clock, Wallet } from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import { PRICE_UNIT_LABELS } from '@/types/database'
import OrderItemModal, { type SlotOption, type QuoteTerms } from '@/components/ui/OrderItemModal'

interface ServiceInfo {
  title: string
  locationType: string | null
  quoteTerms: QuoteTerms
}

interface Props {
  items: ServiceItem[]
  slot: SlotOption
  providerId: string
  /** service_id → údaje karty (název, místo výkonu, podmínky výjezdu) */
  serviceMap: Record<string, ServiceInfo>
  isLoggedIn: boolean
}

function formatDuration(min: number | null): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function priceText(it: ServiceItem): string {
  const unit = PRICE_UNIT_LABELS[(it.price_unit as keyof typeof PRICE_UNIT_LABELS)] ?? ''
  if (it.price_type === 'on_agreement') return 'Cena dohodou'
  if (it.price_type === 'range' && it.price != null && it.price_max != null) {
    return `${it.price.toLocaleString('cs-CZ')} – ${it.price_max.toLocaleString('cs-CZ')} Kč`
  }
  if (it.price != null && it.price > 0) {
    return `${it.price.toLocaleString('cs-CZ')} Kč ${unit}`.trim()
  }
  return 'Cena dohodou'
}

export default function SlotBooking({ items, slot, providerId, serviceMap, isLoggedIn }: Props) {
  const [orderItem, setOrderItem] = useState<ServiceItem | null>(null)

  const active = orderItem ? serviceMap[orderItem.service_id] : null

  return (
    <>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.map((it) => {
          const dur = formatDuration(it.duration_minutes)
          const deposit = it.deposit_amount ? Number(it.deposit_amount) : 0
          return (
            <li key={it.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{it.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
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
                </div>
              </div>

              <div className="flex flex-none flex-col items-end gap-1.5">
                <span className="text-base font-black text-slate-900">{priceText(it)}</span>
                <button
                  type="button"
                  onClick={() => setOrderItem(it)}
                  className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
                >
                  Rezervovat
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {orderItem && active && (
        <OrderItemModal
          item={orderItem}
          serviceId={orderItem.service_id}
          providerId={providerId}
          isLoggedIn={isLoggedIn}
          locationType={active.locationType}
          slots={[slot]}
          quoteTerms={active.quoteTerms}
          onClose={() => setOrderItem(null)}
        />
      )}
    </>
  )
}