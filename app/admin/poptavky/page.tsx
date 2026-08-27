// app/admin/poptavky/page.tsx
// Admin přehled poptávek (nový model requests). Nahrazuje starý pohled nad leads.
// Jen čtení pro dohled — admin vidí i kontakt zákazníka.

import { getRequests } from '@/lib/actions/admin'
import Link from 'next/link'
import { MapPin, Clock, Mail, Phone } from 'lucide-react'

interface Props { searchParams: { stav?: string } }

const FILTRY = [
  { key: 'open', label: 'Otevřené' },
  { key: 'selected', label: 'Vybrané' },
  { key: 'vse', label: 'Vše' },
]

const STAV: Record<string, { text: string; cls: string }> = {
  open: { text: 'Otevřená', cls: 'bg-blue-100 text-blue-700' },
  selected: { text: 'Vybráno', cls: 'bg-emerald-100 text-emerald-700' },
  closed: { text: 'Uzavřeno', cls: 'bg-slate-100 text-slate-500' },
  expired: { text: 'Vypršelo', cls: 'bg-slate-100 text-slate-500' },
}

export const dynamic = 'force-dynamic'

export default async function AdminPoptavkyPage({ searchParams }: Props) {
  const stav = searchParams.stav ?? 'open'
  const requests = await getRequests(stav)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Poptávky</h1>
        <p className="mt-0.5 text-sm text-slate-500">Poptávky od zákazníků, kteří hledají poskytovatele.</p>
      </div>

      <div className="flex gap-2">
        {FILTRY.map((f) => (
          <Link
            key={f.key}
            href={`/admin/poptavky?stav=${f.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              stav === f.key ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Žádné poptávky v této kategorii.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const s = STAV[r.status] ?? { text: r.status, cls: 'bg-slate-100 text-slate-500' }
            return (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{r.category ?? 'Poptávka'}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.city}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(r.created_at).toLocaleDateString('cs-CZ')}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.text}</span>
                </div>

                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-slate-700">{r.description}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {r.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {r.email}</span>}
                  {r.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {r.phone}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}