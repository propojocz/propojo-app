'use client'
// components/ui/ServiceCard.tsx
// Karta v modelu „karta + ceník". Cena se bere z CENÍKU (minItemPrice) jako „od X Kč".
// Titulní foto + galerie: prvních 5 fotek se prolistuje přímo na kartě.
//
// SPODNÍ LIŠTA je rozhodovací: cena vlevo, nejbližší termín uprostřed, akce vpravo.
// Hlavní tlačítko je „Volné termíny" — rezervace je to, co má zákazník udělat.
// Když karta žádné vypsané okno nemá, zbyde jen „Zobrazit kartu", ať nenabízíme
// tlačítko, které nikam nevede.
//
// Používá se v marketplace, na hlavní stránce a v živém náhledu ve formuláři.
// V náhledu (preview) jsou odkazy vypnuté.

import { useState, type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck, Zap, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
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
  /** Má TATO karta do budoucna vypsané volné okno? */
  hasFreeSlot?: boolean
  /** Nejbližší volný termín (ISO). Když je, ukáže se ve spodní liště. */
  nextFreeSlot?: string | null
  /** Volná okna (ISO) — na kartě ukážeme první dvě a „a další…". Zákazník
      tak vidí, kdy se dostane na řadu, aniž by kartu rozklikával. */
  freeSlots?: string[]
  isFavorited?: boolean
  isLoggedIn?: boolean
  /** Náhled ve formuláři — vypne odkazy a oblíbené, karta je jen k prohlédnutí. */
  preview?: boolean
  /** Nejnižší cena zveřejněného úkonu (model A). null = jen dohodou/nacenění. */
  minItemPrice?: number | null
  /** Jednotka nejlevnějšího úkonu (m², hod, úkon…) — do „od 500 Kč/m²". */
  minItemUnit?: string | null
  /** Počet zveřejněných úkonů v ceníku. */
  itemCount?: number
  /** Fotky pro prolistování na kartě (titulní bývá první; bere se max 5). */
  gallery?: string[]
}

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }
const MAX_CARD_PHOTOS = 5
const MAX_TAGS = 3

// Zkratky jednotek do ceny — „od 500 Kč/m²"
const UNIT_LABEL: Record<string, string> = {
  ukon: '', hodina: '/hod', m2: '/m²', bm: '/bm', den: '/den', kus: '/ks', projekt: '',
}

