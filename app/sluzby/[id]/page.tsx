// app/sluzby/[id]/page.tsx
// Detail KARTY (poskytovatel/pobočka) v modelu „karta + ceník".
// Nahoře identita: název, podtitul, galerie, poskytovatel, adresa + mapa.
// Pod tím CENÍK úkonů (service_items) — každý s cenou, délkou, zálohou a tlačítkem.
//
// Podmínky výjezdu (model B) se z karty už NEPŘEDÁVAJÍ — žijí na úkonu
// (service_items) a čte si je přímo objednávkový modal.
//
// Nad ceníkem je blok VOLNÉ TERMÍNY — vypsaná okna poskytovatele. To je
// hlavní featura Propojo (zaplnit díru v rozvrhu), proto je nahoře a ne
// schovaná v objednávkovém modalu. Ceník samotný zůstává čistý.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_META } from '@/types/database'
import type { ServiceItem } from '@/types/database'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Star, ArrowLeft, ShieldCheck, ListChecks, Zap, ChevronRight, Building2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import PriceListPublic from '@/components/ui/PriceListPublic'
import ServiceMap from '@/components/ui/ServiceMap'
import ServiceGallery from '@/components/ui/ServiceGallery'
import { getServiceBrand } from '@/lib/actions/brands'
import type { Metadata } from 'next'

interface Props { params: { id: string } }

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }

