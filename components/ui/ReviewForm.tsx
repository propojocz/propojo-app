'use client'
import { useState } from 'react'
import { Star, Loader2, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createReview } from '@/lib/actions/reviews'

export default function ReviewForm({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async () => {
    if (rating < 1) {
      setErrorMsg('Vyberte počet hvězd.')
      return
    }
    setState('loading')
    setErrorMsg('')
    const result = await createReview({ orderId, rating, comment })
    if (result.success) {
      setState('done')
      router.refresh()
    } else {
      setState('error')
      setErrorMsg(result.error ?? 'Něco se nepovedlo.')
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="font-bold text-emerald-800">Děkujeme za hodnocení!</p>
        <p className="text-sm text-emerald-700">Vaše recenze pomůže ostatním zákazníkům.</p>
      </div>
    )
  }

  const shown = hover || rating

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-bold text-slate-900">Ohodnoťte tuto službu</h3>
      <p className="mt-1 text-sm text-slate-500">Jak jste byli spokojeni? Vaše hodnocení uvidí ostatní.</p>

      {/* Hvězdy */}
      <div className="mt-4 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setRating(i)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`h-8 w-8 ${i <= shown ? 'text-amber-400' : 'text-slate-200'}`}
              fill={i <= shown ? 'currentColor' : 'none'}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>

      {/* Komentář */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Napište pár slov o vaší zkušenosti (nepovinné)…"
        rows={3}
        maxLength={600}
        className="mt-4 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
      />

      {state === 'error' && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}

      <button
        onClick={handleSubmit}
        disabled={state === 'loading'}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-bold text-white transition hover:bg-emerald-600 disabled:opacity-70"
      >
        {state === 'loading' ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</>
        ) : (
          'Odeslat hodnocení'
        )}
      </button>
    </div>
  )
}