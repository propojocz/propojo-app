// components/ui/ReviewCard.tsx
import { Star } from 'lucide-react'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  profiles: { full_name: string } | null
}

export default function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {review.profiles?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{review.profiles?.full_name ?? 'Zákazník'}</p>
            <p className="text-xs text-slate-400">
              {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(review.created_at))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {[1,2,3,4,5].map(s => (
            <Star key={s} className={`h-4 w-4 ${s <= review.rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'}`} />
          ))}
        </div>
      </div>
      {review.comment && (
        <p className="text-sm leading-relaxed text-slate-600">{review.comment}</p>
      )}
    </div>
  )
}
