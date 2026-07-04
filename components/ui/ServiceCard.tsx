'use client'
// components/ui/ServiceCard.tsx
// Kompaktní karta služby pro mřížku (2 vedle sebe), Booking styl.
// Fotka nahoře (srdíčko v rohu, Volný termín), pod tím jméno + obor + podkategorie,
// dole cena + Zobrazit. Klik na jméno/avatar → profil, Zobrazit → detail služby.

import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck, CalendarCheck } from 'lucide-react'
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
}

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }

export default function ServiceCard({
  service, index = 0, categoryName, subcatNames = [], hasFreeSlot = false, isFavorited = false, isLoggedIn = false,
}: ServiceCardProps) {
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[service.category] ?? DEFAULT_META
  const rating = service.profiles?.rating ?? 0
  const hasRating = rating > 0
  const providerId = (service.profiles as any)?.id ?? service.provider_id
  const providerName = service.profiles?.full_name ?? 'Poskytovatel'
  const initial = providerName.charAt(0).toUpperCase()
  const obor = categoryName ?? meta.label
  const verified = (service.profiles as any)?.ico_verified === true

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

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      {/* Fotka / avatar pruh */}
      <Link href={`/sluzby/${service.id}`} className="relative block h-32 bg-gradient-to-br from-emerald-50 to-blue-50">
        {service.image_url ? (
          <Image src={service.image_url} alt={service.title} fill className="object-cover" sizes="(max-width:640px) 100vw, 320px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">{meta.emoji}</div>
        )}
        {hasFreeSlot && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-sm">
            <CalendarCheck className="h-3.5 w-3.5" /> Volný termín
          </span>
        )}
        <div className="absolute right-3 top-3" onClick={(e) => e.preventDefault()}>
          <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
        </div>
      </Link>

      {/* Tělo */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Jméno + obor */}
        <div className="flex items-start gap-2.5">
          <Link href={`/profil/${providerId}`} className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-50 to-blue-50">
            {service.profiles?.avatar_url ? (
              <Image src={service.profiles.avatar_url} alt={providerName} fill className="object-cover" sizes="36px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-extrabold text-emerald-600">{initial}</div>
            )}
          </Link>
          <div className="min-w-0">
            <Link href={`/profil/${providerId}`}>
              <h3 className="truncate font-extrabold leading-tight text-slate-900 transition-colors group-hover:text-emerald-700">{providerName}</h3>
            </Link>
            <p className="flex items-center gap-1 text-xs font-bold text-emerald-700">
              <span>{meta.emoji}</span> {obor}
            </p>
          </div>
        </div>

        {/* Hodnocení + město */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          {hasRating && (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
              <span className="font-bold text-slate-700">{rating.toFixed(1)}</span>
              <span className="text-slate-400">({service.profiles?.review_count ?? 0})</span>
            </span>
          )}
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {service.city}</span>
          {verified && (
            <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Ověřeno</span>
          )}
        </div>

        {/* Podkategorie */}
        {shownSubs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {shownSubs.map((name) => (
              <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{name}</span>
            ))}
            {moreSubs > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">+{moreSubs}</span>}
          </div>
        )}

        {/* Dole: cena + CTA */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            <div className={`font-extrabold text-slate-900 ${isModelB ? 'text-sm' : 'text-lg'}`}>{priceMain}</div>
            {priceSub && <div className="text-xs text-slate-400">{priceSub}</div>}
          </div>
          <Link href={`/sluzby/${service.id}`} className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600">
            Zobrazit
          </Link>
        </div>
      </div>
    </motion.article>
  )
}