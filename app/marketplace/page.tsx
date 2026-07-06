// app/marketplace/page.tsx
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ServiceWithProvider } from '@/types/database'
import ServiceCard from '@/components/ui/ServiceCard'
import ServiceListSkeleton from '@/components/ui/ServiceListSkeleton'
import FilterBar from '@/components/ui/FilterBar'
import FilterSidebar from '@/components/ui/FilterSidebar'
import Link from 'next/link'
import { PlusCircle, Send } from 'lucide-react'
import type { Metadata } from 'next'

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

async function serviceIdsBySubcatText(q: string): Promise<string[]> {
  const supabase = createClient()
  const { data: subs } = await supabase.from('subcategories').select('id').ilike('name', `%${q}%`)
  const subIds = (subs ?? []).map((s: any) => s.id)
  if (subIds.length === 0) return []
  const { data: links } = await supabase.from('service_subcategories').select('service_id').in('subcategory_id', subIds)
  return Array.from(new Set((links ?? []).map((l: any) => l.service_id)))
}

async function ServiceList({
  category, city, q, sort, priceMin, priceMax, minRating, subcats,
}: {
  category?: string; city?: string; q?: string; sort?: string
  priceMin?: string; priceMax?: string; minRating?: string; subcats?: string
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
    .select(`*, profiles (id, full_name, avatar_url, rating, review_count, city, is_suspended, ico_verified)`)
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
      const idList = provIds.map((id) => `"${id}"`).join(',')
      query = query.or(`city.ilike.%${city}%,provider_id.in.(${idList})`)
    } else {
      query = query.ilike('city', `%${city}%`)
    }
  }

  if (q) {
    const subcatServiceIds = await serviceIdsBySubcatText(q)
    if (subcatServiceIds.length > 0) {
      const idList = subcatServiceIds.map((id) => `"${id}"`).join(',')
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,id.in.(${idList})`)
    } else {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    }
  }

  if (priceMin) query = query.gte('price', Number(priceMin))
  if (priceMax) query = query.lte('price', Number(priceMax))

  switch (sort) {
    case 'nejlevnejsi': query = query.order('price', { ascending: true }); break
    case 'nejdrazsi': query = query.order('price', { ascending: false }); break
    default: query = query.order('created_at', { ascending: false })
  }

  const { data: services } = await query.limit(60)
  let sorted = ((services as ServiceWithProvider[]) ?? []).filter((s) => (s.profiles as any)?.is_suspended !== true)

  if (minRating) {
    const min = Number(minRating)
    sorted = sorted.filter((s) => Number(s.profiles?.rating ?? 0) >= min)
  }
  if (sort === 'hodnoceni') {
    sorted = [...sorted].sort((a, b) => Number(b.profiles?.rating ?? 0) - Number(a.profiles?.rating ?? 0))
  }

  if (sorted.length === 0) {
    const params = new URLSearchParams()
    const hledane = q || category
    if (hledane) params.set('category', hledane)
    if (city) params.set('city', city)
    const poptavkaHref = `/poptavka${params.toString() ? `?${params.toString()}` : ''}`
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center">
        <div className="mb-4 text-6xl">🔍</div>
        <h3 className="mb-2 text-xl font-bold text-slate-800">Zatím tu nikoho nemáme</h3>
        <p className="mb-6 max-w-sm text-sm text-slate-500">
          Pro zadaná kritéria jsme nenašli žádné služby. Nevadí – zanechte nám poptávku a my se postaráme.
          Jakmile najdeme vhodného poskytovatele ve vašem okolí, ozveme se vám.
        </p>
        <Link href={poptavkaHref} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-bold text-white transition hover:bg-emerald-600">
          <Send className="h-4 w-4" /> Zanechat poptávku
        </Link>
        <p className="mt-6 text-xs text-slate-400">
          Jste živnostník?{' '}
          <Link href="/pridat-sluzbu" className="font-semibold text-emerald-600 hover:underline">Přidejte svoji nabídku</Link>
        </p>
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
            />
          )
        })}
      </div>
    </div>
  )
}

export default async function MarketplacePage({ searchParams }: Props) {
  const { category, city, q, sort, priceMin, priceMax, minRating, subcats } = searchParams
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
            />
          </aside>

          <div className="min-w-0 flex-1">
            <Suspense
              key={`${category}-${city}-${q}-${sort}-${priceMin}-${priceMax}-${minRating}-${subcats}`}
              fallback={<ServiceListSkeleton />}
            >
              <ServiceList category={category} city={city} q={q} sort={sort} priceMin={priceMin} priceMax={priceMax} minRating={minRating} subcats={subcats} />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  )
}