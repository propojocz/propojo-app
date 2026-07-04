// app/dashboard/oblibene/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getFavorites } from '@/lib/actions/favorites'
import { MapPin, Star, BadgeCheck, Heart, ChevronRight } from 'lucide-react'

export const metadata = { title: 'Oblíbení | Propojo' }

export default async function OblibenePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/oblibene')

  const favorites = await getFavorites()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
          <Heart className="h-6 w-6 fill-rose-500 text-rose-500" /> Oblíbení
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {favorites.length > 0 ? `${favorites.length} uložených živnostníků` : 'Uložení živnostníci na jednom místě'}
        </p>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 text-5xl">🤍</div>
          <h3 className="mb-2 text-lg font-bold text-slate-800">Zatím nikoho v oblíbených</h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-slate-500">
            Klikni na srdíčko u živnostníka a najdeš ho tady — ať se k němu snadno vrátíš.
          </p>
          <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-bold text-white transition hover:bg-emerald-600">
            Prohlédnout marketplace
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {favorites.map((f) => {
            const initial = (f.full_name ?? 'P').charAt(0).toUpperCase()
            const rating = Number(f.rating ?? 0)
            return (
              <Link
                key={f.id}
                href={`/profil/${f.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-50 to-blue-50">
                  {f.avatar_url ? (
                    <Image src={f.avatar_url} alt={f.full_name ?? ''} fill className="object-cover" sizes="56px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-extrabold text-emerald-600">{initial}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate font-extrabold text-slate-900 group-hover:text-emerald-700">{f.full_name ?? 'Poskytovatel'}</h3>
                    {f.ico_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500">
                    {rating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
                        <span className="font-bold text-slate-700">{rating.toFixed(1)}</span>
                        <span className="text-slate-400">({f.review_count ?? 0})</span>
                      </span>
                    )}
                    {f.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {f.city}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{f.service_count} {f.service_count === 1 ? 'nabídka' : f.service_count < 5 ? 'nabídky' : 'nabídek'}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-emerald-400" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}