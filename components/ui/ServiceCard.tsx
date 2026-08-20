'use client'
// components/ui/ServiceCard.tsx
// Karta v modelu „karta + ceník". Cena se bere z CENÍKU (minItemPrice) jako „od X Kč".
//
// KOMPAKTNÍ ROZVRŽENÍ: fotka 16:10 (zabírá zhruba 38–40 % výšky karty), pod ní
// název s popiskem, podkategorie a jeden hustý řádek s důvěrou (hodnocení ·
// ověřeno · město). Spodní lišta nese cenu a akci. Dřív měla karta přes 700 px
// a půlku zabíral prázdný gradient — do řádku se vešly dvě, teď tři.
//
// KARTA BEZ FOTKY neukazuje prázdnou plochu, ale UKÁZKU CENÍKU. V mřížce tak
// zůstane stejně vysoká jako sousedi a prostor nese informaci, ne výplň.
// Vyžaduje prop `priceItems` — když ho stránka nepošle, zbyde úzký pruh
// s kategorií (pořád lepší než 250 px gradientu).
//
// FOTKY se listují PRSTEM (vodorovný scroll se zarážkami), ne jen šipkami při
// najetí myší. Šipky zůstaly pro myš, tečky ukazují, kolikátá fotka je vidět.
//
// Používá se v marketplace, na hlavní stránce a v živém náhledu ve formuláři.
// V náhledu (preview) jsou odkazy vypnuté.

import { useRef, useState, type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Star, ShieldCheck, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ServiceWithProvider } from '@/types/database'
import { CATEGORY_META } from '@/types/database'
import { cas, denKratce } from '@/lib/format'
import FavoriteButton from '@/components/ui/FavoriteButton'

/** Položka ceníku do náhledu na kartě bez fotky. */
export type CardPriceItem = {
  name: string
  price: number | null
  unit?: string | null
}

interface ServiceCardProps {
  service: ServiceWithProvider
  index?: number
  categoryName?: string
  subcatNames?: string[]
  /** Má TATO karta do budoucna vypsané volné okno? */
  hasFreeSlot?: boolean
  /** Nejbližší volný termín (ISO). Když je, ukáže se ve spodní liště. */
  nextFreeSlot?: string | null
  /** Volná okna (ISO) — na kartě ukážeme nejbližší a počet dalších. */
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
  /** Pár úkonů z ceníku — ukážou se místo fotky, když karta žádnou nemá. */
  priceItems?: CardPriceItem[]
}

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }
const MAX_CARD_PHOTOS = 5
const MAX_TAGS = 2
const MAX_PRICE_ROWS = 3

// Zkratky jednotek do ceny — „od 500 Kč/m²"
const UNIT_LABEL: Record<string, string> = {
  ukon: '', hodina: '/hod', m2: '/m²', bm: '/bm', den: '/den', kus: '/ks', projekt: '',
}

// „dnes 14:30" / „zítra 9:00" / „čt 22. 8. 14:00".
// V marketplace se rozhoduje podle toho, jak brzo se člověk dostane na řadu —
// plné datum s rokem („Úterý 22.09.2026 12:00") tuhle informaci spíš zakrývalo.
function labelSlot(iso: string): string {
  const d = new Date(iso)
  const dnes = new Date()
  const zitra = new Date(dnes.getTime() + 86400000)
  const stejnyDen = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (stejnyDen(d, dnes)) return `dnes ${cas(iso)}`
  if (stejnyDen(d, zitra)) return `zítra ${cas(iso)}`
  return `${denKratce(iso)} ${cas(iso)}`
}

