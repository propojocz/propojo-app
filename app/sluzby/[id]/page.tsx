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
//
// Časy se formátují přes lib/format.ts — tahle stránka běží na serveru (UTC)
// a bez pevné zóny by termíny ukazovala o dvě hodiny dřív.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_META } from '@/types/database'
import type { ServiceItem } from '@/types/database'
import Link from 'next/link'
import { MapPin, Star, ArrowLeft, ShieldCheck, ListChecks, ChevronRight, Building2, Pencil, CalendarDays, CheckCircle2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import PriceListPublic from '@/components/ui/PriceListPublic'
import ServiceMap from '@/components/ui/ServiceMap'
import ServiceGallery from '@/components/ui/ServiceGallery'
import ReviewCard from '@/components/ui/ReviewCard'
import ServiceFaq from '@/components/ui/ServiceFaq'
import ServiceFaqEditor from '@/components/ui/ServiceFaqEditor'
import AskProviderButton from '@/components/ui/AskProviderButton'
import { getServiceBrand } from '@/lib/actions/brands'
import { denKratce, rozsahCasu, datum } from '@/lib/format'
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
    .select(`*, profiles (id, full_name, display_name, company_name, ico, ico_verified, avatar_url, rating, review_count, city, bio, phone, is_suspended, address, address_lat, address_lng, address_public)`)
    .eq('id', params.id)
    .single() as { data: any; error: any }

  if (error || !service) notFound()
  if (service.profiles?.is_suspended === true) notFound()

  const s = service
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[s.category] ?? DEFAULT_META
  const { data: { user } } = await supabase.auth.getUser()
  // Vlastník vidí na své kartě rovnou nástroje k úpravě — nemusí kvůli
  // jedné větě procházet celý formulář nabídky.
  const jeMoje = !!user && user.id === service.provider_id

  // Ceník úkonů této karty
  const { data: itemsRaw } = await supabase
    .from('service_items')
    .select('*')
    .eq('service_id', s.id)
    .order('sort_order', { ascending: true }) as { data: ServiceItem[] | null }
  const items = itemsRaw ?? []
  const cheapest = cheapestActive(items)
  const hasActiveServiceItems = items.some(i => i.is_active && (i as any).item_type !== 'product')
  const hasActiveProductItems = items.some(i => i.is_active && (i as any).item_type === 'product')
  // Smíšená karta = má vedle sebe službu i výrobek. Řídí terminologii („Volné
  // termíny služeb" místo obecného „Nejbližší volné termíny"), ať je jasné,
  // že se termíny týkají jen služeb, ne výrobků na téže kartě.
  const isMixedOffer = hasActiveServiceItems && hasActiveProductItems

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

  // Recenze poskytovatele. Zákazník se rozhoduje TADY, ne na profilu —
  // proto ukazujeme pár nejnovějších rovnou u nabídky.
  const { data: reviewRows } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, provider_response, response_created_at, reported_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('provider_id', s.provider_id)
    .is('reported_at', null)
    .order('created_at', { ascending: false })
    .limit(3) as { data: any[] | null }
  const reviews = reviewRows ?? []

  // Časté dotazy u téhle karty — ubírají zákazníkovi důvod psát zprávu.
  const { data: faqRows } = await supabase
    .from('service_faqs')
    .select('id, question, answer')
    .eq('service_id', s.id)
    .order('sort_order', { ascending: true }) as { data: any[] | null }
  const faqs = faqRows ?? []

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
  // Adresa se dědí z PROFILU, když ji karta nemá vlastní. Kdo má jednu
  // provozovnu, ji vyplňuje jen jednou; druhá pobočka si přepíše kartu.
  // Zděděná adresa se řídí přepínačem z profilu, vlastní přepínačem karty.
  const zdedenaAdresa = !s.address && s.profiles?.address_public === true && !!s.profiles?.address
  const adresa = s.address || (zdedenaAdresa ? s.profiles.address : null)
  const adresaLat = s.address ? s.address_lat : (zdedenaAdresa ? s.profiles.address_lat : null)
  const adresaLng = s.address ? s.address_lng : (zdedenaAdresa ? s.profiles.address_lng : null)
  const addressPublic = s.address ? s.address_public !== false : zdedenaAdresa

  // Adresu ukazujeme i u karet s výjezdem — dílna nebo kancelář je důkaz,
  // že za nabídkou někdo stojí. Dřív se schovávala všem, kdo jezdí za zákazníkem.
  const hasEstablishment = s.location_type === 'u_poskytovatele' || s.location_type === 'oboji'
  const showAddress = addressPublic && !!adresa
  const showMap = showAddress && adresaLat != null && adresaLng != null

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
    ...(showAddress ? { address: { '@type': 'PostalAddress', streetAddress: adresa, addressLocality: s.city } } : {}),
    ...(s.profiles.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: s.profiles.rating, reviewCount: s.profiles.review_count } } : {}),
    url: `${APP_URL}/sluzby/${s.id}`,
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-28 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <Link
          href="/marketplace"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800 sm:mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Zpět na Marketplace
        </Link>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── HLAVNÍ OBSAH ── */}
          <div className="min-w-0 space-y-5 sm:space-y-6">
            {/* Galerie – používá stávající komponentu, takže logo i globální navigace zůstávají beze změny. */}
            {galleryPhotos.length > 0 ? (
              <div className="overflow-hidden rounded-2xl bg-white">
                <ServiceGallery photos={galleryPhotos} title={s.title} />
              </div>
            ) : (
              <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-blue-50 sm:h-72">
                <span className="text-7xl sm:text-8xl">{meta.emoji}</span>
                <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-sm sm:text-sm">
                    {meta.emoji} {meta.label}
                  </span>
                </div>
              </div>
            )}

            {/* Identita služby – kompaktní mobile-first blok podle druhého návrhu. */}
            <section>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                  <span>{meta.emoji}</span>{categoryName}
                </span>
                {s.profiles?.ico_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Ověřený poskytovatel
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">{s.title}</h1>
                  {s.subtitle && <p className="mt-1 text-base text-slate-500 sm:text-lg">{s.subtitle}</p>}
                </div>
                {jeMoje && (
                  <Link
                    href={`/dashboard/nabidky/${s.id}/upravit`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Upravit
                  </Link>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" /> {s.city}
                  {(s as any).radius_km ? ` · okolí do ${(s as any).radius_km} km` : ''}
                </span>
                {providerRating > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <strong className="text-slate-800">{providerRating.toFixed(1)}</strong>
                    <span>({providerReviews})</span>
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                {cheapest && (
                  <span className="text-2xl font-black text-emerald-600 sm:text-3xl">
                    Nabídka od {Number(cheapest.price).toLocaleString('cs-CZ')} Kč
                  </span>
                )}
                {subcatNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-0.5">
                    {subcatNames.slice(0, 4).map((name) => (
                      <span key={name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ── TERMÍNY – převzatá logika z prvního návrhu: 3 kompaktní termíny + další. ── */}
            {hasActiveServiceItems && freeSlots.length > 0 && (
              <section id="volne-terminy" className="scroll-mt-24">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-950">{isMixedOffer ? 'Volné termíny služeb' : 'Nejbližší volné termíny'}</h2>
                  {freeSlots.length > 3 && (
                    <a href="#dalsi-terminy" className="shrink-0 text-sm font-bold text-emerald-700 hover:underline">
                      Další termíny →
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {freeSlots.slice(0, 3).map((slot, index) => (
                    <Link
                      key={slot.id}
                      href={`/termin/${slot.id}`}
                      className={`group rounded-2xl border px-2.5 py-3 text-center transition sm:px-4 sm:py-3.5 ${
                        index === 0
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/60'
                      }`}
                    >
                      <span className="mx-auto mb-1 flex w-fit items-center gap-1.5 text-xs font-black sm:text-sm">
                        <CalendarDays className={`h-4 w-4 ${index === 0 ? 'text-emerald-600' : 'text-slate-400'}`} />
                        {denKratce(slot.starts_at)}
                      </span>
                      <span className={`block whitespace-nowrap text-[11px] font-semibold tabular-nums sm:text-sm ${index === 0 ? 'text-emerald-800' : 'text-slate-500'}`}>
                        {rozsahCasu(slot.starts_at, slot.ends_at)}
                      </span>
                    </Link>
                  ))}
                </div>

                {freeSlots.length > 3 && (
                  <details id="dalsi-terminy" className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <summary className="cursor-pointer list-none text-center text-sm font-bold text-emerald-700">
                      Zobrazit další termíny ({freeSlots.length - 3})
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {freeSlots.slice(3).map((slot) => (
                        <Link
                          key={slot.id}
                          href={`/termin/${slot.id}`}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          <span className="block">{denKratce(slot.starts_at)}</span>
                          <span className="mt-0.5 block tabular-nums text-slate-500">{rozsahCasu(slot.starts_at, slot.ends_at)}</span>
                        </Link>
                      ))}
                    </div>
                  </details>
                )}

                <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  Nehodí se vám žádný termín?
                  <a href="#cenik" className="font-bold text-emerald-700 hover:underline">Navrhnout jiný</a>
                </p>
              </section>
            )}

            {/* Hlavní akce – podle druhého návrhu. */}
            {!jeMoje && (
              <section className="space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <a
                    href="#cenik"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-600 sm:text-base"
                  >
                    <ListChecks className="h-5 w-5" /> Vybrat z nabídky
                  </a>
                  <div className="min-w-0 [&>*]:h-full [&>*]:w-full">
                    <AskProviderButton serviceId={s.id} isLoggedIn={!!user} variant="siroke" />
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-slate-500 sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Rychlá domluva · komunikace zůstává v Propoju
                </p>
              </section>
            )}

            {/* ── CENÍK ── */}
            <section id="cenik" className="scroll-mt-24">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                  <ListChecks className="h-5 w-5 text-emerald-600" /> Nabídka a ceník
                </h2>
                {items.filter(i => i.is_active).length > 3 && (
                  <span className="text-xs font-bold text-emerald-700 sm:text-sm">{items.filter(i => i.is_active).length} položek</span>
                )}
              </div>
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
              <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                Vyberte konkrétní položku. Před objednáním vždy uvidíte cenu, způsob platby a další podmínky.
              </p>
            </section>

            {/* O nabídce – zachováno, ale až po rozhodovacích informacích. */}
            {(s.description ?? '').trim().length > 0 && (
              <section className="border-t border-slate-200 pt-5 sm:pt-6">
                <h2 className="mb-2 text-lg font-black text-slate-950">O nabídce</h2>
                <p className="whitespace-pre-line text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{s.description}</p>
              </section>
            )}

            {/* Recenze – stále součást detailu služby, ale bez zbytečného velkého boxu kolem celé sekce. */}
            {reviews.length > 0 && (
              <section className="border-t border-slate-200 pt-5 sm:pt-6">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                      <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> Recenze ({providerReviews})
                    </h2>
                    {providerRating > 0 && (
                      <p className="mt-1 text-sm text-slate-500">
                        <strong className="text-slate-800">{providerRating.toFixed(1)} ★</strong> průměrné hodnocení
                      </p>
                    )}
                  </div>
                  {providerReviews > 3 && (
                    <Link href={`/profil/${s.provider_id}`} className="shrink-0 text-sm font-bold text-emerald-700 hover:underline">
                      Všechny recenze →
                    </Link>
                  )}
                </div>

                <div className="space-y-3">
                  {reviews.slice(0, 2).map((r: any) => (
                    <ReviewCard
                      key={r.id}
                      isOwner={false}
                      review={{
                        id: r.id,
                        rating: r.rating,
                        comment: r.comment,
                        created_at: r.created_at,
                        provider_response: r.provider_response,
                        response_created_at: r.response_created_at,
                        reported_at: r.reported_at,
                        reviewerName: r.profiles?.full_name ?? null,
                        reviewerAvatar: r.profiles?.avatar_url ?? null,
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── BOČNÍ SLOUPEC; na mobilu pokračuje přirozeně pod recenzemi. ── */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {/* Poskytovatel */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <Link href={`/profil/${s.provider_id}`} className="flex items-center gap-3 transition-opacity hover:opacity-80">
                <Avatar name={providerDisplayName} url={s.profiles.avatar_url} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black text-slate-950">{providerDisplayName}</p>
                  <p className="truncate text-sm text-slate-500">{s.subtitle || categoryName} · {s.profiles.city ?? s.city}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {s.profiles?.ico_verified && (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> Ověřený poskytovatel
                      </span>
                    )}
                    {providerReviews > 0 && <span className="text-slate-500">· {providerReviews} recenzí</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>

              {(showLegalName || s.profiles.ico) && (
                <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {showLegalName && <span className="font-semibold text-slate-600">{providerLegalName}</span>}
                    {showLegalName && s.profiles.ico && <span className="text-slate-300">·</span>}
                    {s.profiles.ico && <span>IČO {s.profiles.ico}</span>}
                  </div>
                </div>
              )}

              {brand && (
                <Link
                  href={`/znacka/${brand.slug}`}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{brand.name}</span>
                    <span className="block text-xs text-slate-500">Součást značky{brand.city ? ` · ${brand.city}` : ''}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              )}

              <Link
                href={`/profil/${s.provider_id}`}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Zobrazit profil
              </Link>
            </section>

            {/* Časté dotazy – o patro výš, tedy před mapou / adresou. */}
            <section>
              {jeMoje
                ? <ServiceFaqEditor serviceId={s.id} faqs={faqs} />
                : <ServiceFaq faqs={faqs} />}
            </section>

            {/* Adresa + mapa */}
            {showAddress && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
                  <MapPin className="h-4 w-4 text-emerald-600" /> Kde nás najdete
                </h3>
                <p className="mb-3 text-sm text-slate-600">{adresa}</p>
                {showMap && <ServiceMap lat={Number(adresaLat)} lng={Number(adresaLng)} label={s.title} />}
              </section>
            )}

            {hasEstablishment && !addressPublic && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm sm:p-5">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {s.city} — přesnou adresu dostanete po objednání.
                </p>
              </section>
            )}

            <p className="text-center text-xs text-slate-400">Přidáno {datum(s.created_at)}</p>
          </aside>
        </div>
      </div>

      {/* Mobilní sticky CTA podle druhého návrhu. Na desktopu se nepřekrývá s obsahem. */}
      {!jeMoje && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            {cheapest && (
              <div className="min-w-0 flex-1 pl-1">
                <p className="truncate text-sm font-black text-slate-950">Nabídka od {Number(cheapest.price).toLocaleString('cs-CZ')} Kč</p>
                <p className="text-[11px] text-slate-400">Orientační cena</p>
              </div>
            )}
            <a
              href="#cenik"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-600"
            >
              <ListChecks className="h-4 w-4" /> Vybrat z nabídky
            </a>
          </div>
        </div>
      )}
    </main>
  )
}