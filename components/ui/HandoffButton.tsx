'use client'
// components/ui/HandoffButton.tsx
// Tlačítko „Nestíhám — přihrát kolegovi" u poptávky. Otevře výběr kolegů,
// přednostně ze stejné kategorie. Přihrání zakázku nechá v Propoju.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, Loader2, Search, X, Check, MessageCircle, Link2, Send } from 'lucide-react'
import { findColleagues, handoffOrder, createShareHandoff } from '@/lib/actions/handoffs'

type Kolega = {
  provider_id: string; provider_name: string
  service_id: string; service_title: string
  category: string; same_category: boolean
}

export default function HandoffButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [query, setQuery] = useState('')
  const [kolegove, setKolegove] = useState<Kolega[]>([])
  const [sdileni, setSdileni] = useState(false)
  const [zkopirovano, setZkopirovano] = useState(false)

  // Vytvoří odkaz na přihrávku a otevře příslušný kanál.
  const sdilej = async (channel: 'whatsapp' | 'messenger' | 'odkaz') => {
    setSdileni(true); setErr(null)
    const res = await createShareHandoff(orderId, channel)
    setSdileni(false)
    if (!res.success) { setErr(res.error); return }
    const text = encodeURIComponent(`Ahoj, nestíhám tuhle zakázku — vezmeš ji? ${res.url}`)
    if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${text}`, '_blank')
    } else if (channel === 'messenger') {
      window.open(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(res.url)}&app_id=0&redirect_uri=${encodeURIComponent(res.url)}`, '_blank')
    } else {
      try {
        await navigator.clipboard.writeText(res.url)
        setZkopirovano(true)
        setTimeout(() => setZkopirovano(false), 2500)
      } catch {
        setErr('Odkaz se nepodařilo zkopírovat. ' + res.url)
      }
    }
  }

  const nacti = async (q?: string) => {
    setLoading(true); setErr(null)
    const res = await findColleagues(orderId, q)
    setKolegove(res)
    setLoading(false)
  }

  const otevri = () => { setOpen(true); nacti() }

  const prihraj = async (k: Kolega) => {
    setBusy(k.service_id); setErr(null)
    const res = await handoffOrder(orderId, k.provider_id, k.service_id)
    setBusy(null)
    if (res.success) { setDone(true); setTimeout(() => { setOpen(false); router.refresh() }, 1500) }
    else setErr(res.error)
  }

  if (!open) {
    return (
      <button
        onClick={otevri}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
      >
        <Share2 className="h-4 w-4" /> Nestíhám — přihrát kolegovi
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-extrabold tracking-tight" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Přihrát kolegovi
          </h3>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-bold text-slate-900">Přihráno</p>
            <p className="mt-1 text-sm text-slate-500">Kolega dostane nabídku. Když ji přijme, převezme poptávku za vás.</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm leading-relaxed text-slate-500">
              Vyberte kolegu, kterému poptávku pošlete. Zákazník dostane doporučení a rozhodne se sám —
              zakázka zůstane v Propoju.
            </p>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); nacti(e.target.value) }}
                placeholder="Hledat podle názvu nabídky…"
                className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {loading ? (
              <p className="py-6 text-center text-sm text-slate-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </p>
            ) : kolegove.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nikdo takový tu není.</p>
            ) : (
              <div className="space-y-1.5">
                {kolegove.map(k => (
                  <div key={k.service_id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                      {k.provider_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{k.provider_name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {k.service_title}
                        {k.same_category && <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">stejný obor</span>}
                      </p>
                    </div>
                    <button onClick={() => prihraj(k)} disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
                      {busy === k.service_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Přihrát
                    </button>
                  </div>
                ))}
              </div>
            )}

            {err && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            {/* Sdílení odkazem — pro kolegu, který ještě není na Propoju */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-sm font-bold text-slate-700">Nemáte koho z Propoja?</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Pošlete odkaz kolegovi, kterého znáte odjinud. Uvidí obor, město a cenu; jméno a adresu
                zákazníka až po registraci. Zakázka zůstane vám, dokud ji nevezme.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={() => sdilej('whatsapp')} disabled={sdileni}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60">
                  <MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp
                </button>
                <button onClick={() => sdilej('messenger')} disabled={sdileni}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60">
                  <Send className="h-5 w-5 text-blue-600" /> Messenger
                </button>
                <button onClick={() => sdilej('odkaz')} disabled={sdileni}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60">
                  {zkopirovano ? <Check className="h-5 w-5 text-emerald-600" /> : <Link2 className="h-5 w-5 text-slate-500" />}
                  {zkopirovano ? 'Zkopírováno' : 'Kopírovat'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}