// Nejnižší cena zveřejněného úkonu — pro „od X Kč" v metadatech a hlavičce.
function cheapestActive(items: ServiceItem[]): ServiceItem | null {
  return items
    .filter(i => i.is_active && i.payment_model !== 'B' && i.price != null && i.price > 0)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase
    .from('services')
    .select('title, subtitle, description, city, category')
    .eq('id', params.id)
    .single() as { data: any }
  if (!data) return { title: 'Karta nenalezena' }

  const { data: items } = await supabase
    .from('service_items')
    .select('*')
    .eq('service_id', params.id) as { data: ServiceItem[] | null }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  const cheapest = cheapestActive(items ?? [])
  const priceText = cheapest
    ? `od ${Number(cheapest.price).toLocaleString('cs-CZ')} Kč`
    : 'Ceník na kartě'
  const desc = `${(data.subtitle ? data.subtitle + '. ' : '')}${(data.description ?? '').slice(0, 130)}… ${priceText} · ${data.city}`

  return {
    title: `${data.title}`,
    description: desc,
    openGraph: {
      title: `${data.title} | Propojo`,
      description: desc,
      url: `${APP_URL}/sluzby/${params.id}`,
      type: 'website',
    },
    alternates: { canonical: `${APP_URL}/sluzby/${params.id}` },
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const supabase = createClient()
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

  const { data: service, error } = await supabase
    .from('services')
    .select(`*, profiles (id, full_name, display_name, company_name, ico, ico_verified, avatar_url, rating, review_count, city, bio, phone, is_suspended)`)
    .eq('id', params.id)
    .single() as { data: any; error: any }

  if (error || !service) notFound()
  if (service.profiles?.is_suspended === true) notFound()

  const s = service
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[s.category] ?? DEFAULT_META
  const { data: { user } } = await supabase.auth.getUser()

  // Ceník úkonů této karty
  const { data: itemsRaw } = await supabase
    .from('service_items')
    .select('*')
    .eq('service_id', s.id)
    .order('sort_order', { ascending: true }) as { data: ServiceItem[] | null }
  const items = itemsRaw ?? []
  const cheapest = cheapestActive(items)

  // Volná budoucí okna, ve kterých se tato karta nabízí (slot_services → availability_slots).
  // Modal z nich zákazníkovi nabídne termíny (filtruje podle délky úkonu na klientu).
  const { data: slotLinks } = await supabase
    .from('slot_services')
    .select('slot_id')
    .eq('service_id', s.id) as { data: { slot_id: string }[] | null }
  const slotIds = Array.from(new Set((slotLinks ?? []).map((l) => l.slot_id)))
  let freeSlots: { id: string; starts_at: string; ends_at: string }[] = []
  if (slotIds.length > 0) {
    const { data: slotRows } = await supabase
      .from('availability_slots')
      .select('id, starts_at, ends_at')
      .in('id', slotIds)
      .eq('status', 'volno')
      // Zbytky po rezervaci čekají na rozhodnutí poskytovatele — nenabízíme je.
      .eq('pending_confirm', false)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true }) as { data: { id: string; starts_at: string; ends_at: string }[] | null }
    freeSlots = slotRows ?? []
  }

  // Tři jména
  const providerDisplayName =
    s.profiles?.display_name || s.profiles?.company_name || s.profiles?.full_name || 'Poskytovatel'
  const providerLegalName = s.profiles?.company_name || s.profiles?.full_name
  const showLegalName = !!providerLegalName && providerLegalName !== providerDisplayName
  const providerRating = Number(s.profiles?.rating ?? 0)
  const providerReviews = Number(s.profiles?.review_count ?? 0)

  // Název kategorie z DB
  const { data: catRow } = await supabase
    .from('categories').select('name').eq('slug', s.category).single() as { data: { name: string } | null }
  const categoryName = catRow?.name ?? meta.label

  // Značka (salon/firma), pod kterou karta patří. Bez značky je null.
  const brand = await getServiceBrand(s.id)

  // Podkategorie
  const { data: subcatLinks } = await supabase
    .from('service_subcategories').select('subcategories(name)').eq('service_id', s.id)
  const subcatNames = (subcatLinks ?? [])
    .map((r: any) => r.subcategories?.name)
    .filter(Boolean) as string[]

  // Galerie: titulní foto první, pak gallery pole
  const galleryPhotos: string[] = [
    ...(s.image_url ? [s.image_url] : []),
    ...((s.gallery as string[] | null) ?? []),
  ]

  // Adresa + mapa (jen když je provozovna, adresa veřejná a máme souřadnice)
  const hasEstablishment = s.location_type === 'u_poskytovatele' || s.location_type === 'oboji'
  const addressPublic = s.address_public !== false
  const showAddress = hasEstablishment && addressPublic && !!s.address
  const showMap = showAddress && s.address_lat != null && s.address_lng != null

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: providerDisplayName,
    description: s.description,
    ...(cheapest ? {
      makesOffer: {
        '@type': 'Offer',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: cheapest.price,
          priceCurrency: 'CZK',
        },
      },
    } : {}),
    areaServed: { '@type': 'City', name: s.city },
    ...(showAddress ? { address: { '@type': 'PostalAddress', streetAddress: s.address, addressLocality: s.city } } : {}),
    ...(s.profiles.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: s.profiles.rating, reviewCount: s.profiles.review_count } } : {}),
    url: `${APP_URL}/sluzby/${s.id}`,
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/marketplace" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět na Marketplace
        </Link>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── LEVÝ SLOUPEC: identita + galerie + ceník ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Galerie (prolistovatelná) nebo fallback dlaždice */}
            {galleryPhotos.length > 0 ? (
              <ServiceGallery photos={galleryPhotos} title={s.title} />
            ) : (
              <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-blue-50 sm:h-80">
                <span className="text-8xl">{meta.emoji}</span>
                <div className="absolute left-4 top-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-700 backdrop-blur-sm">{meta.emoji} {meta.label}</span>
                </div>
              </div>
            )}

            {/* Název + podtitul */}
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{s.title}</h1>
              {s.subtitle && <p className="mt-1 text-lg text-slate-500">{s.subtitle}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                {cheapest && (
                  <span className="text-2xl font-black text-emerald-600">
                    od {Number(cheapest.price).toLocaleString('cs-CZ')} Kč
                  </span>
                )}
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-4 w-4 text-slate-400" />{s.city}
                </div>
              </div>

              {/* Kategorie + podkategorie */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                  {meta.emoji} {categoryName}
                </span>
                {subcatNames.map((name) => (
                  <span key={name} className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Popis */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">O nabídce</h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-700">{s.description}</p>
            </div>

            {/* ── VOLNÉ TERMÍNY (last-minute) ── */}
            {freeSlots.length > 0 && (
              <div id="volne-terminy" className="scroll-mt-24 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-5">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Zap className="h-5 w-5 fill-emerald-500 text-emerald-500" /> Volné termíny
                </h2>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                  Tyhle časy má {providerDisplayName} volné. Vyberte termín, zvolte úkon a zálohou
                  si ho rovnou zamluvte — potvrzení je okamžité.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {freeSlots.map((slot) => {
                    const den = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(slot.starts_at))
                    const od = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(slot.starts_at))
                    const doC = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(slot.ends_at))
                    return (
                      <Link
                        key={slot.id}
                        href={`/termin/${slot.id}`}
                        className="group inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50"
                      >
                        <span>{den}</span>
                        <span className="tabular-nums text-emerald-700">{od}–{doC}</span>
                        <ChevronRight className="h-4 w-4 text-emerald-400 transition group-hover:translate-x-0.5" />
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── CENÍK ── */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
                <ListChecks className="h-5 w-5 text-emerald-600" /> Ceník úkonů
              </h2>
              <PriceListPublic
                items={items}
                serviceId={s.id}
                providerId={s.provider_id}
                isLoggedIn={!!user}
                locationType={s.location_type}
                slots={freeSlots}
                providerGeo={{
                  lat: (s as any).city_lat ?? null,
                  lng: (s as any).city_lng ?? null,
                  radiusKm: (s as any).radius_km ?? null,
                }}
                providerName={providerDisplayName}
                categoryName={categoryName}
                city={s.city}
              />
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Nevyhovuje žádný z volných termínů? Vyberte úkon a pošlete poptávku — poskytovatel vám navrhne čas.
              </p>
            </div>
          </div>

          {/* ── PRAVÝ SLOUPEC: poskytovatel + adresa/mapa ── */}
          <div className="space-y-4">

            {/* Poskytovatel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Link href={`/profil/${s.provider_id}`} className="flex items-center gap-3 transition-opacity hover:opacity-80">
                <Avatar name={providerDisplayName} url={s.profiles.avatar_url} size={48} />
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{providerDisplayName}</p>
                  {providerRating > 0 ? (
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-sm text-slate-600">
                        {providerRating.toFixed(1)} ({providerReviews} {providerReviews < 5 ? 'recenze' : 'recenzí'})
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Zatím bez recenzí</span>
                  )}
                </div>
              </Link>

              {(showLegalName || s.profiles.ico) && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  {s.profiles.ico_verified && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  {showLegalName && <span className="font-semibold text-slate-600">{providerLegalName}</span>}
                  {showLegalName && s.profiles.ico && <span className="text-slate-300">·</span>}
                  {s.profiles.ico && <span>IČO {s.profiles.ico}</span>}
                </p>
              )}

              {/* Značka (salon/firma), pod kterou karta patří */}
              {brand && (
                <Link
                  href={`/znacka/${brand.slug}`}
                  className="mt-2.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{brand.name}</span>
                    <span className="block text-xs text-slate-500">
                      Součást značky{brand.city ? ` · ${brand.city}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              )}

              {s.profiles.bio && <p className="mt-3 text-sm leading-relaxed text-slate-600 line-clamp-4">{s.profiles.bio}</p>}
              <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-4 w-4 text-slate-400" />{s.profiles.city ?? s.city}
              </div>

              <Link
                href={`/profil/${s.provider_id}`}
                className="mt-3 block text-center text-xs font-semibold text-emerald-600 hover:underline"
              >
                Zobrazit celý profil →
              </Link>
            </div>

            {/* Adresa + mapa */}
            {showAddress && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                  <MapPin className="h-4 w-4 text-slate-400" /> Kde nás najdete
                </h3>
                <p className="mb-3 text-sm text-slate-700">{s.address}</p>
                {showMap && (
                  <ServiceMap lat={Number(s.address_lat)} lng={Number(s.address_lng)} label={s.title} />
                )}
              </div>
            )}

            {/* Když je provozovna, ale adresa skrytá */}
            {hasEstablishment && !addressPublic && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" /> {s.city} — přesnou adresu dostanete po objednání.
                </p>
              </div>
            )}

            <p className="text-center text-xs text-slate-400">
              Přidáno {new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' }).format(new Date(s.created_at))}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}