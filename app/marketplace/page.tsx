// app/marketplace/page.tsx
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ServiceWithProvider } from '@/types/database'
import ServiceCard from '@/components/ui/ServiceCard'
import ServiceListSkeleton from '@/components/ui/ServiceListSkeleton'
import FilterBar from '@/components/ui/FilterBar'
import CategoryBar from '@/components/ui/CategoryBar'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import type { Metadata } from 'next'

interface Props {
  searchParams: { category?: string; city?: string; q?: string; sort?: string }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  const { city, q } = searchParams
  let title = 'Tržiště živnostníků'
  if (city) title = `Živnostníci v ${city} – Propojo`
  if (q) title = `"${q}" – Propojo`
  return {
    title,
    description: 'Najděte ověřeného živnostníka ve vašem okolí.',
    openGraph: { title, description: 'Najděte ověřeného živnostníka ve vašem okolí.', url: `${APP_URL}/marketplace` },
    alternates: { canonical: `${APP_URL}/marketplace` },
  }
}

// Načti kategorie – cached na serveru
async function getCategories() {
  const supabase = createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name, icon, color')
    .order('sort_order')
  return data ?? []
}

async function ServiceList({ category, city, q, sort }: { category?: string; city?: string; q?: string; sort?: string }) {
  const supabase = createClient()

  let query = supabase
    .from('services')
    .select(`*, profiles (id, full_name, avatar_url, rating, review_count, city)`)
    .eq('is_active', true)

  if (category) {
    // Najdi category_id a filtruj přes subcategory_id
    const { data: cat } = await supabase.from('categories').select('id').eq('slug', category).single()
    if (cat) {
      const { data: subs } = await supabase.from('subcategories').select('id').eq('category_id', cat.id)
      if (subs && subs.length > 0) {
        query = query.in('subcategory_id', subs.map(s => s.id))
      } else {
        query = query.eq('category', category)
      }
    }
  }

  if (city) query = query.ilike('city', `%${city}%`)
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)

  switch (sort) {
    case 'nejlevnejsi': query = query.order('price', { ascending: true }); break
    case 'nejdrazsi': query = query.order('price', { ascending: false }); break
    default: query = query.order('created_at', { ascending: false })
  }

  const { data: services } = await query.limit(48)
  let sorted = (services as ServiceWithProvider[]) ?? []

  if (sort === 'hodnoceni') {
    sorted = [...sorted].sort((a, b) => Number(b.profiles?.rating ?? 0) - Number(a.profiles?.rating ?? 0))
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-6xl">🔍</div>
        <h3 className="mb-2 text-xl font-bold text-slate-800">Žádné výsledky</h3>
        <p className="max-w-sm text-sm text-slate-500">
          Pro zadaná kritéria jsme nenašli žádné služby.{' '}
          <Link href="/pridat-sluzbu" className="text-indigo-600 hover:underline">Přidejte svoji nabídku</Link>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-6 text-sm text-slate-500">
        Nalezeno <strong className="text-slate-800">{sorted.length}</strong> nabídek
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((service, i) => <ServiceCard key={service.id} service={service} index={i} />)}
      </div>
    </div>
  )
}

export default async function MarketplacePage({ searchParams }: Props) {
  const { category, city, q, sort } = searchParams
  const categories = await getCategories()

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">Živnostenská tržiště</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Najdi zkušeného řemeslníka</h1>
              <p className="mt-1.5 text-slate-500">Ověření živnostníci ve tvém okolí. Žádné přirážky, přímý kontakt.</p>
            </div>
            <Link href="/pridat-sluzbu" className="btn-primary shrink-0 self-start sm:self-auto">
              <PlusCircle className="h-4 w-4" /> Nabídnout službu
            </Link>
          </div>
        </div>
      </div>

      {/* Klientský CategoryBar – okamžité přepínání bez čekání */}
      <CategoryBar categories={categories} activeCategory={category} />

      <FilterBar currentCity={city} currentSort={sort} currentQ={q} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Suspense key={`${category}-${city}-${q}-${sort}`} fallback={<ServiceListSkeleton />}>
          <ServiceList category={category} city={city} q={q} sort={sort} />
        </Suspense>
      </div>
    </main>
  )
}
