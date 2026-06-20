// app/profil/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, BadgeCheck, Star, Wallet, Tag, Eye } from 'lucide-react'
import FavoriteButton from '@/components/ui/FavoriteButton'
import { isFavorited } from '@/lib/actions/favorites'
import ProfileViewTracker from '@/components/ui/ProfileViewTracker'
import Avatar from '@/components/ui/Avatar'

interface Props { params: { id: string } }

type ProviderProfile = {
  id: string
  full_name: string | null
  company_name: string | null
  avatar_url: string | null
  city: string | null
  bio: string | null
  is_provider: boolean
  ico_verified: boolean | null
  rating: number | null
  review_count: number | null
  view_count: number | null
}

type ServiceRow = {
  id: string
  title: string
  price: number | null
  price_unit: string | null
  category: string | null
  payment_model: string | null
  deposit_amount: number | null
  quote_fee: number | null
  is_active: boolean | null
}

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

// Hvězdičkové hodnocení (vizuální)
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
    .select('full_name, company_name')
    .eq('id', params.id)
    .single() as { data: { full_name: string | null; company_name: string | null } | null }
  const name = data?.company_name || data?.full_name || 'Poskytovatel'
  return { title: `${name} | Propojo` }
}

export default async function ProfilPage({ params }: Props) {
  const supabase = createClient()

  // Profil poskytovatele (veřejně čitelný díky profiles_select_all)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, company_name, avatar_url, city, bio, is_provider, ico_verified, rating, review_count, view_count')
    .eq('id', params.id)
    .single() as { data: ProviderProfile | null }

  // Profil neexistuje, nebo není poskytovatel → 404
  if (!profile || profile.is_provider !== true) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const favorited = user ? await isFavorited(params.id) : false

  const displayName = profile.company_name || profile.full_name || 'Poskytovatel'

  // Jeho aktivní služby
  const { data: services } = await supabase
    .from('services')
    .select('id, title, price, price_unit, category, payment_model, deposit_amount, quote_fee, is_active')
    .eq('provider_id', params.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false }) as { data: ServiceRow[] | null }

  // Recenze + jméno hodnotitele (embed přes FK reviewer_id → profiles)
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('provider_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20) as { data: ReviewRow[] | null }

  const rating = profile.rating ?? 0
  const reviewCount = profile.review_count ?? 0
  const viewCount = profile.view_count ?? 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Neviditelný tracker – zaznamená zhlédnutí (nepočítá vlastníka) */}
      <ProfileViewTracker providerId={profile.id} />

      {/* HLAVIČKA */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Avatar name={displayName} url={profile.avatar_url} size={96} className="text-3xl" />

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-2xl font-black text-slate-900">{displayName}</h1>
              {profile.ico_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" /> Ověřeno ARES
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-slate-500 sm:justify-start">
              {profile.city && (
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {profile.city}</span>
              )}
              {reviewCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Stars value={rating} />
                  <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
                  <span>({reviewCount} {reviewCount === 1 ? 'recenze' : reviewCount < 5 ? 'recenze' : 'recenzí'})</span>
                </span>
              )}
              {viewCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Eye className="h-4 w-4" /> {viewCount} {viewCount === 1 ? 'zobrazení' : 'zobrazení'}
                </span>
              )}
            </div>

            <div className="mt-4">
              <FavoriteButton providerId={profile.id} initialFavorited={favorited} isLoggedIn={!!user} variant="full" />
            </div>

            {profile.bio && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{profile.bio}</p>
            )}
          </div>
        </div>
      </div>

      {/* SLUŽBY */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-black text-slate-900">Nabízené služby</h2>
        {!services || services.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Tento poskytovatel zatím nemá žádné aktivní služby.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <Link
                key={s.id}
                href={`/sluzby/${s.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <h3 className="font-bold text-slate-900">{s.title}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  {s.category && (
                    <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {s.category}</span>
                  )}
                  {(s.price ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-slate-400" /> {Number(s.price).toLocaleString('cs-CZ')} Kč{s.price_unit ? `/${s.price_unit}` : ''}
                    </span>
                  )}
                </div>
                {s.payment_model === 'A' && (
                  <span className="mt-3 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    Rezervace se zálohou
                  </span>
                )}
                {s.payment_model === 'B' && (
                  <span className="mt-3 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    Nacenění na místě
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* RECENZE */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-black text-slate-900">Recenze</h2>
        {!reviews || reviews.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Zatím žádné recenze.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={r.profiles?.full_name} url={r.profiles?.avatar_url} size={40} className="bg-slate-100 text-slate-600 text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{r.profiles?.full_name ?? 'Zákazník'}</p>
                    <div className="flex items-center gap-2">
                      <Stars value={r.rating} />
                      <span className="text-xs text-slate-400">
                        {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(r.created_at))}
                      </span>
                    </div>
                  </div>
                </div>
                {r.comment && <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}