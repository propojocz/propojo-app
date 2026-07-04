// app/admin/recenze/page.tsx
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Flag, Star } from 'lucide-react'
import ReviewModerationActions from '@/components/ui/ReviewModerationActions'

export const metadata = { title: 'Nahlášené recenze | Admin Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type ReportedReview = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reported_at: string | null
  provider_response: string | null
  reviewer_id: string
  provider_id: string
}

export default async function AdminRecenzePage() {
  const admin = getAdminClient()

  const { data: reviews } = await admin
    .from('reviews')
    .select('id, rating, comment, created_at, reported_at, provider_response, reviewer_id, provider_id')
    .not('reported_at', 'is', null)
    .order('reported_at', { ascending: true }) as { data: ReportedReview[] | null }

  const ids = Array.from(new Set((reviews ?? []).flatMap((r) => [r.reviewer_id, r.provider_id])))
  const namesMap: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: profs } = await admin
      .from('profiles').select('id, full_name').in('id', ids) as { data: { id: string; full_name: string | null }[] | null }
    for (const p of profs ?? []) namesMap[p.id] = p.full_name ?? 'Neznámý'
  }

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Nahlášené recenze</h1>
        <p className="mt-0.5 text-sm text-slate-500">Recenze, které poskytovatel označil jako nespravedlivé. Posuďte a rozhodněte.</p>
      </div>

      {!reviews || reviews.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Žádné nahlášené recenze. 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <Flag className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-amber-500">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className="h-4 w-4" fill={i <= r.rating ? 'currentColor' : 'none'} strokeWidth={1.5} />
                      ))}
                    </span>
                    <span className="text-sm font-bold text-slate-700">{r.rating}/5</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Od <strong className="text-slate-600">{namesMap[r.reviewer_id] ?? 'Zákazník'}</strong> pro <strong className="text-slate-600">{namesMap[r.provider_id] ?? 'Poskytovatele'}</strong> · nahlášeno {r.reported_at ? fmt(r.reported_at) : '—'}
                  </p>
                </div>
              </div>

              {r.comment && (
                <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">{r.comment}</p>
              )}

              {r.provider_response && (
                <div className="mt-2 ml-4 rounded-r-xl border-l-[3px] border-emerald-500 bg-emerald-50/50 px-4 py-2.5">
                  <p className="mb-1 text-xs font-bold text-emerald-700">Odpověď poskytovatele</p>
                  <p className="text-sm text-slate-600">{r.provider_response}</p>
                </div>
              )}

              <div className="mt-4">
                <ReviewModerationActions reviewId={r.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}