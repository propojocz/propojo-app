'use client'
// components/ui/ReviewForm.tsx

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createReview } from '@/lib/actions/reviews'

interface ReviewFormProps {
  orderId: string
  providerId: string
  providerName: string
  serviceTitle: string
  onSuccess?: () => void
}

export default function ReviewForm({ orderId, providerId, providerName, serviceTitle, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) { setError('Vyberte hodnocení.'); return }
    setState('loading'); setError('')

    const result = await createReview({ order_id: orderId, provider_id: providerId, rating, comment })
    if (result.success) { setState('success'); onSuccess?.() }
    else { setError(result.error); setState('error') }
  }

  if (state === 'success') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="font-bold text-emerald-800">Děkujeme za hodnocení!</p>
        <p className="text-sm text-emerald-600">Vaše recenze pomůže ostatním zákazníkům.</p>
      </motion.div>
    )
  }

  const starLabels = ['', 'Špatné', 'Podprůměrné', 'Dobré', 'Velmi dobré', 'Výborné']

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-700">Jak hodnotíte {providerName}?</p>
        <p className="text-xs text-slate-400 mb-4">Služba: {serviceTitle}</p>

        {/* Hvězdičky */}
        <div className="flex items-center gap-1.5">
          {[1,2,3,4,5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={`h-9 w-9 transition-colors ${
                  star <= (hovered || rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-slate-200 text-slate-200'
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-sm font-semibold text-slate-600">
            {starLabels[hovered || rating]}
          </span>
        </div>
      </div>

      {/* Komentář */}
      <div className="space-y-1.5">
        <label className="form-label">
          Komentář <span className="font-normal text-slate-400">(volitelné)</span>
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Popište svoji zkušenost s touto službou..."
          className="form-input resize-none"
        />
        <p className="text-right text-xs text-slate-400">{comment.length}/1000</p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </motion.div>
        )}
      </AnimatePresence>

      <button type="submit" disabled={state === 'loading' || rating === 0} className="btn-primary w-full">
        {state === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : 'Odeslat hodnocení'}
      </button>
    </form>
  )
}
