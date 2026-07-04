'use client'
// components/ui/ReviewModerationActions.tsx
// Admin tlačítka u nahlášené recenze: Smazat (nevhodná) / Ponechat (v pořádku).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Check, Loader2 } from 'lucide-react'
import { adminDeleteReview, adminDismissReport } from '@/lib/actions/reviews'

export default function ReviewModerationActions({ reviewId }: { reviewId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'del' | 'keep' | null>(null)

  const remove = async () => {
    if (!confirm('Smazat tuto recenzi? Nelze vzít zpět.')) return
    setBusy('del')
    const res = await adminDeleteReview(reviewId)
    if (!res.success) { alert(res.error); setBusy(null); return }
    router.refresh()
  }

  const keep = async () => {
    setBusy('keep')
    const res = await adminDismissReport(reviewId)
    if (!res.success) { alert(res.error); setBusy(null); return }
    router.refresh()
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={remove}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
      >
        {busy === 'del' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Smazat recenzi
      </button>
      <button
        onClick={keep}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {busy === 'keep' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Ponechat (v pořádku)
      </button>
    </div>
  )
}