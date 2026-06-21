// app/admin/poptavky/page.tsx
import { getLeads } from '@/lib/actions/admin'
import Link from 'next/link'
import LeadCard from './LeadCard'

interface Props { searchParams: { stav?: string } }

export default async function AdminPoptavkyPage({ searchParams }: Props) {
  const stav = searchParams.stav ?? 'nova'
  const leads = await getLeads(stav)

  const filtry = [
    { key: 'nova', label: 'Nové' },
    { key: 'vyrizena', label: 'Vyřízené' },
    { key: 'vse', label: 'Vše' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Poptávky</h1>
        <p className="mt-0.5 text-sm text-slate-500">Poptávky od zákazníků, kteří hledají poskytovatele.</p>
      </div>

      {/* Filtr stavu */}
      <div className="flex gap-2">
        {filtry.map((f) => (
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

      {leads.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Žádné poptávky v této kategorii.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}