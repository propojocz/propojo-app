'use client'
// components/ui/MojePoptavkyList.tsx
// Seznam vlastních poptávek zákazníka s taby Aktivní / Uzavřené.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, CalendarClock, Clock, Users, ChevronRight, Megaphone, Send, CheckCircle2 } from 'lucide-react'

export type MyRequest = {
  id: string
  heading: string
  category: string | null
  city: string
  preferredDate: string | null
  status: string
  createdAt: string
  activeCount: number
  isSelected: boolean
  orderId: string | null
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'právě teď'
  if (h < 24) return `před ${h} h`
  const d = Math.floor(h / 24)
  return `před ${d} ${d === 1 ? 'dnem' : 'dny'}`
}

const STATUS: Record<string, { text: string; cls: string }> = {
  open: { text: 'Aktivní', cls: 'bg-blue-100 text-blue-700' },
  selected: { text: 'Vybráno', cls: 'bg-emerald-100 text-emerald-700' },
  closed: { text: 'Uzavřeno', cls: 'bg-slate-100 text-slate-500' },
  expired: { text: 'Vypršelo', cls: 'bg-slate-100 text-slate-500' },
}

export default function MojePoptavkyList({ items }: { items: MyRequest[] }) {
  const [tab, setTab] = useState<'aktivni' | 'uzavrene'>('aktivni')

  const { aktivni, uzavrene } = useMemo(() => ({
    aktivni: items.filter((i) => i.status === 'open'),
    uzavrene: items.filter((i) => i.status !== 'open'),
  }), [items])

  const shown = tab === 'aktivni' ? aktivni : uzavrene

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Moje poptávky</h1>
          <p className="mt-0.5 text-sm text-slate-500">Poptávky, které jste zadali, a zájemci o ně.</p>
        </div>
        <Link
          href="/poptavky/nova"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          <Send className="h-4 w-4" /> Nová poptávka
        </Link>
      </div>

      <div className="mb-4 flex gap-1.5">
        {([['aktivni', 'Aktivní', aktivni.length], ['uzavrene', 'Uzavřené', uzavrene.length]] as const).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              tab === id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 text-xs ${tab === id ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <h3 className="mb-1 text-lg font-bold text-slate-800">
            {tab === 'aktivni' ? 'Žádné aktivní poptávky' : 'Nic uzavřeného'}
          </h3>
          <p className="mx-auto mb-5 max-w-sm text-sm text-slate-500">
            {tab === 'aktivni' ? 'Zadejte poptávku a nechte poskytovatele, ať se vám ozvou.' : 'Uzavřené a vybrané poptávky se objeví tady.'}
          </p>
          {tab === 'aktivni' && (
            <Link href="/poptavky/nova" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">
              <Send className="h-4 w-4" /> Nová poptávka
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const s = STATUS[r.status] ?? { text: r.status, cls: 'bg-slate-100 text-slate-500' }
            return (
              <article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-black text-slate-900">{r.heading}</h2>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.city}</span>
                      {r.preferredDate && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {r.preferredDate}</span>}
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(r.createdAt)}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.text}</span>
                </div>

                {r.isSelected ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Poskytovatel vybrán
                  </p>
                ) : (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="h-3.5 w-3.5" /> {r.activeCount} {r.activeCount === 1 ? 'aktivní zájemce' : r.activeCount < 5 ? 'aktivní zájemci' : 'aktivních zájemců'}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/dashboard/poptavky/${r.id}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
                  >
                    Zobrazit zájemce ({r.activeCount}) <ChevronRight className="h-4 w-4" />
                  </Link>
                  {r.orderId && (
                    <Link
                      href={`/dashboard/objednavky/${r.orderId}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Přejít do objednávky
                    </Link>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}