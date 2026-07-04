'use client'
// components/ui/ReviewCard.tsx
// Recenze na profilu. Vlastníkovi profilu ukáže tlačítka Odpovědět (1×, bez vlákna)
// a Nahlásit. Odpověď se zobrazí veřejně pod recenzí. Zákazník na odpověď nereaguje.

import { useState } from 'react'
import { Star, ShieldCheck, Flag, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { respondToReview, reportReview } from '@/lib/actions/reviews'

type Review = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  provider_response: string | null
  response_created_at: string | null
  reported_at: string | null
  reviewerName: string | null
  reviewerAvatar: string | null
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

export default function ReviewCard({ review, isOwner }: { review: Review; isOwner: boolean }) {
  const [response, setResponse] = useState(review.provider_response)
  const [reported, setReported] = useState(!!review.reported_at)
  const [showBox, setShowBox] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

  const submit = async () => {
    if (!text.trim()) { setErr('Napište odpověď.'); return }
    setBusy(true); setErr('')
    const res = await respondToReview(review.id, text)
    if (res.success) {
      setResponse(text.trim())
      setShowBox(false)
    } else {
      setErr(res.error)
    }
    setBusy(false)
  }

  const report = async () => {
    if (!confirm('Nahlásit tuto recenzi administrátorovi? Posoudíme, zda je v pořádku.')) return
    setBusy(true)
    const res = await reportReview(review.id)
    if (res.success) setReported(true)
    else alert(res.error)
    setBusy(false)
  }

  return (
    <div className="border-b border-slate-100 pb-4 last:border-none last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar name={review.reviewerName} url={review.reviewerAvatar} size={36} className="bg-slate-100 text-slate-600 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{review.reviewerName ?? 'Zákazník'}</p>
          <div className="flex items-center gap-2">
            <Stars value={review.rating} />
            <span className="text-xs text-slate-400">{fmtDate(review.created_at)}</span>
          </div>
        </div>
      </div>

      {review.comment && <p className="mt-2 text-sm leading-relaxed text-slate-600">{review.comment}</p>}

      {/* Odpověď poskytovatele (veřejná) */}
      {response && (
        <div className="mt-3 ml-4 rounded-r-xl border-l-[3px] border-emerald-500 bg-slate-50 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Odpověď poskytovatele
          </p>
          <p className="text-sm leading-relaxed text-slate-600">{response}</p>
        </div>
      )}

      {/* Ovládání pro vlastníka profilu */}
      {isOwner && (
        <div className="mt-3">
          {/* Odpovědět (jen když ještě neodpověděl) */}
          {!response && !showBox && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowBox(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Odpovědět
              </button>
              {!reported ? (
                <button
                  onClick={report}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Flag className="h-3.5 w-3.5" /> Nahlásit
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Nahlášeno – posoudíme
                </span>
              )}
            </div>
          )}

          {/* Nahlášeno, ale už odpovězeno → jen štítek */}
          {response && reported && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Nahlášeno – posoudíme
            </span>
          )}

          {/* Formulář odpovědi */}
          {showBox && (
            <div className="mt-2 space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Poděkujte a vysvětlete kontext. Tohle uvidí budoucí zákazníci — klidný, věcný tón zabere víc než obhajoba."
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2">
                <button onClick={submit} disabled={busy} className="btn-primary text-sm disabled:opacity-60">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Odesílám…</> : 'Zveřejnit odpověď'}
                </button>
                <button onClick={() => { setShowBox(false); setErr('') }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                  Zrušit
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Odpovědět můžete jen jednou a nejde vzít zpět.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}