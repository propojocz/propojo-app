'use client'
// components/ui/ProviderCard.tsx
// Výloha: jeden poskytovatel = jedna karta (Booking model). Úkony jako štítky,
// "od X Kč", ověřený, hodnocení, "Volno brzy". Klik → profil poskytovatele.

import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck, CalendarCheck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export type ProviderCardData = {
  providerId: string
  name: string
  avatarUrl: string | null
  city: string | null
  rating: number
  reviewCount: number
  icoVerified: boolean
  services: { id: string; title: string }[]
  minPrice: number | null   // nejnižší cena z prošlých služeb (null = jen Model B / dohodou)
  hasModelB: boolean
  hasFreeSlot: boolean
}

export default function ProviderCard({ data, index = 0 }: { data: ProviderCardData; index?: number }) {
  const initial = data.name.charAt(0).toUpperCase()
  const hasRating = data.rating > 0
  const shownUkony = data.services.slice(0, 3)
  const moreCount = data.services.length - shownUkony.length

  const priceText =
    data.minPrice !== null ? `od ${data.minPrice.toLocaleString('cs-CZ')} Kč`
    : data.hasModelB ? 'Nacenění na místě'
    : 'Cena dohodou'

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group"
    >
      <Link
        href={`/profil/${data.providerId}`}
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md sm:flex-row"
      >
        {/* Avatar */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-50 to-blue-50">
          {data.avatarUrl ? (
            <Image src={data.avatarUrl} alt={data.name} fill className="object-cover" sizes="80px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-emerald-600">
              {initial}
            </div>
          )}
        </div>

        {/* Tělo */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold leading-snug text-slate-900 transition-colors group-hover:text-emerald-700">
              {data.name}
            </h3>
            {data.icoVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" /> Ověřeno
              </span>
            )}
          </div>

          {/* Hodnocení + město */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {hasRating && (
              <span className="flex items-center gap-1">
                <span className="font-bold text-emerald-700">{data.rating.toFixed(1)}</span>
                <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
                <span className="text-slate-400">({data.reviewCount})</span>
              </span>
            )}
            {data.city && <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-slate-400" /> {data.city}</span>}
            {data.hasFreeSlot && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                <CalendarCheck className="h-3.5 w-3.5" /> Volný termín
              </span>
            )}
          </div>

          {/* Úkony jako štítky */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {shownUkony.map((s) => (
              <span key={s.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {s.title}
              </span>
            ))}
            {moreCount > 0 && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                +{moreCount} další
              </span>
            )}
          </div>
        </div>

        {/* Cena + CTA */}
        <div className="flex shrink-0 flex-row items-end justify-between gap-3 sm:w-40 sm:flex-col sm:items-end sm:text-right">
          <div>
            <div className="text-xl font-extrabold text-slate-900">{priceText}</div>
          </div>
          <span className="whitespace-nowrap rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition group-hover:bg-emerald-600">
            Zobrazit profil
          </span>
        </div>
      </Link>
    </motion.article>
  )
}