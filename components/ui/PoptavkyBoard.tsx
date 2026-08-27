'use client'
// components/ui/PoptavkyBoard.tsx
// Nástěnka poptávek pro poskytovatele. Taby jsou jen měkké řazení/filtr — pod
// každým projde všechno otevřené. Akci „Mám zájem" + výběr karty řeší sdílená
// komponenta InterestAction (stejná i na detailu poptávky).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, Clock, CalendarClock, Users, Send, Megaphone, Sparkles } from 'lucide-react'
import InterestAction, { type PickerCard } from '@/components/ui/InterestAction'

export type ProviderCard = PickerCard

export type BoardRequest = {
  id: string
  category: string | null
  subcategoryId: string | null
  city: string
  description: string
  preferredDate: string | null
  photos: string[]
  createdAt: string
  activeCount: number
  isFull: boolean
  myStatus: string | null
  myConversationId: string | null
  rank: number
  sameCity: boolean
}

type Tab = 'doporucene' | 'okoli' | 'vse' | 'zajmy'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'právě teď'
  if (h < 24) return `před ${h} h`
  const d = Math.floor(h / 24)
  return `před ${d} ${d === 1 ? 'dnem' : 'dny'}`
}

function zajemciLabel(n: number) {
  if (n === 0) return 'zatím bez zájemců'
  return `${n} ${n === 1 ? 'zájemce' : n < 5 ? 'zájemci' : 'zájemců'}`
}

export default function PoptavkyBoard({
  cards,
  myCards,
  isLoggedIn,
}: {
  cards: BoardRequest[]
  myCards: ProviderCard[]
  isLoggedIn: boolean
}) {
  const [tab, setTab] = useState<Tab>('doporucene')
  // Po reakci si držíme lokální stav (kvůli tabu Moje zájmy a počtu zájemců).
  const [local, setLocal] = useState<Record<string, { myStatus: string; myConversationId: string | null; activeCount: number }>>({})

  const merged = useMemo(
    () => cards.map((c) => (local[c.id] ? { ...c, ...local[c.id] } : c)),
    [cards, local],
  )

  const counts = useMemo(() => ({
    okoli: merged.filter((c) => c.sameCity).length,
    zajmy: merged.filter((c) => c.myStatus).length,
    vse: merged.length,
  }), [merged])

  const shown = useMemo(() => {
    let list = merged
    if (tab === 'okoli') list = list.filter((c) => c.sameCity)
    if (tab === 'zajmy') list = list.filter((c) => c.myStatus)
    if (tab === 'doporucene') {
      return [...list].sort((a, b) =>
        a.rank !== b.rank ? a.rank - b.rank : +new Date(b.createdAt) - +new Date(a.createdAt))
    }
    return [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }, [merged, tab])

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'doporucene', label: 'Doporučené' },
    { id: 'okoli', label: 'V okolí', count: counts.okoli },
    { id: 'vse', label: 'Všechny', count: counts.vse },
    { id: 'zajmy', label: 'Moje zájmy', count: counts.zajmy },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Poptávky</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Nové poptávky ve vašem okolí. Kdo projeví zájem, může se zákazníkem domluvit v chatu.
          </p>
        </div>
        <Link
          href="/poptavky/nova"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <Send className="h-4 w-4" /> Zadat vlastní poptávku
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-white text-slate-500'}`}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {myCards.length === 0 && isLoggedIn && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <strong>Chcete na poptávky reagovat?</strong> Nejdřív si vytvořte nabídku služby — z ní pak
            vznikne objednávka.{' '}
            <Link href="/pridat-sluzbu" className="font-bold underline">Vytvořit nabídku</Link>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <h3 className="mb-1 text-lg font-bold text-slate-800">
            {tab === 'zajmy' ? 'Zatím jste neprojevili zájem' : tab === 'okoli' ? 'Ve vašem okolí zatím nic není' : 'Zatím žádné poptávky'}
          </h3>
          <p className="mx-auto max-w-sm text-sm text-slate-500">
            {tab === 'zajmy'
              ? 'Jakmile u nějaké poptávky kliknete na „Mám zájem", objeví se tady.'
              : 'Nové poptávky se tu objeví, jakmile je někdo zadá.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((req) => (
            <article key={req.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {req.category && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">{req.category}</span>
                )}
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {req.city}</span>
                {req.preferredDate && (
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {req.preferredDate}</span>
                )}
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(req.createdAt)}</span>
              </div>

              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {req.description}
              </p>

              {req.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {req.photos.slice(0, 4).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover" />
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" /> {zajemciLabel(req.activeCount)}
                </span>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/poptavky/${req.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Detail
                  </Link>
                  <InterestAction
                    requestId={req.id}
                    category={req.category}
                    subcategoryId={req.subcategoryId}
                    isFull={req.isFull}
                    initialMyStatus={req.myStatus}
                    initialConversationId={req.myConversationId}
                    myCards={myCards}
                    isLoggedIn={isLoggedIn}
                    onReacted={(cid) => setLocal((prev) => ({
                      ...prev,
                      [req.id]: { myStatus: 'interested', myConversationId: cid, activeCount: req.activeCount + 1 },
                    }))}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}