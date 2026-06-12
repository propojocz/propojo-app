'use client'
// components/ui/ServiceCard.tsx

import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ServiceWithProvider } from '@/types/database'
import { CATEGORY_META } from '@/types/database'

interface ServiceCardProps {
  service: ServiceWithProvider
  index?: number
}

// Bezpečný fallback – nové kategorie z DB nemusí být ve staré CATEGORY_META
const DEFAULT_META = { label: 'Služba', emoji: '🔧' }

export default function ServiceCard({ service, index = 0 }: ServiceCardProps) {
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[service.category] ?? DEFAULT_META
  const rating = service.profiles?.rating ?? 0
  const hasRating = rating > 0
  const initial = service.profiles?.full_name?.charAt(0)?.toUpperCase() ?? 'P'

  // Cena: Model B = nacenění na místě, jinak cena nebo dohodou
  const price = Number(service.price ?? 0)
  const quoteFee = Number(service.quote_fee ?? 0)
  const isModelB = service.payment_model === 'B'

  let priceMain: string
  let priceSub: string | null
  if (isModelB) {
    priceMain = 'Nacenění na místě'
    priceSub = quoteFee > 0 ? `od ${quoteFee.toLocaleString('cs-CZ')} Kč` : 'zdarma'
  } else if (price > 0) {
    priceMain = `${price.toLocaleString('cs-CZ')} Kč`
    priceSub = `za ${service.price_unit}`
  } else {
    priceMain = 'Cena dohodou'
    priceSub = null
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row"
    >
      {/* Avatar */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-50 to-blue-50">
        {service.profiles?.avatar_url ? (
          <Image
            src={service.profiles.avatar_url}
            alt={service.profiles.full_name}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-emerald-600">
            {initial}
          </div>
        )}
      </div>

      {/* Tělo */}
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-extrabold leading-snug text-slate-900 transition-colors group-hover:text-emerald-700">
          <Link href={`/sluzby/${service.id}`} className="focus:outline-none">
            {service.title}
          </Link>
        </h3>
        <p className="mt-0.5 text-sm font-medium text-slate-500">{service.profiles?.full_name}</p>

        {/* Hodnocení */}
        {hasRating && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-emerald-700">{rating.toFixed(1)}</span>
            <span className="flex items-center gap-0.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star
                  key={i}
                  className={`h-3.5 w-3.5 ${
                    i < Math.round(rating) ? 'fill-emerald-500 text-emerald-500' : 'text-slate-200'
                  }`}
                />
              ))}
            </span>
            <span className="text-sm text-slate-400">({service.profiles?.review_count ?? 0})</span>
          </div>
        )}

        {/* Tagy */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Ověřeno ARES
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
            {meta.emoji} {meta.label}
          </span>
        </div>

        {/* Město */}
        <div className="mt-2.5 flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-4 w-4 text-slate-400" />
          {service.city}
        </div>

        {/* Popis */}
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {service.description}
        </p>
      </div>

      {/* Pravá strana – cena + tlačítko */}
      <div className="flex shrink-0 flex-row items-end justify-between gap-3 sm:w-44 sm:flex-col sm:items-end sm:text-right">
        <div>
          <div className={`font-extrabold text-slate-900 ${isModelB ? 'text-base' : 'text-xl'}`}>
            {priceMain}
          </div>
          {priceSub && <div className="text-xs text-slate-400">{priceSub}</div>}
        </div>
        <Link
          href={`/sluzby/${service.id}`}
          className="whitespace-nowrap rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          Zobrazit
        </Link>
      </div>
    </motion.article>
  )
}