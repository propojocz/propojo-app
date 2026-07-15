// app/profil/[id]/page.tsx
//
// TŘI JMÉNA:
//   display_name  … marketingový název („Salon Bella") — velký nadpis, to vidí zákazník první
//   company_name  … OVĚŘENÁ obchodní firma z ARES       — vždy uvedena pod nadpisem
//   full_name     … osobní jméno                        — záloha, když firma chybí
//
// PROČ JE OVĚŘENÁ IDENTITA VIDĚT: poskytovatel smí vystupovat pod marketingovým názvem,
// ale zákazník musí mít možnost zjistit, S KÝM právně jedná. Kdyby to Propojo skrývalo,
// pomáhalo by zakrýt totožnost podnikatele — a přestalo by být čistým zprostředkovatelem.
// Proto je identita hned u odznaku „Ověřený živnostník" a je odkaz na ověření v ARES.

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, BadgeCheck, Star, Eye, Zap, CheckCircle2, Clock, ChevronRight, Pencil, ExternalLink } from 'lucide-react'
import FavoriteButton from '@/components/ui/FavoriteButton'
import { isFavorited } from '@/lib/actions/favorites'
import ProfileViewTracker from '@/components/ui/ProfileViewTracker'
import Avatar from '@/components/ui/Avatar'
import ProfileGallery from '@/components/ui/ProfileGallery'
import ProfileBookingBox from '@/components/ui/ProfileBookingBox'
import ReviewCard from '@/components/ui/ReviewCard'
import { getResponseHours, getCompletedCount, getUpcomingSlots } from '@/lib/provider-stats'

interface Props { params: { id: string } }

type ProviderProfile = {
  id: string
  full_name: string | null
  company_name: string | null
  display_name: string | null
  ico: string | null
  avatar_url: string | null
  city: string | null
  bio: string | null
  is_provider: boolean
  ico_verified: boolean | null
  rating: number | null
  review_count: number | null
  view_count: number | null
  gallery: string[] | null
  is_suspended: boolean | null
  created_at: string | null
}

type ServiceRow = {
  id: string
  title: string
  price: number | null
  price_max: number | null
  price_type: string | null
  price_unit: string | null
  category: string | null
  payment_model: string | null
  deposit_amount: number | null
  quote_fee: number | null
  duration_minutes: number | null
  location_type: string | null
  is_active: boolean | null
}

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  provider_response: string | null
  response_created_at: string | null
  reported_at: string | null
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value)
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="h-4 w-4" fill={i <= full ? 'currentColor' : 'none'} strokeWidth={1.5} />
      ))}
    </span>
  )
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, company_name, display_name')
    .eq('id', params.id)
    .single() as { data: { full_name: string | null; company_name: string | null; display_name: string | null } | null }
  const name = data?.display_name || data?.company_name || data?.full_name || 'Poskytovatel'
  return { title: `${name} | Propojo` }
}

