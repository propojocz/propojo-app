'use client'
// components/ui/PriceListPublic.tsx
// VEŘEJNÝ ceník úkonů na detailu karty — to, co vidí ZÁKAZNÍK. Jen výpis
// zveřejněných úkonů; u každého tlačítko, které otevře OrderItemModal
// (výběr termínu / poptávka + platba). ŽÁDNÉ editační prvky (přidat, upravit,
// mazat, řadit) — ty patří do editační komponenty PriceList, kterou vidí
// jen vlastník v /dashboard.

import { useState } from 'react'
import { ListChecks, Clock, Wallet, ChevronRight, Tag } from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import { PRICE_UNIT_LABELS } from '@/types/database'
import OrderItemModal, { type SlotOption } from '@/components/ui/OrderItemModal'

interface Props {
  items: ServiceItem[]
  serviceId: string
  providerId: string
  isLoggedIn: boolean
  locationType?: string | null
  slots?: SlotOption[]
  providerGeo?: { lat: number | null; lng: number | null; radiusKm: number | null }
  providerName?: string | null
}

// Souhrn ceny pod názvem úkonu — stejná logika jako v editačním ceníku,
// ať zákazník i poskytovatel vidí totéž.
function priceLabel(it: ServiceItem): string {
  const unit = PRICE_UNIT_LABELS[(it.price_unit as keyof typeof PRICE_UNIT_LABELS)] ?? ''
  if (it.payment_model === 'B') return 'Nacenění na místě'
  if (it.price_type === 'on_agreement') return 'Cena dohodou'
  if (it.price_type === 'range' && it.price != null && it.price_max != null) {
    return `${it.price.toLocaleString('cs-CZ')} – ${it.price_max.toLocaleString('cs-CZ')} Kč`
  }
  if (it.price != null && it.price > 0) return `${it.price.toLocaleString('cs-CZ')} Kč ${unit}`.trim()
  return 'Cena dohodou'
}

export default function PriceListPublic({
  items, serviceId, providerId, isLoggedIn,
  locationType = 'u_zakaznika', slots = [], providerGeo, providerName,
}: Props) {
  // Který úkon má otevřený objednávkový modal.
  const [openItem, setOpenItem] = useState<ServiceItem | null>(null)

  // Zákazníkovi ukazujeme jen zveřejněné úkony.
  const visible = items
    .filter((i) => i.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-slate-600">Ceník zatím není vyplněný</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
          Napište poskytovateli — rád vám cenu i termín sdělí napřímo.
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {visible.map((it) => {
          const isB = it.payment_model === 'B'
          const deposit = (it as any).deposit_type as string | undefined
          return (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{it.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <Tag className="h-3.5 w-3.5" /> {priceLabel(it)}
                  </span>
                  {it.duration_minutes ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" /> {it.duration_minutes} min
                    </span>
                  ) : null}
                  {!isB && deposit === 'zaloha' && it.deposit_amount ? (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-slate-400" /> záloha {it.deposit_amount.toLocaleString('cs-CZ')} Kč
                    </span>
                  ) : null}
                  {!isB && deposit === 'plna_platba' ? (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-slate-400" /> platba předem
                    </span>
                  ) : null}
                  {deposit === 'bez_platby' ? (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-slate-400" /> platba až po službě
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpenItem(it)}
                className="inline-flex flex-none items-center gap-1 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
              >
                {isB ? 'Poptat' : 'Objednat'}
                <ChevronRight className="h-4 w-4" />
              </button>
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
          onClose={() => setOpenItem(null)}
        />
      )}
    </>
  )
}