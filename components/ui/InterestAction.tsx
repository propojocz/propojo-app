'use client'
// components/ui/InterestAction.tsx
// Jedno místo pro akci „Mám zájem" + výběr karty. Používá ji nástěnka
// (PoptavkyBoard) i detail poptávky, ať nevznikají dvě implementace.
//
// Podle stavu ukáže: Mám zájem / Otevřít chat / Máte zájem / Plno. Bez přihlášení
// vede na login, bez karty na vytvoření nabídky, s víc kartami otevře picker
// s doporučenou (odpovídající obor), ale nezakáže ostatní.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Check, X, Star } from 'lucide-react'
import { expressInterest } from '@/lib/actions/requests'

export type PickerCard = {
  id: string
  title: string
  category: string | null
  subcategoryId: string | null
}

export default function InterestAction({
  requestId, category, subcategoryId, isFull,
  initialMyStatus = null, initialConversationId = null,
  myCards, isLoggedIn, block = false, onReacted,
}: {
  requestId: string
  category: string | null
  subcategoryId: string | null
  isFull: boolean
  initialMyStatus?: string | null
  initialConversationId?: string | null
  myCards: PickerCard[]
  isLoggedIn: boolean
  block?: boolean
  onReacted?: (conversationId: string | null) => void
}) {
  const router = useRouter()
  const [myStatus, setMyStatus] = useState<string | null>(initialMyStatus)
  const [convId, setConvId] = useState<string | null>(initialConversationId)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const react = async (cardId: string) => {
    setBusy(true)
    setError(null)
    const res = await expressInterest(requestId, cardId)
    setBusy(false)
    setPickerOpen(false)
    if (res.success) {
      setMyStatus('interested')
      setConvId(res.conversationId)
      onReacted?.(res.conversationId)
    } else {
      setError(res.error)
    }
  }

  const onInterest = () => {
    if (!isLoggedIn) { router.push(`/prihlasit?next=/poptavky/${requestId}`); return }
    if (myCards.length === 0) { router.push('/pridat-sluzbu'); return }
    // Vždy vědomý výběr — i u jediné karty. Tiché dosazení dřív vedlo k tomu, že
    // se do reakce (a pak do objednávky) dostala karta, co s poptávkou nesouvisí.
    setError(null)
    setPickerOpen(true)
  }

  // rejected = poskytovatel dřív couvl → smí reagovat znovu, netváříme se jako „zájem".
  const reacted = !!myStatus && myStatus !== 'rejected'
  const wrap = block ? 'w-full' : ''
  const btn = `inline-flex items-center justify-center gap-1 rounded-xl px-3.5 py-2 text-sm font-bold transition ${block ? 'w-full' : ''}`

  let control
  if (reacted) {
    const label = myStatus === 'selected' ? 'Vybráno' : myStatus === 'not_selected' ? 'Nevybráno' : 'Máte zájem'
    control = convId && myStatus !== 'not_selected' ? (
      <Link href={`/poptavky/${requestId}/jednani/${convId}`} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
        <Check className="h-4 w-4" /> Otevřít chat
      </Link>
    ) : (
      <span className={`${btn} bg-emerald-50 text-emerald-700`}>
        <Check className="h-4 w-4" /> {label}
      </span>
    )
  } else if (isFull) {
    control = <span className={`${btn} bg-slate-100 text-slate-400`}>Plno</span>
  } else {
    control = (
      <button onClick={onInterest} disabled={busy} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Mám zájem <ChevronRight className="h-4 w-4" /></>}
      </button>
    )
  }

  return (
    <div className={wrap}>
      {control}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {pickerOpen && (
        <CardPicker
          category={category}
          subcategoryId={subcategoryId}
          cards={myCards}
          busy={busy}
          onPick={react}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function CardPicker({
  category, subcategoryId, cards, busy, onPick, onClose,
}: {
  category: string | null
  subcategoryId: string | null
  cards: PickerCard[]
  busy: boolean
  onPick: (cardId: string) => void
  onClose: () => void
}) {
  const isRecommended = (c: PickerCard) =>
    (!!subcategoryId && c.subcategoryId === subcategoryId) ||
    (!!category && !!c.category && c.category.toLowerCase() === category.toLowerCase())

  const ordered = [...cards].sort((a, b) => Number(isRecommended(b)) - Number(isRecommended(a)))

  return (
    <div className="fixed inset-0 z-[9990] flex items-end justify-center sm:items-center">
      <button aria-label="Zavřít" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Za kterou nabídku reagujete?</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Z vybrané nabídky vznikne objednávka, když si vás zákazník zvolí. Vyberte tu,
          která poptávce odpovídá.
        </p>
        {!ordered.some(isRecommended) && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700">
            Žádná vaše nabídka oborem přesně nesedí k této poptávce. Reagovat můžete,
            ale ověřte, že vybraná nabídka dává smysl — zákazník ji uvidí.
          </p>
        )}
        <div className="space-y-2">
          {ordered.map((c) => {
            const rec = isRecommended(c)
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                disabled={busy}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition disabled:opacity-60 ${
                  rec ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{c.title}</p>
                  {c.category && <p className="text-xs text-slate-500">{c.category}</p>}
                </div>
                {rec ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <Star className="h-3 w-3 fill-emerald-600 text-emerald-600" /> doporučeno
                  </span>
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}