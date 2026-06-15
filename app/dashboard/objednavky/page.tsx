// app/dashboard/objednavky/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export const metadata = { title: 'Objednávky | Dashboard' }

const STATUS_LABELS: Record<string, string> = {
  cekajici: 'Čeká na přijetí', prijato: 'Přijato', v_procesu: 'V procesu', dokonceno: 'Dokončeno', zruseno: 'Zrušeno',
}
const STATUS_COLORS: Record<string, string> = {
  cekajici: 'bg-amber-100 text-amber-700 border-amber-200',
  prijato: 'bg-blue-100 text-blue-700 border-blue-200',
  v_procesu: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  dokonceno: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  zruseno: 'bg-red-100 text-red-700 border-red-200',
}

export default async function ObjednavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit')

  const { data: profile } = await supabase.from('profiles').select('is_provider').eq('id', user.id).single() as { data: { is_provider: boolean } | null }
  const isProvider = profile?.is_provider === true

  const { data: orders } = await supabase
    .from('orders')
    .select('*, services(title, price, price_unit)')
    .eq(isProvider ? 'provider_id' : 'customer_id', user.id)
    .order('created_at', { ascending: false }) as { data: any[] | null }

  // Druhá strana objednávky (u poskytovatele = zákazník, u zákazníka = poskytovatel)
  const otherIds = [...new Set(orders?.map(o => isProvider ? o.customer_id : o.provider_id) ?? [])]
  const { data: otherProfiles } = otherIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', otherIds)
    : { data: [] }
  const profileMap = Object.fromEntries((otherProfiles ?? []).map((p: any) => [p.id, p]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">{isProvider ? 'Poptávky' : 'Moje objednávky'}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{orders?.length ?? 0} celkem</p>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 text-5xl">{isProvider ? '📬' : '🛒'}</div>
          <h3 className="mb-2 text-lg font-bold text-slate-800">Zatím žádné {isProvider ? 'poptávky' : 'objednávky'}</h3>
          <p className="text-sm text-slate-500">{isProvider ? 'Poptávky se zobrazí, jakmile zákazníci projeví zájem.' : 'Najděte živnostníka a objednejte první službu.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o: any) => {
            const otherId = isProvider ? o.customer_id : o.provider_id
            const otherProfile = profileMap[otherId]
            return (
              <Link
                key={o.id}
                href={`/dashboard/objednavky/${o.id}`}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-slate-900">{o.services?.title ?? 'Neznámá služba'}</h3>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>{isProvider ? '👤' : '🔧'} {otherProfile?.full_name ?? (isProvider ? 'Zákazník' : 'Živnostník')}</span>
                    <span>📅 {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(o.created_at))}</span>
                    {(o.services?.price ?? 0) > 0 && <span>💰 {Number(o.services.price).toLocaleString('cs-CZ')} Kč/{o.services.price_unit}</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}