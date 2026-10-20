// components/ui/MiniServiceCard.tsx
// Malá vodorovná karta do pásů na marketplace (Bleskové termíny, Dobře hodnocení, Naposledy prohlížené):
// fotka vlevo, název, štítek času / hodnocení, místo, cena a tlačítko Termíny / Zobrazit. Bez hooků –
// jde vykreslit na serveru i v prohlížeči.

import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Star, Zap } from 'lucide-react'

export type MiniCard = {
  id: string
  title: string
  image: string | null
  place: string | null
  /** „od 200 Kč“ / „Cena dohodou“ / „Výjezd a nacenění“ */
  priceText: string
  /** Nejbližší volný termín – štítek („Dnes 14:00“) */
  slotLabel?: string | null
  rating?: { avg: number; count: number } | null
  /** Tlačítko Termíny (má volné termíny) / Zobrazit */
  hasSlots: boolean
}

export default function MiniServiceCard({ card }: { card: MiniCard }) {
  const href = `/sluzby/${card.id}`
  return (
    <article className="flex w-[85%] shrink-0 snap-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm transition hover:border-emerald-200 hover:shadow-md sm:w-[calc((100%-3rem)/3)] lg:w-[calc((100%-3rem)/4)]">
      <Link href={href} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 to-sky-50">
        {card.image && <Image src={card.image} alt={card.title} fill sizes="96px" className="object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={href} className="truncate text-[14px] font-extrabold text-slate-900 hover:text-emerald-700">{card.title}</Link>
        {card.slotLabel && (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-md bg-orange-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
            <Zap className="h-3 w-3 fill-white" /> {card.slotLabel}
          </span>
        )}
        {card.rating && card.rating.count > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {card.rating.avg.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            <span className="font-normal text-slate-400">({card.rating.count})</span>
          </span>
        )}
        {card.place && (
          <span className="mt-1 flex min-w-0 items-center gap-1 text-[11.5px] text-slate-500">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" /> <span className="truncate">{card.place}</span>
          </span>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <span className="truncate text-[13px] font-extrabold text-slate-900">{card.priceText}</span>
          <Link href={card.hasSlots ? `${href}#volne-terminy` : href}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition ${
              card.hasSlots ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border border-emerald-200 text-emerald-800 hover:bg-emerald-50'
            }`}>
            {card.hasSlots ? <><Zap className="h-3.5 w-3.5" /> Termíny</> : 'Zobrazit'}
          </Link>
        </div>
      </div>
    </article>
  )
}
