// app/admin/spory/page.tsx
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Clock } from 'lucide-react'

export const metadata = { title: 'Spory | Admin Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type DisputeOrder = {
  id: string
  deposit_amount: number | null
  dispute_reason: string | null
  dispute_created_at: string | null
  customer_id: string
  provider_id: string
  services: { title: string | null } | null
}

export default async function AdminSporyPage() {
  const admin = getAdminClient()

  const { data: orders } = await admin
    .from('orders')
    .select('id, deposit_amount, dispute_reason, dispute_created_at, customer_id, provider_id, services(title)')
    .eq('status', 'spor')
    .order('dispute_created_at', { ascending: true }) as { data: DisputeOrder[] | null }

  const ids = Array.from(new Set((orders ?? []).flatMap((o) => [o.customer_id, o.provider_id])))
  const namesMap: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: profs } = await admin
      .from('profiles').select('id, full_name').in('id', ids) as { data: { id: string; full_name: string | null }[] | null }
    for (const p of profs ?? []) namesMap[p.id] = p.full_name ?? 'Neznámý'
  }

  const fmt = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Spory</h1>
        <p className="mt-0.5 text-sm text-slate-500">Objednávky, u kterých zákazník nahlásil problém. Otevřete detail a rozhodněte.</p>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Žádné otevřené spory. 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/spory/${o.id}`}
              className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">{o.services?.title ?? 'Neznámá služba'}</p>
                <p className="truncate text-sm text-slate-500">
                  {namesMap[o.customer_id] ?? 'Zákazník'} vs {namesMap[o.provider_id] ?? 'Poskytovatel'}
                  {o.deposit_amount ? ` · ${Number(o.deposit_amount).toLocaleString('cs-CZ')} Kč` : ''}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" /> {fmt(o.dispute_created_at)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}