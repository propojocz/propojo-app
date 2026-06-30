// app/admin/spory/[id]/page.tsx
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, User, Wrench, Wallet, CheckCircle2, Flag, CreditCard, ShoppingBag, MessageSquare } from 'lucide-react'
import DisputeActions from '../DisputeActions'
import AdminMessageBox from './AdminMessageBox'
import ChatThread from '@/components/ui/ChatThread'

export const metadata = { title: 'Detail sporu | Admin Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface Props { params: { id: string } }

export default async function SporDetailPage({ params }: Props) {
  const admin = getAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select(`
      id, status, deposit_status, deposit_amount, dispute_reason, dispute_created_at,
      created_at, customer_id, provider_id, stripe_payment_intent_id,
      services(title, payment_model)
    `)
    .eq('id', params.id)
    .single() as { data: any }

  if (!order) notFound()

  // Profily obou stran + jejich historie
  const [custRes, provRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, city, created_at, rating, review_count').eq('id', order.customer_id).single(),
    admin.from('profiles').select('id, full_name, city, created_at, rating, review_count').eq('id', order.provider_id).single(),
  ])
  const customer = custRes.data as any
  const provider = provRes.data as any

  // Počet dřívějších sporů obou stran (objednávky, kde byl nahlášen spor)
  const [custDisputes, provDisputes] = await Promise.all([
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', order.customer_id).not('dispute_created_at', 'is', null),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('provider_id', order.provider_id).not('dispute_created_at', 'is', null),
  ])

  // Chat
  const { data: messages } = await admin
    .from('messages')
    .select('id, sender_id, content, created_at, image_url, is_admin')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true }) as { data: any[] | null }

  const fmt = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—'

  const senderNames: Record<string, string> = {
    [order.customer_id]: customer?.full_name ?? 'Zákazník',
    [order.provider_id]: provider?.full_name ?? 'Poskytovatel',
  }

  const isResolved = order.status !== 'spor'

  return (
    <div className="space-y-5">
      <Link href="/admin/spory" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na spory
      </Link>

      {/* Hlavička */}
      <div className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h1 className="text-xl font-black text-slate-900">{order.services?.title ?? 'Neznámá služba'}</h1>
          {isResolved && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Vyřešeno</span>}
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-700">Důvod nahlášení (od zákazníka)</p>
          <p className="text-sm text-orange-900 whitespace-pre-wrap">{order.dispute_reason ?? '—'}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Timeline */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-slate-900">Průběh objednávky</h2>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3"><ShoppingBag className="h-4 w-4 text-slate-400" /><span className="text-slate-600">Vytvořeno</span><span className="ml-auto text-slate-400">{fmt(order.created_at)}</span></li>
              {order.deposit_status && order.deposit_status !== 'none' && (
                <li className="flex items-center gap-3"><CreditCard className="h-4 w-4 text-emerald-500" /><span className="text-slate-600">Záloha {order.deposit_status === 'paid' ? 'zaplacena (drží se)' : order.deposit_status}</span><span className="ml-auto font-semibold text-slate-700">{order.deposit_amount ? `${Number(order.deposit_amount).toLocaleString('cs-CZ')} Kč` : ''}</span></li>
              )}
              <li className="flex items-center gap-3"><Flag className="h-4 w-4 text-purple-500" /><span className="text-slate-600">Poskytovatel označil splněno</span></li>
              <li className="flex items-center gap-3"><AlertTriangle className="h-4 w-4 text-orange-500" /><span className="text-slate-600">Zákazník nahlásil problém</span><span className="ml-auto text-slate-400">{fmt(order.dispute_created_at)}</span></li>
            </ol>
          </div>

          {/* Chat */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <MessageSquare className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">Konverzace mezi stranami</h2>
            </div>
            <div className="max-h-[360px] space-y-3 overflow-y-auto p-5">
              <ChatThread messages={(messages ?? []) as any} myUserId={null} senderNames={senderNames} />
            </div>
            <div className="border-t border-slate-100 p-4">
              <AdminMessageBox orderId={order.id} />
            </div>
          </div>
        </div>

        {/* Pravý sloupec: strany + platba + rozhodnutí */}
        <div className="space-y-4">
          {/* Zákazník */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><User className="h-3.5 w-3.5" /> Zákazník</p>
            <p className="font-bold text-slate-900">{customer?.full_name ?? 'Neznámý'}</p>
            <p className="text-sm text-slate-500">{customer?.city ?? ''}</p>
            <div className="mt-2 space-y-0.5 text-xs text-slate-500">
              <p>Na Propojo od {customer?.created_at ? new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(customer.created_at)) : '—'}</p>
              <p>Dřívějších sporů: <strong className={(custDisputes.count ?? 0) > 1 ? 'text-orange-600' : 'text-slate-700'}>{(custDisputes.count ?? 1) - 1}</strong></p>
            </div>
          </div>

          {/* Poskytovatel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Wrench className="h-3.5 w-3.5" /> Poskytovatel</p>
            <p className="font-bold text-slate-900">{provider?.full_name ?? 'Neznámý'}</p>
            <p className="text-sm text-slate-500">{provider?.city ?? ''}</p>
            <div className="mt-2 space-y-0.5 text-xs text-slate-500">
              <p>Hodnocení: {provider?.rating ? `${Number(provider.rating).toFixed(1)} ★ (${provider.review_count ?? 0})` : '—'}</p>
              <p>Dřívějších sporů: <strong className={(provDisputes.count ?? 0) > 1 ? 'text-orange-600' : 'text-slate-700'}>{(provDisputes.count ?? 1) - 1}</strong></p>
            </div>
          </div>

          {/* Platba */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Wallet className="h-3.5 w-3.5" /> Platba</p>
            <p className="text-2xl font-black text-slate-900">{order.deposit_amount ? `${Number(order.deposit_amount).toLocaleString('cs-CZ')} Kč` : '—'}</p>
            <p className="text-xs text-slate-500">Stav zálohy: {order.deposit_status ?? 'none'}</p>
          </div>

          {/* Rozhodnutí */}
          {!isResolved ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-bold text-slate-900">Rozhodnutí o sporu</p>
              <DisputeActions orderId={order.id} />
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Spor vyřešen</p>
              <p className="mt-1 text-xs text-emerald-700">
                {order.status === 'dokonceno' ? 'Záloha uvolněna poskytovateli.' : 'Záloha vrácena zákazníkovi.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}