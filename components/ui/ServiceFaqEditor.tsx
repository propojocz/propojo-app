'use client'
// components/ui/ServiceFaqEditor.tsx
// Časté dotazy — pohled VLASTNÍKA karty. Přidat, upravit, smazat rovnou
// na kartě, bez procházení celého formuláře nabídky.
//
// Zákazník vidí jen hotový seznam (ServiceFaq); tahle komponenta se
// vykresluje jen tomu, komu karta patří.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HelpCircle, Plus, Pencil, Trash2, Loader2, Check, X, ChevronDown } from 'lucide-react'
import { saveFaq, deleteFaq } from '@/lib/actions/faqs'
import type { Faq } from '@/components/ui/ServiceFaq'

// Nápovědy — řemeslník nemusí vymýšlet, na co se lidi ptají.
const NAMETY = [
  'Jak dlouho předem se mám objednat?',
  'Můžu termín zrušit nebo přesunout?',
  'Platí se předem, nebo na místě?',
  'Vystavujete fakturu?',
  'Dojedete i mimo město?',
]

export default function ServiceFaqEditor({
  serviceId, faqs,
}: {
  serviceId: string
  faqs: Faq[]
}) {
  const router = useRouter()
  const [editId, setEditId] = useState<string | null>(null)   // id nebo 'novy'
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const zacniNovy = () => { setEditId('novy'); setQ(''); setA(''); setErr(null) }
  const zacniUpravu = (f: Faq) => { setEditId(f.id); setQ(f.question); setA(f.answer); setErr(null) }
  const zrus = () => { setEditId(null); setQ(''); setA(''); setErr(null) }

  const uloz = async () => {
    setBusy(true); setErr(null)
    const res = await saveFaq(serviceId, editId === 'novy' ? null : editId, q, a)
    setBusy(false)
    if (res.success) { zrus(); router.refresh() } else setErr(res.error)
  }

  const smaz = async (id: string, otazka: string) => {
    if (!confirm(`Smazat dotaz „${otazka}"?`)) return
    setBusy(true); setErr(null)
    const res = await deleteFaq(serviceId, id)
    setBusy(false)
    if (res.success) router.refresh(); else setErr(res.error)
  }

  const formular = (
    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 p-4">
      <label className="mb-1.5 block text-xs font-bold text-slate-700">Otázka</label>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        maxLength={200}
        placeholder="Na co se vás zákazníci ptají?"
        className="mb-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
      {editId === 'novy' && q.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {NAMETY.map(n => (
            <button key={n} type="button" onClick={() => setQ(n)}
              className="rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 transition hover:border-emerald-400 hover:text-emerald-700">
              {n}
            </button>
          ))}
        </div>
      )}

      <label className="mb-1.5 mt-2 block text-xs font-bold text-slate-700">Odpověď</label>
      <textarea
        value={a}
        onChange={e => setA(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Odpovězte tak, jak byste to řekli po telefonu."
        className="block w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />

      {err && <p className="mt-2 text-xs font-semibold text-red-600">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button onClick={zrus} disabled={busy}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          Zrušit
        </button>
        <button onClick={uloz} disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Uložit
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <HelpCircle className="h-5 w-5 text-emerald-600" /> Časté dotazy
        </h2>
        {editId === null && (
          <button onClick={zacniNovy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100">
            <Plus className="h-3.5 w-3.5" /> Přidat dotaz
          </button>
        )}
      </div>

      {faqs.length === 0 && editId === null && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-slate-600">Zatím žádné dotazy</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
            Napište odpovědi na to, co se vás lidi ptají pořád dokola. Ubude vám zpráv
            a zákazník si spíš objedná, když má jasno hned.
          </p>
        </div>
      )}

      {editId === 'novy' && <div className="mb-3">{formular}</div>}

      <div className="space-y-2">
        {faqs.map(f => (
          editId === f.id ? (
            <div key={f.id}>{formular}</div>
          ) : (
            <div key={f.id} className="rounded-2xl border border-slate-200 bg-white">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{f.question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="whitespace-pre-line px-4 pb-3 text-sm leading-relaxed text-slate-600">{f.answer}</p>
              </details>
              <div className="flex gap-1 border-t border-slate-100 px-3 py-2">
                <button onClick={() => zacniUpravu(f)} disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
                  <Pencil className="h-3.5 w-3.5" /> Upravit
                </button>
                <button onClick={() => smaz(f.id, f.question)} disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" /> Smazat
                </button>
              </div>
            </div>
          )
        ))}
      </div>

      {err && editId === null && <p className="mt-2 text-xs font-semibold text-red-600">{err}</p>}
    </div>
  )
}