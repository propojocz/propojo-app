'use client'
// components/ui/ZajemciList.tsx
// Přehled reakcí na moji poptávku + výběr poskytovatele. Výběr běží přes existující
// selectProvider, chat přes existující conversation route. Žádná nová logika.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MapPin, MessageSquare, CheckCircle2, Loader2, ChevronDown, ChevronUp, ShieldCheck, Tag, Lock, Star, Coins,
} from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { selectProvider } from '@/lib/actions/requests'

export type Zajemce = {
  responseId: string
  conversationId: string | null
  providerName: string
  providerCity: string | null
  avatarUrl: string | null
  cardTitle: string | null
  lastMessage: string | null
  status: string
  completedCount: number
  rating: { avg: number; count: number } | null
  priceEstimate: string | null
  hasService: boolean
}

export default function ZajemciList({
  requestId, heading, city, readOnly, orderId, primary, secondary,
}: {
  requestId: string
  heading: string
  city: string
  readOnly: boolean
  orderId: string | null
  primary: Zajemce[]
  secondary: Zajemce[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSecondary, setShowSecondary] = useState(false)

  const handleSelect = async (z: Zajemce) => {
    if (busyId) return
    if (!z.hasService) { setError('Tento poskytovatel u reakce nemá vybranou nabídku, ze které by šla založit objednávka.'); return }
    if (!confirm(`Vybrat poskytovatele ${z.providerName}? Vznikne objednávka a ostatní jednání se uzavřou.`)) return
    setBusyId(z.responseId)
    setError(null)
    const res = await selectProvider(requestId, z.responseId)
    if (res.success) {
      router.refresh()
    } else {
      setError(res.error)
      setBusyId(null)
    }
  }

  const Card = ({ z, dim = false }: { z: Zajemce; dim?: boolean }) => {
    const isSelected = z.status === 'selected'
    const isLost = z.status === 'not_selected' || z.status === 'rejected'
    return (
      <article className={`rounded-2xl border bg-white p-4 shadow-sm ${isSelected ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'} ${dim ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-3">
          <Avatar name={z.providerName} url={z.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-slate-900">{z.providerName}</p>
              {isSelected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> vybraný
                </span>
              )}
              {isLost && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {z.status === 'rejected' ? 'odstoupil' : 'nevybraný'}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              {z.providerCity && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {z.providerCity}</span>}
              {z.rating && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> {z.rating.avg.toFixed(1)}
                  <span className="font-normal text-slate-400">({z.rating.count})</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {z.completedCount} {z.completedCount === 1 ? 'dokončená' : z.completedCount < 5 ? 'dokončené' : 'dokončených'}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {z.cardTitle && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  <Tag className="h-3.5 w-3.5 text-slate-400" /> Reaguje nabídkou: {z.cardTitle}
                </span>
              )}
              {z.priceEstimate && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <Coins className="h-3.5 w-3.5" /> Odhad: {z.priceEstimate}
                </span>
              )}
            </div>
            {z.lastMessage && (
              <p className="mt-2 line-clamp-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                <MessageSquare className="mr-1 inline h-3 w-3" /> {z.lastMessage}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {z.conversationId && (
            <Link
              href={`/poptavky/${requestId}/jednani/${z.conversationId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <MessageSquare className="h-4 w-4" /> Otevřít chat
            </Link>
          )}
          {!readOnly && !isLost && (
            <button
              onClick={() => handleSelect(z)}
              disabled={busyId === z.responseId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {busyId === z.responseId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Vybrat poskytovatele
            </button>
          )}
        </div>
      </article>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/dashboard/poptavky" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na moje poptávky
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-black text-slate-900">{heading}</h1>
        <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-4 w-4" /> {city}</p>
      </div>

      {/* Vybráno → přechod na objednávku */}
      {(readOnly || orderId) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {orderId ? 'Poskytovatel je vybraný — poptávka pokračuje jako objednávka.' : 'Tahle poptávka už je uzavřená.'}
          </span>
          {orderId && (
            <Link href={`/dashboard/objednavky/${orderId}`} className="shrink-0 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              Přejít do objednávky
            </Link>
          )}
        </div>
      )}

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {primary.length === 0 && secondary.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">Zatím se nikdo nepřihlásil. Jakmile projeví někdo zájem, uvidíte ho tady.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {primary.map((z) => <Card key={z.responseId} z={z} />)}

          {!readOnly && (
            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" /> Kontakt poskytovatele se odkryje po výběru.
            </p>
          )}

          {secondary.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowSecondary((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                {showSecondary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showSecondary ? 'Skrýt' : `Zobrazit ostatní (${secondary.length})`}
              </button>
              {showSecondary && (
                <div className="mt-3 space-y-3">
                  {secondary.map((z) => <Card key={z.responseId} z={z} dim />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}