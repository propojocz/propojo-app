'use client'
// components/ui/ServiceCard.tsx

import { motion } from 'framer-motion'
import { MapPin, Star, Clock } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ServiceWithProvider } from '@/types/database'
import { CATEGORY_META } from '@/types/database'

interface ServiceCardProps {
  service: ServiceWithProvider
  index?: number
}

export default function ServiceCard({ service, index = 0 }: ServiceCardProps) {
  const meta = CATEGORY_META[service.category]

  const formattedDate = new Intl.RelativeTimeFormat('cs', { numeric: 'auto' }).format(
    Math.round(
      (new Date(service.created_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ),
    'day'
  )

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200"
    >
      {/* Obrázek */}
      <div className="relative h-44 w-full overflow-hidden bg-slate-100">
        {service.image_url ? (
          <Image
            src={service.image_url}
            alt={service.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <span className="text-5xl">{meta.emoji}</span>
          </div>
        )}
        {/* Badge kategorie */}
        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 backdrop-blur-sm">
            {meta.label}
          </span>
        </div>
      </div>

      {/* Obsah */}
      <div className="flex flex-1 flex-col p-4">
        {/* Poskytovatel */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {service.profiles.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-700">
              {service.profiles.full_name}
            </p>
            {service.profiles.rating !== null && service.profiles.rating > 0 && (
              <div className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="text-xs text-slate-500">
                  {service.profiles.rating.toFixed(1)}
                  <span className="ml-0.5 text-slate-400">
                    ({service.profiles.review_count})
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Název */}
        <h3 className="mb-1.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-indigo-700 transition-colors">
          {service.title}
        </h3>

        {/* Popis */}
        <p className="mb-4 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">
          {service.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            {service.city}
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-slate-900">
              {service.price.toLocaleString('cs-CZ')} Kč
            </span>
            <span className="ml-1 text-xs text-slate-500">/{service.price_unit}</span>
          </div>
        </div>
      </div>

      {/* Hover overlay CTA */}
      <Link
        href={`/sluzby/${service.id}`}
        className="absolute inset-0 rounded-2xl ring-2 ring-transparent transition-all group-hover:ring-indigo-300 focus-visible:outline-none focus-visible:ring-indigo-500"
        aria-label={`Zobrazit: ${service.title}`}
      />
    </motion.article>
  )
}
