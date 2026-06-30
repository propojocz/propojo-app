'use client'
// app/admin/spory/[id]/AdminMessageBox.tsx
// Admin napíše zprávu oběma stranám (do chatu objednávky) přímo ze sporu.
import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { adminMessageToOrder } from '@/lib/actions/payout'

export default function AdminMessageBox({ orderId }: { orderId: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr('')
    const res = await adminMessageToOrder(orderId, text)
    if (res.success) {
      setText('')
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } else {
      setErr(res.error)
    }
    setBusy(false)
  }

  return (
    <div>
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Napsat oběma stranám (zobrazí se v chatu objednávky jako zpráva od Propojo)…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Odeslat
        </button>
      </div>
      {done && <p className="mt-2 text-sm text-emerald-600">Zpráva odeslána oběma stranám.</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}