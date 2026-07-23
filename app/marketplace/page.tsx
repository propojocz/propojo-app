// app/marketplace/page.tsx
// Model „karta + ceník": výsledkem hledání je KARTA, ale hledání, cena a řazení
// čtou z ceníku (service_items). Karta ukazuje „od X Kč" a počet úkonů — proto
// se ke každé nalezené kartě dotáhnou její zveřejněné úkony a z nich se spočítá
// minimální cena (řazení/filtr ceny běží v kódu, ne v DB — u desítek karet stačí).

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { ServiceWithProvider, ServiceItem } from '@/types/database'
import ServiceCard from '@/components/ui/ServiceCard'
import ServiceListSkeleton from '@/components/ui/ServiceListSkeleton'
import FilterBar from '@/components/ui/FilterBar'
import FilterSidebar from '@/components/ui/FilterSidebar'
import Link from 'next/link'
import { PlusCircle, Send } from 'lucide-react'
import type { Metadata } from 'next'
import { haversineKm } from '@/lib/geo'
import ProviderInvite from '@/components/ui/ProviderInvite'

interface Props {
  searchParams: {
    category?: string
    city?: string
    q?: string
    sort?: string
    priceMin?: string
    priceMax?: string
    minRating?: string
    subcats?: string
    dosah?: string
  }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  const { city, q } = searchParams
  let title = 'Marketplace živnostníků'
  if (city) title = `Živnostníci v ${city} – Propojo`
  if (q) title = `"${q}" – Propojo`
  return {
    title,
    description: 'Najděte ověřeného živnostníka ve vašem okolí.',
    openGraph: { title, description: 'Najděte ověřeného živnostníka ve vašem okolí.', url: `${APP_URL}/marketplace` },
    alternates: { canonical: `${APP_URL}/marketplace` },
  }
}

async function getCategories() {
  const supabase = createClient()
  const { data } = await supabase.from('categories').select('id, slug, name, icon, color').order('sort_order')
  return data ?? []
}

async function getSubcategories(categorySlug?: string) {
  if (!categorySlug) return []
  const supabase = createClient()
  const { data: cat } = await supabase.from('categories').select('id').eq('slug', categorySlug).single()
  if (!cat) return []
  const { data } = await supabase.from('subcategories').select('id, name').eq('category_id', (cat as any).id).order('name')
  return (data as { id: string; name: string }[]) ?? []
}

// Karty, jejichž podkategorie odpovídají textu (fulltext přes názvy podkategorií).
async function serviceIdsBySubcatText(q: string): Promise<string[]> {
  const supabase = createClient()
  const { data: subs } = await supabase.from('subcategories').select('id').ilike('name', `%${q}%`)
  const subIds = (subs ?? []).map((s: any) => s.id)
  if (subIds.length === 0) return []
  const { data: links } = await supabase.from('service_subcategories').select('service_id').in('subcategory_id', subIds)
  return Array.from(new Set((links ?? []).map((l: any) => l.service_id)))
}

// Karty, které mají ZVEŘEJNĚNÝ úkon odpovídající textu (zákazník hledá „střih",
// což je název úkonu v ceníku, ne název karty).
async function serviceIdsByItemText(q: string): Promise<string[]> {
  const supabase = createClient()
  const { data: hits } = await supabase
    .from('service_items').select('service_id').eq('is_active', true).ilike('name', `%${q}%`)
  return Array.from(new Set((hits ?? []).map((r: any) => r.service_id)))
}