export default function ServiceCard({
  service, index = 0, categoryName, subcatNames = [], hasFreeSlot = false,
  nextFreeSlot = null, freeSlots = [], isFavorited = false, isLoggedIn = false, preview = false,
  minItemPrice = null, minItemUnit = null, itemCount = 0, gallery = [], priceItems = [],
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

  // ── Fotky ──────────────────────────────────────────────────
  const photos = (gallery.length > 0 ? gallery : (service.image_url ? [service.image_url] : []))
    .slice(0, MAX_CARD_PHOTOS)
  const [photoIdx, setPhotoIdx] = useState(0)
  const stripRef = useRef<HTMLDivElement | null>(null)

  // Posun šipkami — posouvá stejným pásem, ve kterém se listuje prstem,
  // takže se obojí nepere o to, která fotka je vidět.
  const listuj = (e: MouseEvent, smer: 1 | -1) => {
    e.preventDefault(); e.stopPropagation()
    const el = stripRef.current
    if (!el) return
    const cil = (photoIdx + smer + photos.length) % photos.length
    el.scrollTo({ left: cil * el.clientWidth, behavior: 'smooth' })
    setPhotoIdx(cil)
  }

  const naScroll = () => {
    const el = stripRef.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== photoIdx) setPhotoIdx(i)
  }

  // ── Volné termíny ──────────────────────────────────────────
  const terminy = freeSlots.length > 0
    ? freeSlots
    : (nextFreeSlot ? [nextFreeSlot] : [])
  const maVolno = terminy.length > 0 || hasFreeSlot
  const dalsi = Math.max(0, terminy.length - 1)

  // Cena
  const jednotka = minItemUnit ? (UNIT_LABEL[minItemUnit] ?? '') : ''

  // Štítky — podkategorie, přebytek jako „+2"
  const viditelneTagy = subcatNames.slice(0, MAX_TAGS)
  const skryteTagy = subcatNames.length - viditelneTagy.length

  // Ukázka ceníku místo fotky
  const ukazkaCeniku = priceItems.filter((i) => i.name).slice(0, MAX_PRICE_ROWS)

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
    >
      {/* ── HORNÍ BLOK: fotka / ceník / pruh s kategorií ── */}
      {photos.length > 0 ? (
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-slate-100">
          <div
            ref={stripRef}
            onScroll={naScroll}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {photos.map((src, i) => (
              <Link
                key={src + i}
                href={detailHref}
                className="relative block h-full w-full flex-none snap-center"
              >
                <Image
                  src={src}
                  alt={i === 0 ? service.title : `${service.title} — fotka ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 360px"
                  className="object-cover"
                />
              </Link>
            ))}
          </div>

          {photos.length > 1 && (
            <>
              <button onClick={(e) => listuj(e, -1)} aria-label="Předchozí fotka"
                className="absolute left-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white sm:grid">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={(e) => listuj(e, 1)} aria-label="Další fotka"
                className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white sm:grid">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {photos.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === photoIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
                ))}
              </div>
            </>
          )}

          {/* Nejbližší volno rovnou na fotce — v patičce zabíralo řádek navíc */}
          {terminy.length > 0 && (
            <span className="pointer-events-none absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-slate-900/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
              <Zap className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
              <span className="truncate">Volno {labelSlot(terminy[0])}</span>
            </span>
          )}

          {!preview && (
            <div className="absolute right-2 top-2">
              <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
            </div>
          )}
        </div>
      ) : ukazkaCeniku.length > 0 ? (
        // Bez fotky ukážeme ceník — karta zůstane v řádku stejně vysoká
        // a místo prázdna nese informaci, podle které se dá rozhodnout.
        <div className="relative aspect-[16/10] w-full shrink-0 bg-gradient-to-br from-emerald-50/70 to-sky-50 p-3">
          <Link href={detailHref} className="flex h-full flex-col justify-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ceník úkonů</p>
            <ul className="space-y-1">
              {ukazkaCeniku.map((it, i) => (
                <li
                  key={it.name + i}
                  className={`flex items-baseline justify-between gap-2 pb-1 text-[12px] text-slate-600 ${
                    i < ukazkaCeniku.length - 1 ? 'border-b border-dashed border-slate-200' : ''
                  }`}
                >
                  <span className="truncate">{it.name}</span>
                  <span className="shrink-0 font-bold text-slate-900">
                    {it.price != null && it.price > 0
                      ? `${Number(it.price).toLocaleString('cs-CZ')} Kč${it.unit ? (UNIT_LABEL[it.unit] ?? '') : ''}`
                      : 'dohodou'}
                  </span>
                </li>
              ))}
            </ul>
          </Link>

          {terminy.length > 0 && (
            <span className="pointer-events-none absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-slate-900/85 px-2 py-1 text-[11px] font-bold text-white">
              <Zap className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
              <span className="truncate">Volno {labelSlot(terminy[0])}</span>
            </span>
          )}

          {!preview && (
            <div className="absolute right-2 top-2">
              <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
            </div>
          )}
        </div>
      ) : (
        // Ani fotka, ani ceník (jen nacenění na místě) — úzký pruh s kategorií.
        <Link href={detailHref} className="relative flex h-14 shrink-0 items-center gap-2.5 bg-gradient-to-r from-emerald-50 to-blue-50 px-4">
          <span className="text-xl">{meta.emoji}</span>
          <span className="text-[13px] font-semibold text-slate-600">{obor}</span>
          {!preview && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <FavoriteButton providerId={providerId} initialFavorited={isFavorited} isLoggedIn={isLoggedIn} variant="icon" />
            </span>
          )}
        </Link>
      )}

      {/* ── TĚLO ── */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <Link href={detailHref} className="block">
            <h3 className="line-clamp-2 text-[15px] font-extrabold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-emerald-700">
              {service.title}
            </h3>
          </Link>
          {(service as any).subtitle && (
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500">{(service as any).subtitle}</p>
          )}
        </div>

        {/* Štítky podkategorií */}
        {viditelneTagy.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {viditelneTagy.map(name => (
              <span key={name} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
                {name}
              </span>
            ))}
            {skryteTagy > 0 && (
              <span className="px-0.5 py-0.5 text-[10.5px] font-medium text-slate-400">+{skryteTagy}</span>
            )}
          </div>
        )}

        {/* Důvěra na jednom řádku, dole nad patičkou — díky tomu se řádky
            karet srovnají i při různě dlouhých názvech. */}
        <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-slate-500">
          {hasRating ? (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {Number(rating).toFixed(1)}
              <span className="font-normal text-slate-400">({reviewCount})</span>
            </span>
          ) : (
            <span className="text-slate-400">Bez hodnocení</span>
          )}
          {verified && (
            <>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Ověřeno
              </span>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{service.city}</span>
          </span>
        </div>
      </div>

      {/* ── SPODNÍ LIŠTA: cena a akce ── */}
      <div className="flex items-end justify-between gap-2 border-t border-slate-100 p-3">
        <div className="min-w-0">
          {minItemPrice != null && minItemPrice > 0 ? (
            <>
              <p className="text-[14.5px] font-extrabold leading-none text-slate-900">
                od {Number(minItemPrice).toLocaleString('cs-CZ')} Kč<span className="text-[11px] font-bold text-slate-500">{jednotka}</span>
              </p>
              <p className="mt-0.5 text-[10.5px] text-slate-400">
                {itemCount > 1 ? `${itemCount} úkonů v ceníku` : 'Cena od'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold leading-none text-slate-700">Cena dohodou</p>
              <p className="mt-0.5 text-[10.5px] text-slate-400">Podle rozsahu práce</p>
            </>
          )}
        </div>

        <Link
          href={maVolno ? terminyHref : detailHref}
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-bold transition ${
            maVolno
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'border-[1.5px] border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50'
          }`}
        >
          {maVolno ? <><Zap className="h-3.5 w-3.5" /> Termíny</> : 'Zobrazit'}
        </Link>
      </div>
    </motion.article>
  )
}