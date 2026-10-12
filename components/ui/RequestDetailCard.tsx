'use client'
// components/ui/RequestDetailCard.tsx
// Karta detailu poptávky – stejná na stránce /poptavky/[id] i v okně „Detail“ na nástěnce (12. 10. 2026).
// Akce podle role: poskytovatel InterestAction (Mám zájem / Otevřít chat / Plno), vlastník „Zobrazit zájemce“.
// Kontakt ani přesná adresa zákazníka se tu nikde nezobrazují.

import Link from 'next/link'
import { MapPin, CalendarClock, Clock, Tag, Users, Lock, ChevronRight } from 'lucide-react'
import InterestAction from '@/components/ui/InterestAction'
import { rozpocetText } from '@/lib/format'
import type { RequestDetailData } from '@/lib/request-detail'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'právě teď'
  if (h < 24) return `před ${h} h`
  const d = Math.floor(h / 24)
  return `před ${d} ${d === 1 ? 'dnem' : 'dny'}`
}

const PLACE_LABEL: Record<string, string> = {
  u_zakaznika: '📍 u zákazníka',
  u_poskytovatele: '🏠 u poskytovatele',
  jedno: '📍 u zákazníka i u poskytovatele',
}

export default function RequestDetailCard({ d }: { d: RequestDetailData }) {
  const statusBadge = d.status === 'selected'
    ? { text: 'Vybráno', cls: 'bg-emerald-100 text-emerald-700' }
    : !d.isOpen
      ? { text: 'Uzavřená', cls: 'bg-slate-100 text-slate-500' }
      : { text: 'Otevřená', cls: 'bg-blue-100 text-blue-700' }
  const budget = rozpocetText(d.budgetFrom, d.budgetTo)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge.cls}`}>{statusBadge.text}</span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> {timeAgo(d.createdAt)}
        </span>
      </div>

      <h1 className="mt-3 text-2xl font-black text-slate-900">{d.category ?? 'Poptávka'}</h1>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
        {d.category && (
          <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {d.category}</span>
        )}
        <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {d.city}</span>
        {d.placePref && (
          <span className="inline-flex items-center gap-1.5">{PLACE_LABEL[d.placePref] ?? ''}</span>
        )}
        {budget && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">💰 Rozpočet {budget}</span>
        )}
        {d.preferredDate && (
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-slate-400" /> {d.preferredDate}</span>
        )}
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" /> {d.activeCount} {d.activeCount === 1 ? 'zájemce' : d.activeCount < 5 ? 'zájemci' : 'zájemců'}</span>
      </div>

      {d.description && (
        <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-700">
          {d.description}
        </p>
      )}

      {d.photos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {d.photos.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
            </a>
          ))}
        </div>
      )}

      {d.inspirationPhotos.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">✨ Představa zákazníka – jak by to mělo vypadat</p>
          <div className="grid grid-cols-3 gap-2">
            {d.inspirationPhotos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Představa zákazníka" className="aspect-square w-full rounded-xl border border-violet-200 object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Akce podle role */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        {d.isOwner ? (
          <Link
            href={`/dashboard/poptavky/${d.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
          >
            Zobrazit zájemce ({d.activeCount}) <ChevronRight className="h-4 w-4" />
          </Link>
        ) : !d.isOpen ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
            Tahle poptávka už není otevřená.
          </p>
        ) : (
          <>
            <InterestAction
              requestId={d.id}
              category={d.category}
              subcategoryId={d.subcategoryId}
              placePref={d.placePref}
              isFull={d.activeCount >= 5}
              initialMyStatus={d.myStatus}
              initialConversationId={d.myConversationId}
              myCards={d.myCards}
              isLoggedIn={d.isLoggedIn}
              isProvider={d.isProvider}
              myCity={d.myCity}
              block
            />
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" /> Kontaktní údaje zákazníka uvidíte až po výběru.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
