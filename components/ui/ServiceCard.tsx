'use client'
// components/ui/ServiceCard.tsx
// Karta služby — používá se v marketplace, na hlavní stránce a v živém náhledu
// při vytváření nabídky (components/forms/ServiceForm.tsx).
//
// Jméno poskytovatele: zobrazuje se MARKETINGOVÝ název (display_name, např. „Salon Bella").
// Ověřená identita z ARES (company_name + IČO) je vždy vidět na profilu poskytovatele.

import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck, CalendarCheck, Sparkles } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ServiceWithProvider } from '@/types/database'
import { CATEGORY_META } from '@/types/database'
import FavoriteButton from '@/components/ui/FavoriteButton'

interface ServiceCardProps {
  service: ServiceWithProvider
  index?: number
  categoryName?: string
  subcatNames?: string[]
  hasFreeSlot?: boolean
  isFavorited?: boolean
  isLoggedIn?: boolean
  /** Náhled ve formuláři — vypne odkazy a oblíbené, karta je jen k prohlédnutí. */
  preview?: boolean
}

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }

export default function ServiceCard({
  service, index = 0, categoryName, subcatNames = [], hasFreeSlot = false,
  isFavorited = false, isLoggedIn = false, preview = false,
}: ServiceCardProps) {
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[service.category] ?? DEFAULT_META
  const p = service.profiles as any

  const rating = p?.rating ?? 0
  const hasRating = rating > 0
  const providerId = p?.id ?? service.provider_id

  // Marketingový název má přednost. Ověřená identita je na profilu.
  const providerName = p?.display_name || p?.company_name || p?.full_name || 'Poskytovatel'
  const initial = providerName.charAt(0).toUpperCase()

  const obor = categoryName ?? meta.label
  const verified = p?.ico_verified === true

  const price = Number(service.price ?? 0)
  const quoteFee = Number(service.quote_fee ?? 0)
  const isModelB = service.payment_model === 'B'

  let priceMain: string, priceSub: string | null
  if (isModelB) {
    priceMain = 'Nacenění na místě'
    priceSub = quoteFee > 0 ? `od ${quoteFee.toLocaleString('cs-CZ')} Kč` : 'zdarma'
  } else if (price > 0) {
    priceMain = `${price.toLocaleString('cs-CZ')} Kč`
    priceSub = `za ${service.price_unit}`
  } else {
    priceMain = 'Cena dohodou'; priceSub = null
  }

  const shownSubs = subcatNames.slice(0, 3)
  const moreSubs = subcatNames.length - shownSubs.length

  const detailHref = preview ? '#' : `/sluzby/${service.id}`
  const profilHref = preview ? '#' : `/profil/${providerId}`

  return (
    <motion.article
      initial={preview ? false : { opacity: 0, y: 16 }}
      animate={preview ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      <Link href={detailHref} className="relative block h-32 bg-gradient-to-br from-emerald-50 to-blue-50">
        {service.image_url ? (
          <Image src={service.image_url} alt={service.title} fill className="object-cover" sizes="(max-width:640px) 100vw, 320px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">{meta.emoji}</div>
        )}
        {hasFreeSlot && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
            <CalendarCheck className="h-3.5 w-3.5" /> Volný termín
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Název služby — hlavní, to co zákazník hledá */}
        <div className="flex items-start justify-between gap-2">
          <Link href={detailHref} className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-tight text-slate-900 transition-colors group-hover:text-emerald-700">
              {service.title}
            </h3>
          </Link>
          {!preview && (
            <div className="shrink-0" title="Uložit poskytovatele do oblíbených">
              <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
            </div>
          )}
        </div>

        {/* Poskytovatel — menší, doplňková informace */}
        <Link href={profilHref} className="-mt-1 flex items-center gap-1.5">
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-50 to-blue-50">
            {p?.avatar_url ? (
              <Image src={p.avatar_url} alt={providerName} fill className="object-cover" sizes="24px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-emerald-600">{initial}</div>
            )}
          </div>
          <span className="truncate text-xs text-slate-500 transition-colors hover:text-emerald-700">{providerName}</span>
        </Link>

        {/* Obor + podkategorie */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <span>{meta.emoji}</span> {obor}
          </span>
          {shownSubs.map((name) => (
            <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{name}</span>
          ))}
          {moreSubs > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">+{moreSubs}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          {hasRating ? (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
              <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
              <span className="text-slate-400">({p?.review_count ?? 0})</span>
            </span>
          ) : (
            // Bez hodnocení neukazujeme prázdno ani vymyšlené hvězdičky — jen pravdivé „Nové".
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
              <Sparkles className="h-3 w-3" /> Nové
            </span>
          )}
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {service.city}</span>
          {verified && (
            <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Ověřeno</span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            <div className={`font-semibold text-slate-900 ${isModelB ? 'text-sm' : 'text-lg'}`}>{priceMain}</div>
            {priceSub && <div className="text-xs text-slate-400">{priceSub}</div>}
          </div>
          <Link href={detailHref} className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600">
            Zobrazit
          </Link>
        </div>
      </div>
    </motion.article>
  )
}