// „Pátek 14.08.2026 10:35" — plné datum, ať zákazník hned ví, o kterém dni je řeč.
function formatSlot(iso: string): string {
  const d = new Date(iso)
  const den = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long' }).format(d)
  const datum = new Intl.DateTimeFormat('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d).replace(/\s/g, '')
  const cas = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(d)
  return `${den.charAt(0).toUpperCase()}${den.slice(1)} ${datum} ${cas}`
}

export default function ServiceCard({
  service, index = 0, categoryName, subcatNames = [], hasFreeSlot = false,
  nextFreeSlot = null, freeSlots = [], isFavorited = false, isLoggedIn = false, preview = false,
  minItemPrice = null, minItemUnit = null, itemCount = 0, gallery = [],
}: ServiceCardProps) {
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[service.category] ?? DEFAULT_META
  const p = service.profiles as any

  const rating = p?.rating ?? 0
  const reviewCount = Number(p?.review_count ?? 0)
  const hasRating = rating > 0
  const providerId = p?.id ?? service.provider_id
  const providerName = p?.display_name || p?.company_name || p?.full_name || 'Poskytovatel'

  const obor = categoryName ?? meta.label
  const verified = p?.ico_verified === true

  const detailHref = preview ? '#' : `/sluzby/${service.id}`
  // Tlačítko „Volné termíny" míří rovnou na blok s termíny na detailu karty.
  const terminyHref = preview ? '#' : `/sluzby/${service.id}#volne-terminy`

  // Fotky
  const photos = (gallery.length > 0 ? gallery : (service.image_url ? [service.image_url] : []))
    .slice(0, MAX_CARD_PHOTOS)
  const [photoIdx, setPhotoIdx] = useState(0)
  const listuj = (e: MouseEvent, smer: 1 | -1) => {
    e.preventDefault(); e.stopPropagation()
    setPhotoIdx(i => (i + smer + photos.length) % photos.length)
  }

  // Volné termíny — přednost má seznam, jinak jeden nejbližší.
  const terminy = freeSlots.length > 0
    ? freeSlots
    : (nextFreeSlot ? [nextFreeSlot] : [])
  const maVolno = terminy.length > 0 || hasFreeSlot
  const ukazane = terminy.slice(0, 2)
  const dalsi = terminy.length - ukazane.length

  // Cena
  const jednotka = minItemUnit ? (UNIT_LABEL[minItemUnit] ?? '') : ''

  // Štítky — podkategorie, přebytek jako „+2"
  const viditelneTagy = subcatNames.slice(0, MAX_TAGS)
  const skryteTagy = subcatNames.length - viditelneTagy.length

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* ── FOTKA ── */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100">
        {photos.length > 0 ? (
          <>
            <Link href={detailHref} className="block h-full w-full">
              <Image
                src={photos[photoIdx]}
                alt={service.title}
                fill
                sizes="(max-width: 768px) 100vw, 380px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </Link>
            {photos.length > 1 && (
              <>
                <button onClick={(e) => listuj(e, -1)} aria-label="Předchozí fotka"
                  className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={(e) => listuj(e, 1)} aria-label="Další fotka"
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {photos.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all ${i === photoIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <Link href={detailHref} className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50">
            <span className="text-6xl">{meta.emoji}</span>
          </Link>
        )}

        {/* Last minute štítek */}
        {maVolno && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow">
            <Zap className="h-3.5 w-3.5 fill-white" /> Volno
          </span>
        )}

        {/* Oblíbené */}
        {!preview && (
          <div className="absolute right-3 top-3">
            <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
          </div>
        )}
      </div>

      {/* ── TĚLO ── */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <Link href={detailHref} className="block">
            <h3 className="text-lg font-extrabold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-emerald-700">
              {service.title}
            </h3>
          </Link>
          {(service as any).subtitle && (
            <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{(service as any).subtitle}</p>
          )}
        </div>

        {/* Důvěra: hodnocení · ověřeno */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {hasRating ? (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {Number(rating).toFixed(1)}
              <span className="font-normal text-slate-400">
                ({reviewCount} {reviewCount === 1 ? 'hodnocení' : reviewCount < 5 ? 'hodnocení' : 'hodnocení'})
              </span>
            </span>
          ) : (
            <span className="text-slate-400">Zatím bez hodnocení</span>
          )}
          {verified && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Ověřený profil
            </span>
          )}
        </div>

        {/* Místo */}
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{service.city}</span>
        </div>

        {/* Štítky podkategorií */}
        {viditelneTagy.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {viditelneTagy.map(name => (
              <span key={name} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                {name}
              </span>
            ))}
            {skryteTagy > 0 && (
              <span className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-400">
                +{skryteTagy}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── SPODNÍ ROZHODOVACÍ LIŠTA ── */}
      <div className="mt-auto border-t border-slate-100 p-4">

        {/* Volné termíny rovnou na kartě — ať zákazník nemusí proklikávat,
            aby zjistil, že nejbližší volno je až za tři týdny. */}
        {ukazane.length > 0 && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <CalendarDays className="h-3.5 w-3.5" /> Nejbližší termín
            </p>
            <p className="mt-0.5 text-sm font-extrabold text-slate-900">
              {formatSlot(ukazane[0])}
            </p>
            {(ukazane.length > 1 || dalsi > 0) && (
              <p className="mt-0.5 text-xs text-slate-500">
                {ukazane.length > 1 && <span>a {formatSlot(ukazane[1])}</span>}
                {dalsi > 0 && <span>{ukazane.length > 1 ? ' · ' : ''}a další…</span>}
              </p>
            )}
          </div>
        )}

        {/* Cena a akce na jednom řádku */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {minItemPrice != null && minItemPrice > 0 ? (
              <>
                <p className="text-lg font-extrabold leading-none text-slate-900">
                  od {Number(minItemPrice).toLocaleString('cs-CZ')} Kč<span className="text-sm font-bold text-slate-500">{jednotka}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {itemCount > 1 ? `${itemCount} úkonů v ceníku` : 'Cena od'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold leading-none text-slate-700">Cena dohodou</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Podle rozsahu práce</p>
              </>
            )}
          </div>

          <Link
            href={maVolno ? terminyHref : detailHref}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              maVolno
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {maVolno ? <><Zap className="h-4 w-4" /> Volné termíny</> : 'Zobrazit kartu'}
          </Link>
        </div>

        {!maVolno && (
          <p className="mt-2 text-[11px] text-slate-400">Termín domluvíte v poptávce</p>
        )}
      </div>
    </motion.article>
  )
}