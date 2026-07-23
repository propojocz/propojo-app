'use client'
// components/ui/ServiceCard.tsx
// Karta v modelu „karta + ceník". Cena se bere z CENÍKU (minItemPrice) jako „od X Kč",
// ne z legacy services.price. Titulní foto + galerie: prvních 5 fotek se prolistuje
// přímo na kartě, za pátou je dlaždice „Zobrazit další →" na profil karty.
//
// Používá se v marketplace, na hlavní stránce a v živém náhledu ve formuláři.
// V náhledu (preview) jsou odkazy vypnuté.

import { useState, type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck, CalendarCheck, Sparkles, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react'
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
  /** Nejnižší cena zveřejněného úkonu (model A). null = jen dohodou/nacenění. */
  minItemPrice?: number | null
  /** Počet zveřejněných úkonů v ceníku. */
  itemCount?: number
  /** Fotky pro prolistování na kartě (titulní bývá první; bere se max 5). */
  gallery?: string[]
}

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }
const MAX_CARD_PHOTOS = 5

export default function ServiceCard({
  service, index = 0, categoryName, subcatNames = [], hasFreeSlot = false,
  isFavorited = false, isLoggedIn = false, preview = false,
  minItemPrice = null, itemCount = 0, gallery = [],
}: ServiceCardProps) {
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[service.category] ?? DEFAULT_META
  const p = service.profiles as any

  const rating = p?.rating ?? 0
  const hasRating = rating > 0
  const providerId = p?.id ?? service.provider_id

  const providerName = p?.display_name || p?.company_name || p?.full_name || 'Poskytovatel'
  const initial = providerName.charAt(0).toUpperCase()

  const obor = categoryName ?? meta.label
  const verified = p?.ico_verified === true

  const detailHref = preview ? '#' : `/sluzby/${service.id}`
  const profilHref = preview ? '#' : `/profil/${providerId}`

  // ── Cena z ceníku ──
  // „od X Kč" když je aspoň jeden ceněný úkon; jinak dohodou/nacenění.
  const hasPrice = minItemPrice != null && minItemPrice > 0
  const priceMain = hasPrice
    ? `od ${minItemPrice!.toLocaleString('cs-CZ')} Kč`
    : 'Ceník na kartě'

  // ── Fotky na kartě ──
  // Sestavíme z titulní fotky + galerie, ořízneme na 5. Pokud je fotek víc, poslední
  // slot je dlaždice „Zobrazit další". Duplikáty (titulní = první v galerii) odfiltrujeme.
  const allPhotos: string[] = Array.from(new Set([
    ...(service.image_url ? [service.image_url] : []),
    ...gallery,
  ]))
  const cardPhotos = allPhotos.slice(0, MAX_CARD_PHOTOS)
  const hasMore = allPhotos.length > MAX_CARD_PHOTOS
  const [photoIdx, setPhotoIdx] = useState(0)
  // Kolik „snímků" má listování: fotky + případná dlaždice „další"
  const frames = cardPhotos.length + (hasMore ? 1 : 0)
  const canSwipe = frames > 1 && !preview
  const isMoreTile = hasMore && photoIdx === cardPhotos.length

  const go = (dir: -1 | 1, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPhotoIdx((prev) => (prev + dir + frames) % frames)
  }

  const shownSubs = subcatNames.slice(0, 3)
  const moreSubs = subcatNames.length - shownSubs.length

  return (
    <motion.article
      initial={preview ? false : { opacity: 0, y: 16 }}
      animate={preview ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      {/* Foto / galerie */}
      <div className="relative h-36 bg-gradient-to-br from-emerald-50 to-blue-50">
        {cardPhotos.length > 0 ? (
          isMoreTile ? (
            <Link href={detailHref} className="flex h-full w-full items-center justify-center bg-slate-900/80 text-white">
              <span className="text-sm font-semibold">Zobrazit další →</span>
            </Link>
          ) : (
            <Link href={detailHref} className="block h-full w-full">
              <Image
                src={cardPhotos[photoIdx]}
                alt={service.title}
                fill
                className="object-cover"
                sizes="(max-width:640px) 100vw, 320px"
              />
            </Link>
          )
        ) : (
          <Link href={detailHref} className="flex h-full w-full items-center justify-center text-5xl">
            {meta.emoji}
          </Link>
        )}

        {/* Prolistování */}
        {canSwipe && (
          <>
            <button
              type="button"
              onClick={(e) => go(-1, e)}
              aria-label="Předchozí fotka"
              className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 opacity-0 shadow-sm backdrop-blur-sm transition group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => go(1, e)}
              aria-label="Další fotka"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 opacity-0 shadow-sm backdrop-blur-sm transition group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Tečky */}
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {Array.from({ length: frames }).map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === photoIdx ? 'bg-white' : 'bg-white/50'}`} />
              ))}
            </div>
          </>
        )}

        {hasFreeSlot && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
            <CalendarCheck className="h-3.5 w-3.5" /> Volný termín
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Název karty */}
        <div className="flex items-start justify-between gap-2">
          <Link href={detailHref} className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-tight text-slate-900 transition-colors group-hover:text-emerald-700">
              {service.title}
            </h3>
            {(service as any).subtitle && (
              <p className="truncate text-xs text-slate-400">{(service as any).subtitle}</p>
            )}
          </Link>
          {!preview && (
            <div className="shrink-0" title="Uložit poskytovatele do oblíbených">
              <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
            </div>
          )}
        </div>

        {/* Poskytovatel */}
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
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
              <Sparkles className="h-3 w-3" /> Nové
            </span>
          )}
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {service.city}</span>
          {verified && (
            <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Ověřeno</span>
          )}
        </div>

        {/* Cena z ceníku + počet úkonů */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            <div className={`font-semibold text-slate-900 ${hasPrice ? 'text-lg' : 'text-sm'}`}>{priceMain}</div>
            {itemCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <ListChecks className="h-3.5 w-3.5" />
                {itemCount} {itemCount === 1 ? 'úkon' : itemCount < 5 ? 'úkony' : 'úkonů'} v ceníku
              </div>
            )}
          </div>
          <Link href={detailHref} className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600">
            Zobrazit
          </Link>
        </div>
      </div>
    </motion.article>
  )
}
