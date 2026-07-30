// app/dashboard/recenze/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Star } from 'lucide-react'
import ReviewCard from '@/components/ui/ReviewCard'

export const metadata = { title: 'Moje recenze | Propojo' }

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

export default async function DashboardRecenzePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/recenze')

  const { data: profile } = await supabase
    .from('profiles').select('is_provider').eq('id', user.id).single() as { data: { is_provider: boolean } | null }
  if (profile?.is_provider !== true) redirect('/dashboard')

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, provider_response, response_created_at, reported_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('provider_id', user.id)
    .order('created_at', { ascending: false }) as { data: ReviewRow[] | null }

  const list = reviews ?? []
  // Průměr i počet počítáme ze skutečných recenzí, ne z profiles.review_count
  // (ten se nemusí přepočítat a ukazoval „Zatím žádné" i když recenze byly).
  const reviewCount = list.length
  const rating = reviewCount > 0
    ? list.reduce((sum, r) => sum + Number(r.rating ?? 0), 0) / reviewCount
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Moje recenze</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {reviewCount > 0
            ? <>Průměr <strong className="text-slate-700">{rating.toFixed(1)} ★</strong> z {reviewCount} {reviewCount === 1 ? 'recenze' : reviewCount < 5 ? 'recenzí' : 'recenzí'}</>
            : 'Zatím žádné recenze'}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 text-5xl">⭐</div>
          <h3 className="mb-2 text-lg font-bold text-slate-800">Zatím žádné recenze</h3>
          <p className="mx-auto max-w-sm text-sm text-slate-500">
            Až dokončíte první zakázky, zákazníci vás ohodnotí a recenze se objeví tady. Odpovědět můžete, ale nemusíte.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="space-y-4">
            {list.map((r) => (
              <ReviewCard
                key={r.id}
                isOwner={true}
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
        </div>
      )}
    </div>
  )
}