export default async function ProfilPage({ params }: Props) {
  const supabase = createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, company_name, display_name, ico, avatar_url, city, bio, is_provider, ico_verified, rating, review_count, view_count, gallery, is_suspended, created_at')
    .eq('id', params.id)
    .single() as { data: ProviderProfile | null }

  if (!profile || profile.is_provider !== true || profile.is_suspended === true) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const favorited = user ? await isFavorited(params.id) : false

  // Marketingový název (co vidí zákazník jako první)
  const displayName = profile.display_name || profile.company_name || profile.full_name || 'Poskytovatel'
  // Ověřená právní identita (kdo za tím skutečně stojí)
  const legalName = profile.company_name || profile.full_name
  // Ukázat ji zvlášť, jen pokud se liší od marketingového názvu — jinak by se opakovala
  const showLegalName = !!legalName && legalName !== displayName
  const aresUrl = profile.ico ? `https://ares.gov.cz/ekonomicke-subjekty?ico=${profile.ico}` : null

  const isOwner = false // odpovídání se řeší v dashboardu (/dashboard/recenze), profil jen zobrazuje
  const viewerIsOwner = user?.id === profile.id // vlastník si prohlíží svůj profil

  const { data: services } = await supabase
    .from('services')
    .select('id, title, price, price_max, price_type, price_unit, category, payment_model, deposit_amount, quote_fee, duration_minutes, location_type, is_active')
    .eq('provider_id', params.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false }) as { data: ServiceRow[] | null }

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, provider_response, response_created_at, reported_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('provider_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20) as { data: ReviewRow[] | null }

  // Metriky pro pruh důvěry + sticky box
  const [responseHours, completedCount, upcomingSlots] = await Promise.all([
    getResponseHours(params.id),
    getCompletedCount(params.id),
    getUpcomingSlots(params.id, 6),
  ])

  const rating = profile.rating ?? 0
  const reviewCount = profile.review_count ?? 0
  const viewCount = profile.view_count ?? 0
  const gallery = profile.gallery ?? []
  const memberYear = profile.created_at ? new Date(profile.created_at).getFullYear() : null

  // Formát doby odezvy
  const responseLabel = responseHours === null ? null
    : responseHours < 1 ? 'Reaguje do hodiny'
    : responseHours < 24 ? `Reaguje do ${Math.round(responseHours)} h`
    : `Reaguje do ${Math.round(responseHours / 24)} dnů`

  const fmtPrice = (s: ServiceRow) => {
    if (s.payment_model === 'B') return 'Nacenění na místě'
    const p = Number(s.price ?? 0)
    const pMax = Number(s.price_max ?? 0)
    if (s.price_type === 'range' && p > 0 && pMax > 0) return `${p.toLocaleString('cs-CZ')}–${pMax.toLocaleString('cs-CZ')} Kč`
    if (p > 0) return `${p.toLocaleString('cs-CZ')} Kč`
    return 'Cena dohodou'
  }
  const fmtDuration = (min: number | null) => {
    if (!min || min <= 0) return null
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60), m = min % 60
    return m ? `${h} h ${m} min` : `${h} h`
  }
  const locLabel = (lt: string | null) =>
    lt === 'u_poskytovatele' ? 'v provozovně' : lt === 'oboji' ? 'u vás i v provozovně' : 'u vás'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileViewTracker providerId={profile.id} />

      {/* Galerie nahoře (pokud je) */}
      {gallery.length > 0 && (
        <div className="mb-6">
          <ProfileGallery photos={gallery} />
        </div>
      )}

      {/* Hlavička */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={displayName} url={profile.avatar_url} size={72} className="text-2xl" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">{displayName}</h1>
              {profile.ico_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" /> Ověřený živnostník
                </span>
              )}
            </div>

            {/* OVĚŘENÁ IDENTITA — kdo za profilem skutečně stojí.
                Je hned u odznaku, ne schovaná dole. Zákazník musí vědět, s kým jedná. */}
            {(showLegalName || profile.ico) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                {showLegalName && <span className="font-semibold text-slate-600">{legalName}</span>}
                {showLegalName && profile.ico && <span className="text-slate-300">·</span>}
                {profile.ico && <span>IČO {profile.ico}</span>}
                {aresUrl && (
                  <>
                    <span className="text-slate-300">·</span>
                    <a
                      href={aresUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 hover:underline"
                    >
                      ověřit v ARES <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              {reviewCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Stars value={rating} />
                  <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
                  <span>({reviewCount} {reviewCount < 5 ? 'recenze' : 'recenzí'})</span>
                </span>
              )}
              {profile.city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {profile.city}</span>}
              {viewCount > 0 && <span className="inline-flex items-center gap-1 text-slate-400"><Eye className="h-4 w-4" /> {viewCount}</span>}
            </div>
          </div>
        </div>
        {viewerIsOwner ? (
          <Link
            href="/dashboard/profil"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Pencil className="h-4 w-4" /> Upravit profil
          </Link>
        ) : (
          <FavoriteButton providerId={profile.id} initialFavorited={favorited} isLoggedIn={!!user} variant="full" />
        )}
      </div>

      {/* Pruh důvěry */}
      <div className="mt-5 flex flex-wrap gap-2">
        {profile.ico_verified && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <BadgeCheck className="h-4 w-4 text-emerald-600" />
            {profile.ico ? `IČO ${profile.ico} ověřeno v ARES` : 'IČO ověřeno v ARES'}
          </span>
        )}
        {responseLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <Zap className="h-4 w-4 text-amber-500" /> {responseLabel}
          </span>
        )}
        {completedCount >= 3 && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {completedCount} dokončených zakázek
          </span>
        )}
        {memberYear && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <Clock className="h-4 w-4 text-slate-400" /> Na Propojo od {memberYear}
          </span>
        )}
      </div>

      {/* Dvousloupcový layout */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Levý sloupec */}
        <div className="space-y-6">
          {profile.bio && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-lg font-black text-slate-900">O mně</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{profile.bio}</p>
            </section>
          )}

          {/* Ceník služeb */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-black text-slate-900">Ceník služeb</h2>
            {!services || services.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Zatím žádné aktivní služby.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {services.map((s) => {
                  const dur = fmtDuration(s.duration_minutes)
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{s.title}</p>
                        <p className="text-xs text-slate-400">
                          {[dur, locLabel(s.location_type)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="whitespace-nowrap text-sm font-black text-emerald-600">{fmtPrice(s)}</span>
                        <Link href={`/sluzby/${s.id}`} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
                          {s.payment_model === 'B' ? 'Poptat' : 'Rezervovat'} <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Recenze */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-black text-slate-900">Recenze {reviewCount > 0 && `(${reviewCount})`}</h2>
            {!reviews || reviews.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Zatím žádné recenze.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    isOwner={isOwner}
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
            )}
          </section>
        </div>

        {/* Pravý sloupec — sticky rezervace */}
        <aside>
          <ProfileBookingBox providerId={profile.id} slots={upcomingSlots} isLoggedIn={!!user} />
        </aside>
      </div>
    </div>
  )
}