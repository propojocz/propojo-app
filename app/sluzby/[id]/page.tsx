// app/sluzby/[id]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_META } from '@/types/database'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Star, ArrowLeft, Clock, Wallet, FileSearch, Truck, CalendarClock, ShieldCheck, CalendarX } from 'lucide-react'
import OrderButton from '@/components/ui/OrderButton'
import Avatar from '@/components/ui/Avatar'
import { getCancellation } from '@/lib/cancellation'
import type { Metadata } from 'next'
import SlotPicker from '@/components/ui/SlotPicker'

interface Props { params: { id: string } }

const DEFAULT_META = { label: 'Služba', emoji: '🔧' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase
    .from('services')
    .select('title, description, city, price, price_unit, category, payment_model')
    .eq('id', params.id)
    .single() as { data: any }
  if (!data) return { title: 'Služba nenalezena' }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  const priceText =
    data.payment_model === 'B'
      ? 'Nacenění na místě'
      : (data.price ?? 0) > 0
        ? `${Number(data.price).toLocaleString('cs-CZ')} Kč/${data.price_unit}`
        : 'Cena dohodou'
  const desc = `${(data.description ?? '').slice(0, 140)}… ${priceText} · ${data.city}`

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

  // Pozastavený poskytovatel → služba není dostupná
  if (service.profiles?.is_suspended === true) notFound()

  const s = service
  const meta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[s.category] ?? DEFAULT_META
  const { data: { user } } = await supabase.auth.getUser()

  // TŘI JMÉNA: marketingový název vidí zákazník, ověřená identita je dohledatelná na profilu.
  const providerDisplayName =
    s.profiles?.display_name || s.profiles?.company_name || s.profiles?.full_name || 'Poskytovatel'
  const providerLegalName = s.profiles?.company_name || s.profiles?.full_name
  const showLegalName = !!providerLegalName && providerLegalName !== providerDisplayName
  const providerRating = Number(s.profiles?.rating ?? 0)
  const providerReviews = Number(s.profiles?.review_count ?? 0)

  const { data: moreServices } = await supabase
    .from('services')
    .select('id, title, price, price_unit, category, payment_model, quote_fee')
    .eq('provider_id', s.provider_id)
    .eq('is_active', true)
    .neq('id', s.id)
    .limit(4)

  // Název kategorie (z DB podle slugu) – pro štítek na detailu
  const { data: catRow } = await supabase
    .from('categories')
    .select('name')
    .eq('slug', s.category)
    .single() as { data: { name: string } | null }
  const categoryName = catRow?.name ?? meta.label

  // Podkategorie této služby (přes propojovací tabulku)
  const { data: subcatLinks } = await supabase
    .from('service_subcategories')
    .select('subcategories(name)')
    .eq('service_id', s.id)
  const subcatNames = (subcatLinks ?? [])
    .map((r: any) => r.subcategories?.name)
    .filter(Boolean) as string[]

  // Volné budoucí termíny této služby (jen Model A)
  let freeSlots: { id: string; starts_at: string; ends_at: string }[] = []
  if (s.payment_model !== 'B') {
    const { data: slotLinks } = await supabase
      .from('slot_services')
      .select('availability_slots(id, starts_at, ends_at, status)')
      .eq('service_id', s.id)
    freeSlots = (slotLinks ?? [])
      .map((l: any) => l.availability_slots)
      .filter((sl: any) => sl && sl.status === 'volno' && new Date(sl.starts_at) > new Date())
      .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 8)
  }

  // ── Cenové údaje ──────────────────────────────────────────
  const isModelB = s.payment_model === 'B'
  const price = Number(s.price ?? 0)
  const priceMax = Number(s.price_max ?? 0)
  const deposit = Number(s.deposit_amount ?? 0)
  const quoteFee = Number(s.quote_fee ?? 0)
  const pricePerKm = Number(s.price_per_km ?? 0)
  const freeKm = Number(s.free_km ?? 0)
  const quoteDays = Number(s.quote_days ?? 0)
  const duration = Number(s.duration_minutes ?? 0)

  // Storno politika (jen Model A, jen když není 'zadna')
  const cancellation = getCancellation(s.cancellation_policy)
  const showCancellation = !isModelB && cancellation.key !== 'zadna'

  // Hlavní cenový text (Model A)
  let mainPrice = 'Cena dohodou'
  if (!isModelB) {
    if (s.price_type === 'range' && price > 0 && priceMax > 0) {
      mainPrice = `${price.toLocaleString('cs-CZ')}–${priceMax.toLocaleString('cs-CZ')} Kč`
    } else if (price > 0) {
      mainPrice = `${price.toLocaleString('cs-CZ')} Kč`
    }
  }

  const formatDuration = (min: number) => {
    if (min <= 0) return null
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h} h ${m} min` : `${h} h`
  }

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.title,
    description: s.description,
    ...(price > 0 ? {
      offers: {
        '@type': 'Offer',
        price: price,
        priceCurrency: 'CZK',
      },
    } : {}),
    areaServed: { '@type': 'City', name: s.city },
    provider: {
      '@type': 'Person',
      name: providerDisplayName,
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
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50"><span className="text-8xl">{meta.emoji}</span></div>
              )}
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-700 backdrop-blur-sm">{meta.emoji} {meta.label}</span>
              </div>
            </div>

            <div>
              <h1 className="mb-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{s.title}</h1>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-baseline gap-1">
                  {isModelB ? (
                    <span className="text-2xl font-black text-emerald-600">Nacenění na místě</span>
                  ) : (
                    <>
                      <span className="text-3xl font-black text-emerald-600">{mainPrice}</span>
                      {price > 0 && <span className="text-slate-500">/{s.price_unit}</span>}
                    </>
                  )}
                </div>
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

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">O nabídce</h2>
              <p className="whitespace-pre-line text-slate-700 leading-relaxed">{s.description}</p>
            </div>

            {moreServices && moreServices.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-bold text-slate-900">Další služby od tohoto živnostníka</h2>
                <div className="grid grid-cols-2 gap-3">
                  {moreServices.map((ms: any) => {
                    const msMeta = (CATEGORY_META as Record<string, { label: string; emoji: string }>)[ms.category] ?? DEFAULT_META
                    const msPrice = ms.payment_model === 'B'
                      ? 'Nacenění na místě'
                      : (ms.price ?? 0) > 0
                        ? `${Number(ms.price).toLocaleString('cs-CZ')} Kč/${ms.price_unit}`
                        : 'Cena dohodou'
                    return (
                      <Link key={ms.id} href={`/sluzby/${ms.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-emerald-200 hover:bg-emerald-50">
                        <span className="text-xl">{msMeta.emoji}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">{ms.title}</p>
                          <p className="text-xs text-slate-500">{msPrice}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">

            {/* ── HLAVNÍ AKCE ──────────────────────────────────────────────
                Nahoře, s cenou uvnitř. Zákazník se rozhoduje právě tady, takže
                cena i tlačítko musí být pohromadě — ne rozházené po stránce.
                Bílá karta se zelenou linkou vystoupí ze šedého pozadí, aniž by křičela. */}
            <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-lg shadow-emerald-600/10">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-baseline gap-1">
                  {isModelB ? (
                    <span className="text-xl font-black text-slate-900">Nacenění na místě</span>
                  ) : (
                    <>
                      <span className="text-2xl font-black text-slate-900">{mainPrice}</span>
                      {price > 0 && <span className="text-sm text-slate-500">/{s.price_unit}</span>}
                    </>
                  )}
                </div>
                {isModelB
                  ? quoteFee > 0 && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        výjezd {quoteFee.toLocaleString('cs-CZ')} Kč
                      </span>
                    )
                  : deposit > 0 && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        záloha {deposit.toLocaleString('cs-CZ')} Kč
                      </span>
                    )}
              </div>

              <OrderButton
                serviceId={s.id}
                providerId={s.provider_id}
                isLoggedIn={!!user}
                priceAgreed={price}
                paymentModel={s.payment_model}
                locationType={s.location_type}
              />

              <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
                {isModelB
                  ? 'Nezávazné. Konečnou cenu potvrdíte až po prohlídce.'
                  : deposit > 0
                    ? 'Záloha se započítá do konečné ceny.'
                    : 'Rezervace je nezávazná.'}
              </p>
            </div>

            {/* Volné termíny (Model A) */}
            {!isModelB && freeSlots.length > 0 && (
              <SlotPicker
                serviceId={s.id}
                slots={freeSlots}
                isLoggedIn={!!user}
                locationType={s.location_type}
              />
            )}

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

              {/* Ověřená identita — zákazník musí vědět, s kým uzavírá smlouvu.
                  Propojo je jen zprostředkovatel; smlouva vzniká přímo s poskytovatelem. */}
              {(showLegalName || s.profiles.ico) && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  {s.profiles.ico_verified && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  {showLegalName && <span className="font-semibold text-slate-600">{providerLegalName}</span>}
                  {showLegalName && s.profiles.ico && <span className="text-slate-300">·</span>}
                  {s.profiles.ico && <span>IČO {s.profiles.ico}</span>}
                </p>
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

            {/* Jak to probíhá – Model A / B */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Jak to probíhá</h3>

              {isModelB ? (
                <ul className="space-y-3 text-sm text-slate-700">
                  <li className="flex gap-2.5">
                    <FileSearch className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      <strong>Nacenění na místě</strong>
                      {quoteFee > 0
                        ? <> za <strong>{quoteFee.toLocaleString('cs-CZ')} Kč</strong>. Pokud nabídku přijmete, poplatek se započítá do celkové ceny.</>
                        : <> zdarma. Řemeslník přijede, prohlédne práci a navrhne cenu.</>}
                    </span>
                  </li>
                  {(freeKm > 0 || pricePerKm > 0) && (
                    <li className="flex gap-2.5">
                      <Truck className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        {freeKm > 0 ? <>Doprava zdarma do <strong>{freeKm} km</strong>.</> : null}
                        {pricePerKm > 0 ? <> Nad rámec <strong>{pricePerKm.toLocaleString('cs-CZ')} Kč/km</strong>.</> : null}
                      </span>
                    </li>
                  )}
                  {quoteDays > 0 && (
                    <li className="flex gap-2.5">
                      <CalendarClock className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>Nabídku dodá do <strong>{quoteDays} dnů</strong>.</span>
                    </li>
                  )}
                </ul>
              ) : (
                <ul className="space-y-3 text-sm text-slate-700">
                  {deposit > 0 && (
                    <li className="flex gap-2.5">
                      <Wallet className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        Rezervační záloha <strong>{deposit.toLocaleString('cs-CZ')} Kč</strong> — <strong>započítá se</strong> do konečné ceny.
                      </span>
                    </li>
                  )}
                  {formatDuration(duration) && (
                    <li className="flex gap-2.5">
                      <Clock className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>Délka služby přibližně <strong>{formatDuration(duration)}</strong>.</span>
                    </li>
                  )}
                  <li className="flex gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Záloha jde přes zabezpečenou platební bránu a řemeslníkovi se uvolní až po
                      provedení práce. Když nedorazí, vrátíme vám ji celou.
                    </span>
                  </li>
                </ul>
              )}
            </div>

            {/* Storno podmínky (Model A se zvolenou politikou) */}
            {showCancellation && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                  <CalendarX className="h-4 w-4 text-slate-400" /> Storno podmínky
                </h3>
                <p className="text-sm font-bold text-slate-800">{cancellation.label} — {cancellation.short}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{cancellation.detail}</p>
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