async function ServiceList({
  category, city, q, sort, priceMin, priceMax, minRating, subcats, dosah,
}: {
  category?: string; city?: string; q?: string; sort?: string
  priceMin?: string; priceMax?: string; minRating?: string; subcats?: string; dosah?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const subIds = (subcats ?? '').split(',').filter(Boolean)

  let serviceIdsBySubcat: string[] | null = null
  if (subIds.length > 0) {
    const { data: links } = await supabase.from('service_subcategories').select('service_id').in('subcategory_id', subIds)
    serviceIdsBySubcat = Array.from(new Set((links ?? []).map((l: any) => l.service_id)))
    if (serviceIdsBySubcat.length === 0) serviceIdsBySubcat = ['00000000-0000-0000-0000-000000000000']
  }

  let query = supabase
    .from('services')
    .select(`*, profiles (id, full_name, display_name, company_name, avatar_url, rating, review_count, city, is_suspended, ico_verified, stripe_onboarding_done)`)
    .eq('is_active', true)

  if (serviceIdsBySubcat) {
    query = query.in('id', serviceIdsBySubcat)
  } else if (category) {
    const { data: cat } = await supabase.from('categories').select('id').eq('slug', category).single()
    if (cat) {
      const { data: subs } = await supabase.from('subcategories').select('id').eq('category_id', (cat as any).id)
      if (subs && subs.length > 0) {
        query = query.in('subcategory_id', subs.map((s: any) => s.id))
      } else {
        query = query.eq('category', category)
      }
    }
  }

  if (city) {
    const { data: provRows } = await supabase.from('profiles').select('id').ilike('city', `%${city}%`)
    const provIds = (provRows ?? []).map((p: any) => p.id)
    if (provIds.length > 0) {
      const idList = provIds.map((id: string) => `"${id}"`).join(',')
      query = query.or(`city.ilike.%${city}%,provider_id.in.(${idList})`)
    } else {
      query = query.ilike('city', `%${city}%`)
    }
  }

  if (q) {
    // Hledáme kartu podle: názvu karty, popisu, názvu podkategorie A názvu ÚKONU.
    const [subcatServiceIds, itemServiceIds] = await Promise.all([
      serviceIdsBySubcatText(q),
      serviceIdsByItemText(q),
    ])
    const extraIds = Array.from(new Set([...subcatServiceIds, ...itemServiceIds]))
    if (extraIds.length > 0) {
      const idList = extraIds.map((id) => `"${id}"`).join(',')
      query = query.or(`title.ilike.%${q}%,subtitle.ilike.%${q}%,description.ilike.%${q}%,id.in.(${idList})`)
    } else {
      query = query.or(`title.ilike.%${q}%,subtitle.ilike.%${q}%,description.ilike.%${q}%`)
    }
  }

  // Cenu už NEfiltrujeme/neřadíme v SQL (services.price je legacy). Řešíme níž v kódu
  // nad minimální cenou z úkonů. V SQL řadíme jen podle data, cenu doženeme po dotažení úkonů.
  query = query.order('created_at', { ascending: false })

  const { data: services } = await query.limit(60)

  // ── VIDITELNOST = AKTIVNÍ PŘEDPLATNÉ ──────────────────────────────────
  const candidateProviderIds = Array.from(
    new Set(((services as ServiceWithProvider[]) ?? []).map((s) => (s.profiles as any)?.id ?? s.provider_id))
  )

  const activeSubscribers = new Set<string>()
  if (candidateProviderIds.length > 0) {
    // POZOR: číst přes SERVICE ROLE (subscriptions má RLS „každý vidí jen svoje").
    const adminDb = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: subs } = await adminDb
      .from('subscriptions')
      .select('user_id, status')
      .in('user_id', candidateProviderIds)
      .in('status', ['active', 'trialing'])
    for (const row of (subs ?? []) as any[]) activeSubscribers.add(row.user_id)
  }

  let sorted = ((services as ServiceWithProvider[]) ?? []).filter((s) => {
    const pid = (s.profiles as any)?.id ?? s.provider_id
    return (
      (s.profiles as any)?.is_suspended !== true &&
      activeSubscribers.has(pid)
    )
  })

  if (minRating) {
    const min = Number(minRating)
    sorted = sorted.filter((s) => Number(s.profiles?.rating ?? 0) >= min)
  }

  // ── Filtr "Jen v mém dosahu" ──
  if (dosah === '1' && city) {
    const { data: cityRow } = await supabase
      .from('obce').select('latitude, longitude').ilike('obec', city).limit(1).maybeSingle() as
      { data: { latitude: number; longitude: number } | null }

    if (cityRow) {
      sorted = sorted.filter((s: any) => {
        if (s.location_type === 'u_poskytovatele') return false
        if (!s.radius_km || s.city_lat == null || s.city_lng == null) return false
        const dist = haversineKm(cityRow.latitude, cityRow.longitude, s.city_lat, s.city_lng)
        return dist <= s.radius_km
      })
    }
  }

  // ── CENÍK: ke každé kartě dotáhneme zveřejněné úkony a spočítáme min cenu + počet ──
  const idsForItems = sorted.map((s) => s.id)
  const itemsByService: Record<string, ServiceItem[]> = {}
  if (idsForItems.length > 0) {
    const { data: itemRows } = await supabase
      .from('service_items')
      .select('*')
      .in('service_id', idsForItems)
      .eq('is_active', true)
    for (const it of (itemRows ?? []) as ServiceItem[]) {
      ;(itemsByService[it.service_id] ??= []).push(it)
    }
  }

  // Min cena z úkonů (jen model A s kladnou cenou). Karty bez ceněného úkonu → null (dohodou/nacenění).
  const minPriceOf = (sid: string): number | null => {
    const list = (itemsByService[sid] ?? []).filter(
      (i) => i.payment_model !== 'B' && i.price != null && i.price > 0
    )
    if (list.length === 0) return null
    return Math.min(...list.map((i) => Number(i.price)))
  }
  const itemCountOf = (sid: string): number => (itemsByService[sid] ?? []).length

  // Filtr ceny podle min ceny úkonů. Karty bez ceny (dohodou/nacenění) projdou,
  // jen když uživatel cenový filtr nepoužil — jinak by zmizely neprávem.
  const hasPriceFilter = !!priceMin || !!priceMax
  if (hasPriceFilter) {
    const lo = priceMin ? Number(priceMin) : 0
    const hi = priceMax ? Number(priceMax) : Infinity
    sorted = sorted.filter((s) => {
      const mp = minPriceOf(s.id)
      if (mp == null) return false
      return mp >= lo && mp <= hi
    })
  }

  // Řazení
  if (sort === 'nejlevnejsi' || sort === 'nejdrazsi') {
    const dir = sort === 'nejlevnejsi' ? 1 : -1
    sorted = [...sorted].sort((a, b) => {
      const pa = minPriceOf(a.id)
      const pb = minPriceOf(b.id)
      // Karty bez ceny řadíme vždy na konec, ať nemíchají žebříček.
      if (pa == null && pb == null) return 0
      if (pa == null) return 1
      if (pb == null) return -1
      return (pa - pb) * dir
    })
  } else if (sort === 'hodnoceni') {
    sorted = [...sorted].sort((a, b) => Number(b.profiles?.rating ?? 0) - Number(a.profiles?.rating ?? 0))
  }

  if (sorted.length === 0) {
    const params = new URLSearchParams()
    const hledane = q || category
    if (hledane) params.set('category', hledane)
    if (city) params.set('city', city)
    const poptavkaHref = `/poptavky/nova${params.toString() ? `?${params.toString()}` : ''}`
    const categorySlug = params.get('category')
    let hledanyObor: string | undefined
    if (categorySlug) {
      const { data: cat } = await supabase
        .from('categories')
        .select('name')
        .eq('slug', categorySlug)
        .maybeSingle() as { data: { name: string } | null }
      hledanyObor = cat?.name ?? undefined
    }
    const hledaneMesto = params.get('city') ?? undefined

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-14 text-center">
          <h3 className="mb-2 text-xl font-bold text-slate-800">Zatím tu nikoho nemáme</h3>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-500">
            Pro zadaná kritéria jsme nenašli žádnou nabídku. Zanechte nám poptávku — uvidí ji
            ověření řemeslníci a mohou se vám ozvat sami.
          </p>
          <Link
            href={poptavkaHref}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-bold text-white transition hover:bg-emerald-600"
          >
            <Send className="h-4 w-4" /> Zanechat poptávku
          </Link>
        </div>

        <ProviderInvite category={hledanyObor} city={hledaneMesto} />
      </div>
    )
  }

  const serviceIds = sorted.map((s) => s.id)
  const providerIds = Array.from(new Set(sorted.map((s) => (s.profiles as any)?.id ?? s.provider_id)))
  const catSlugs = Array.from(new Set(sorted.map((s) => s.category).filter(Boolean)))

  const { data: catRows } = catSlugs.length > 0
    ? await supabase.from('categories').select('slug, name').in('slug', catSlugs)
    : { data: [] as any[] }
  const catName: Record<string, string> = Object.fromEntries((catRows ?? []).map((c: any) => [c.slug, c.name]))

  const { data: subLinks } = serviceIds.length > 0
    ? await supabase.from('service_subcategories').select('service_id, subcategories(name)').in('service_id', serviceIds)
    : { data: [] as any[] }
  const subsByService: Record<string, string[]> = {}
  for (const l of (subLinks ?? []) as any[]) {
    const nm = l.subcategories?.name
    if (!nm) continue
    ;(subsByService[l.service_id] ??= []).push(nm)
  }

  const freeSlotProviders = new Set<string>()
  if (providerIds.length > 0) {
    const { data: slotRows } = await supabase
      .from('availability_slots').select('provider_id')
      .in('provider_id', providerIds).eq('status', 'volno').gte('starts_at', new Date().toISOString())
    for (const r of (slotRows ?? []) as any[]) freeSlotProviders.add(r.provider_id)
  }

  const favSet = new Set<string>()
  if (user && providerIds.length > 0) {
    const { data: favRows } = await supabase
      .from('favorites').select('provider_id').eq('user_id', user.id).in('provider_id', providerIds)
    for (const r of (favRows ?? []) as any[]) favSet.add(r.provider_id)
  }

  return (
    <div>
      <p className="mb-6 text-sm text-slate-500">
        Nalezeno <strong className="text-slate-800">{sorted.length}</strong> {sorted.length === 1 ? 'nabídka' : sorted.length < 5 ? 'nabídky' : 'nabídek'}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sorted.map((service, i) => {
          const pid = (service.profiles as any)?.id ?? service.provider_id
          return (
            <ServiceCard
              key={service.id}
              service={service}
              index={i}
              categoryName={catName[service.category]}
              subcatNames={subsByService[service.id] ?? []}
              hasFreeSlot={freeSlotProviders.has(pid)}
              isFavorited={favSet.has(pid)}
              isLoggedIn={!!user}
              minItemPrice={minPriceOf(service.id)}
              itemCount={itemCountOf(service.id)}
              gallery={(service as any).gallery ?? []}
            />
          )
        })}
      </div>
    </div>
  )
}

