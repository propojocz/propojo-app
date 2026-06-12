// app/sluzby/[id]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ServiceWithProvider } from '@/types/database'
import { CATEGORY_META } from '@/types/database'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Star, ArrowLeft } from 'lucide-react'
import OrderButton from '@/components/ui/OrderButton'
import type { Metadata } from 'next'

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('services').select('title, description, city, price, price_unit, category').eq('id', params.id).single()
  if (!data) return { title: 'Služba nenalezena' }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  const desc = `${data.description.slice(0, 155)}… ${data.price.toLocaleString('cs-CZ')} Kč/${data.price_unit} · ${data.city}`

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
    .select(`*, profiles (id, full_name, avatar_url, rating, review_count, city, bio, phone)`)
    .eq('id', params.id)
    .single()

  if (error || !service) notFound()

  const s = service as any
  const meta = CATEGORY_META[s.category]
  const { data: { user } } = await supabase.auth.getUser()

  const { data: moreServices } = await supabase
    .from('services')
    .select('id, title, price, price_unit, category')
    .eq('provider_id', s.provider_id)
    .eq('is_active', true)
    .neq('id', s.id)
    .limit(4)

  // JSON-LD Service structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.title,
    description: s.description,
    offers: {
      '@type': 'Offer',
      price: s.price,
      priceCurrency: 'CZK',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: s.price, priceCurrency: 'CZK', unitText: s.price_unit },
    },
    areaServed: { '@type': 'City', name: s.city },
    provider: {
      '@type': 'Person',
      name: s.profiles.full_name,
      ...(s.profiles.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: s.profiles.rating, reviewCount: s.profiles.review_count } } : {}),
    },
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
          <div className="space-y-6 lg:col-span-2">
            <div className="relative h-64 overflow-hidden rounded-2xl bg-slate-100 sm:h-80">
              {s.image_url ? (
                <Image src={s.image_url} alt={s.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 66vw" priority />
              ) : (
                <div className="flex h-full items-center justify-center"><span className="text-8xl">{meta.emoji}</span></div>
              )}
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-700 backdrop-blur-sm">{meta.label}</span>
              </div>
            </div>

            <div>
              <h1 className="mb-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{s.title}</h1>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-indigo-600">{s.price.toLocaleString('cs-CZ')} Kč</span>
                  <span className="text-slate-500">/{s.price_unit}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-4 w-4 text-slate-400" />{s.city}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">O nabídce</h2>
              <p className="whitespace-pre-line text-slate-700 leading-relaxed">{s.description}</p>
            </div>

            {moreServices && moreServices.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-bold text-slate-900">Další služby od tohoto živnostníka</h2>
                <div className="grid grid-cols-2 gap-3">
                  {moreServices.map((ms: any) => (
                    <Link key={ms.id} href={`/sluzby/${ms.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-indigo-200 hover:bg-indigo-50">
                      <span className="text-xl">{CATEGORY_META[ms.category as keyof typeof CATEGORY_META]?.emoji}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{ms.title}</p>
                        <p className="text-xs text-slate-500">{ms.price.toLocaleString('cs-CZ')} Kč/{ms.price_unit}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Link href={`/profil/${s.provider_id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-black text-indigo-700">
                  {s.profiles.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{s.profiles.full_name}</p>
                  {s.profiles.rating && Number(s.profiles.rating) > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-sm text-slate-600">{Number(s.profiles.rating).toFixed(1)} ({s.profiles.review_count} recenzí)</span>
                    </div>
                  )}
                </div>
              </Link>
              {s.profiles.bio && <p className="mt-3 text-sm leading-relaxed text-slate-600 line-clamp-4">{s.profiles.bio}</p>}
              <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-4 w-4 text-slate-400" />{s.profiles.city ?? s.city}
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
              <p className="mb-3 text-sm font-semibold text-indigo-800">Máte zájem o tuto službu?</p>
              <OrderButton serviceId={s.id} providerId={s.provider_id} isLoggedIn={!!user} priceAgreed={s.price} />
            </div>

            <p className="text-center text-xs text-slate-400">
              Přidáno {new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' }).format(new Date(s.created_at))}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
