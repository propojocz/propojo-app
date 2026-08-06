'use client'
// components/ui/IncomingHandoffs.tsx
// Panel přihrávek čekajících na mě — kolega mi přihrál poptávku,
// já ji přijmu (převezmu) nebo odmítnu (vrátí se jemu).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, Check, X, Loader2 } from 'lucide-react'
import { acceptHandoff, declineHandoff } from '@/lib/actions/handoffs'
import type { IncomingHandoff } from '@/lib/actions/handoffs'

export default function IncomingHandoffs({ handoffs }: { handoffs: IncomingHandoff[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (handoffs.length === 0) return null

  const respond = async (id: string, accept: boolean) => {
    setBusy(id); setErr(null)
    const res = accept ? await acceptHandoff(id) : await declineHandoff(id)
    setBusy(null)
    if (res.success) router.refresh(); else setErr(res.error)
  }

  return (
    <div className="mb-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-emerald-700" />
        <h3 className="text-sm font-bold text-emerald-900">
          Přihrané poptávky ({handoffs.length})
        </h3>
      </div>

      <div className="space-y-2">
        {handoffs.map(h => (
          <div key={h.handoff_id} className="rounded-xl bg-white p-4">
            <p className="text-sm text-slate-800">
              <span className="font-bold">{h.from_name ?? 'Kolega'}</span> vám přihrál poptávku
              {' '}— nestíhá ji.
            </p>
            {h.order_description && (
              <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{h.order_description}</p>
            )}
            {h.note && <p className="mt-1 text-xs italic text-slate-400">Poznámka: {h.note}</p>}

            <div className="mt-3 flex gap-2">
              <button onClick={() => respond(h.handoff_id, true)} disabled={busy === h.handoff_id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60">
                {busy === h.handoff_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Převzít
              </button>
              <button onClick={() => respond(h.handoff_id, false)} disabled={busy === h.handoff_id}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                <X className="h-4 w-4" /> Odmítnout
              </button>
            </div>
          </div>
        ))}
      </div>

      {err && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  )
}