export default async function MarketplacePage({ searchParams }: Props) {
  const { category, city, q, sort, priceMin, priceMax, minRating, subcats, dosah } = searchParams
  const categories = await getCategories()
  const subcategories = await getSubcategories(category)

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">Živnostenský marketplace</p>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Najděte zkušeného řemeslníka</h1>
              <p className="mt-1.5 text-slate-500">Ověření živnostníci ve vašem okolí. Žádné přirážky, přímý kontakt.</p>
            </div>
            <Link href="/pridat-sluzbu" className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-emerald-500 px-5 py-2.5 font-bold text-white transition hover:bg-emerald-600 sm:self-auto">
              <PlusCircle className="h-4 w-4" /> Nabídnout službu
            </Link>
          </div>
        </div>
      </div>

      <FilterBar currentCity={city} currentSort={sort} currentQ={q} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="lg:w-64 lg:shrink-0">
            <FilterSidebar
              categories={categories}
              subcategories={subcategories}
              activeCategory={category}
              currentPriceMin={priceMin}
              currentPriceMax={priceMax}
              currentMinRating={minRating}
              currentSubcats={subcats}
              currentCity={city}
              currentDosah={dosah}
            />
          </aside>

          <div className="min-w-0 flex-1">
            <Suspense
              key={`${category}-${city}-${q}-${sort}-${priceMin}-${priceMax}-${minRating}-${subcats}-${dosah}`}
              fallback={<ServiceListSkeleton />}
            >
              <ServiceList category={category} city={city} q={q} sort={sort} priceMin={priceMin} priceMax={priceMax} minRating={minRating} subcats={subcats} dosah={dosah} />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  )
}