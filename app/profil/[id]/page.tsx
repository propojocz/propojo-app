// app/profil/[id]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ServiceWithProvider } from '@/types/database'
import ServiceCard from '@/components/ui/ServiceCard'
import ReviewCard from '@/components/ui/ReviewCard'
import ShareButton from '@/components/ui/ShareButton'
import Link from 'next/link'
import { MapPin, Star, Phone, ArrowLeft, Package, Calendar, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('profiles').select('full_name, bio, city').eq('id', params.id).single()
  if (!data) return { title: 'Profil nenalezen' }
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  return {
    title: `${data.full_name}`,
    description: data.bio ?? `Profil živnostníka ${data.full_name} na Propojo.`,
    openGraph: {
      title: `${data.full_name} | Propojo`,
      description: data.bio ?? `Ověřený živnostník na Propojo.`,
      url: `${APP_URL}/profil/${params.id}`,
    },
  }
}

export default async function ProfilPage({ params }: Props) {
  const supabase = createClient()
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', params.id).single()
  if (error || !profile) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isOwn = user?.id === params.id

  let services: ServiceWithProvider[] = []
  if (profile.is_provider) {
    const { data } = await supabase
      .from('services')
      .select(`*, profiles (id, full_name, avatar_url, rating, review_count, city)`)
      .eq('provider_id', params.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    services = (data as ServiceWithProvider[]) ?? []
  }

  const { data: reviews } = await supabase
    .from('reviews')
    .select('*, profiles!reviews_reviewer_id_fkey (full_name)')
    .eq('provider_id', params.id)
    .order('created_at', { ascending: false })

  const joinedDate = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
  const profileUrl = `${APP_URL}/profil/${params.id}`

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Zpět na tržiště
          </Link>
          {/* Sdílení profilu */}
          {profile.is_provider && (
            <ShareButton url={profileUrl} title={`${profile.full_name} na Propojo`} />
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Levý sloupec */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              {/* Avatar */}
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-indigo-700">{profile.full_name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <h1 className="mb-1 text-xl font-black text-slate-900">{profile.full_name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${profile.is_provider ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                {profile.is_provider ? '🔧 Živnostník' : '👤 Zákazník'}
              </span>

              {profile.is_provider && profile.rating && Number(profile.rating) > 0 && (
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  <div className="flex">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= Math.round(Number(profile.rating)) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'}`} />
                    ))}
                  </div>
                  <span className="font-bold text-slate-800">{Number(profile.rating).toFixed(1)}</span>
                  <span className="text-sm text-slate-500">({profile.review_count})</span>
                </div>
              )}

              {profile.city && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-4 w-4 text-slate-400" />{profile.city}
                </div>
              )}

              {profile.phone && user ? (
                <a href={`tel:${profile.phone}`} className="mt-2 flex items-center justify-center gap-1.5 text-sm text-indigo-600 hover:underline">
                  <Phone className="h-4 w-4" />{profile.phone}
                </a>
              ) : profile.phone && !user ? (
                <p className="mt-2 text-xs text-slate-400">
                  <Link href="/prihlasit" className="text-indigo-600 hover:underline">Přihlaste se</Link> pro zobrazení kontaktu
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                {isOwn && (
                  <Link href="/dashboard/profil" className="btn-secondary w-full justify-center text-sm">Upravit profil</Link>
                )}
                {profile.is_provider && (
                  <ShareButton url={profileUrl} title={`${profile.full_name} na Propojo`} variant="full" />
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <Calendar className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Člen od</p>
                  <p className="font-semibold text-slate-700">{joinedDate}</p>
                </div>
              </div>
              {profile.is_provider && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Aktivní nabídky</p>
                    <p className="font-semibold text-slate-700">{services.length}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Účet</p>
                  <p className="font-semibold text-emerald-700">Ověřený</p>
                </div>
              </div>
            </div>

            {profile.bio && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">O mně</h2>
                <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-line">{profile.bio}</p>
              </div>
            )}
          </div>

          {/* Pravý sloupec */}
          <div className="lg:col-span-2 space-y-6">
            {profile.is_provider ? (
              <>
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-black text-slate-900">Nabídky ({services.length})</h2>
                    {isOwn && <Link href="/pridat-sluzbu" className="btn-primary text-sm">+ Přidat</Link>}
                  </div>
                  {services.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {services.map((s, i) => <ServiceCard key={s.id} service={s} index={i} />)}
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
                      <p className="text-slate-500">Zatím žádné aktivní nabídky.</p>
                      {isOwn && <Link href="/pridat-sluzbu" className="btn-primary mt-4 inline-flex">Přidat první nabídku</Link>}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="mb-4 text-xl font-black text-slate-900">Recenze ({reviews?.length ?? 0})</h2>
                  {reviews && reviews.length > 0 ? (
                    <div className="space-y-3">
                      {reviews.map((r: any) => <ReviewCard key={r.id} review={r} />)}
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
                      <div className="mb-3 text-4xl">⭐</div>
                      <p className="text-slate-500 text-sm">Zatím žádné recenze.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                <div className="mb-4 text-5xl">👤</div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">Profil zákazníka</h2>
                {isOwn && <Link href="/marketplace" className="btn-primary inline-flex mt-4">Prohlédnout nabídky</Link>}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
