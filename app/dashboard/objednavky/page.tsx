// app/dashboard/objednavky/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, AlertCircle } from 'lucide-react'

export const metadata = { title: 'Objednávky | Dashboard' }

const STATUS_LABELS: Record<string, string> = {
  cekajici: 'Čeká na přijetí', prijato: 'Přijato', v_procesu: 'V procesu', ceka_potvrzeni: 'Čeká na potvrzení', dokonceno: 'Dokončeno', zruseno: 'Zrušeno', spor: 'Spor',
}
const STATUS_COLORS: Record<string, string> = {
  cekajici: 'bg-amber-100 text-amber-700 border-amber-200',
  prijato: 'bg-blue-100 text-blue-700 border-blue-200',
  v_procesu: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ceka_potvrzeni: 'bg-purple-100 text-purple-700 border-purple-200',
  dokonceno: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  zruseno: 'bg-red-100 text-red-700 border-red-200',
  spor: 'bg-orange-100 text-orange-700 border-orange-200',
}

// Co po zákazníkovi objednávka chce? Vrací text výzvy, nebo null když nic.
// Díky tomu rezervace nezapadne — nedodělané jdou nahoru a je vidět proč.
function customerTodo(o: any): string | null {
  if (o.status === 'zruseno' || o.status === 'dokonceno') return null
  if (o.deposit_status === 'pending') {
    return o.location_address
      ? 'Zaplaťte, aby termín platil'
      : 'Doplňte adresu a zaplaťte'
  }
  if (o.status === 'ceka_potvrzeni') return 'Potvrďte dokončení a ohodnoťte'
  return null
}

function OrderCard({ o, role, otherName, todo }: { o: any; role: 'provider' | 'customer'; otherName: string; todo?: string | null }) {
  return (
    <Link
      href={`/dashboard/objednavky/${o.id}`}
      className={`block rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        todo ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200 hover:border-emerald-200'
      }`}
    >
      <div className="min-w-0">
        {/* Výzva k akci — nejdřív ze všeho, ať je jasné, co se po mně chce */}
        {todo && (
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" /> {todo}
          </p>
        )}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="font-bold text-slate-900">{o.services?.title ?? 'Neznámá služba'}</h3>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-slate-100 text-slate-500'}`}>
            {STATUS_LABELS[o.status] ?? o.status}
          </span>
          {(Number(o.deposit_amount ?? 0) > 0 || Number(o.services?.quote_fee ?? 0) > 0) && o.status !== 'zruseno' && o.status !== 'cekajici' && (
            (o.deposit_status === 'paid' || o.deposit_status === 'released')
              ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{o.services?.payment_model === 'B' ? 'Výjezd zaplacen' : 'Záloha zaplacena'}</span>
              : <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500">{o.services?.payment_model === 'B' ? 'Výjezd nezaplacen' : 'Záloha nezaplacena'}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span>{role === 'provider' ? '👤' : '🔧'} {otherName}</span>
          {o.scheduled_at
            ? <span className="inline-flex items-center gap-1 text-emerald-700"><CalendarDays className="h-3.5 w-3.5" /> {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(o.scheduled_at))}</span>
            : <span>📅 {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(o.created_at))}</span>}
          {(o.services?.price ?? 0) > 0 && <span>💰 {Number(o.services.price).toLocaleString('cs-CZ')} Kč/{o.services.price_unit}</span>}
        </div>
      </div>
    </Link>
  )
}

export default async function ObjednavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit')

  const { data: profile } = await supabase.from('profiles').select('is_provider').eq('id', user.id).single() as { data: { is_provider: boolean } | null }
  const isProvider = profile?.is_provider === true

  // Objednávky, kde jsem POSKYTOVATEL (příchozí) – jen pokud jsem provider
  const { data: asProvider } = isProvider
    ? await supabase
        .from('orders')
        .select('*, services(title, price, price_unit, payment_model, quote_fee)')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false }) as { data: any[] | null }
    : { data: [] as any[] }

  // Objednávky, kde jsem ZÁKAZNÍK (co jsem si objednal) – vždy
  const { data: asCustomer } = await supabase
    .from('orders')
    .select('*, services(title, price, price_unit, payment_model, quote_fee)')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false }) as { data: any[] | null }

  // Jména druhých stran (dohromady)
  const otherIds = [
    ...new Set([
      ...(asProvider ?? []).map((o) => o.customer_id),
      ...(asCustomer ?? []).map((o) => o.provider_id),
    ]),
  ]
  const { data: otherProfiles } = otherIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', otherIds)
    : { data: [] }
  const nameMap = Object.fromEntries((otherProfiles ?? []).map((p: any) => [p.id, p.full_name]))

  const provOrders = asProvider ?? []
  const custOrdersRaw = asCustomer ?? []

  // Rozdělíme: co po mně něco chce (platba, potvrzení) jde NAHORU. Bez toho
  // zákazník po rezervaci odejde a objednávku pak nenajde.
  const custTodo = custOrdersRaw.filter((o: any) => customerTodo(o) !== null)
  const custOstatni = custOrdersRaw.filter((o: any) => customerTodo(o) === null)

  const nothing = provOrders.length === 0 && custOrdersRaw.length === 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Objednávky</h1>
        <p className="mt-0.5 text-sm text-slate-500">{provOrders.length + custOrdersRaw.length} celkem</p>
      </div>

      {nothing && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 text-5xl">🛒</div>
          <h3 className="mb-2 text-lg font-bold text-slate-800">Zatím žádné objednávky</h3>
          <p className="text-sm text-slate-500">Najděte živnostníka a objednejte první službu.</p>
        </div>
      )}

      {/* TŘI SLOUPCE VEDLE SEBE — na mobilu pod sebou.
          Vlevo co čeká na mě, uprostřed práce u mě, vpravo co jsem si objednal. */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* 1) ČEKÁ NA VÁS — nedokončené, rezervace zatím neplatí */}
        {custTodo.length > 0 && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <AlertCircle className="h-4 w-4" /> Čeká na vás ({custTodo.length})
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                Dokud tyhle objednávky nedokončíte, termín pro vás není závazně zamluvený.
              </p>
            </div>
            {custTodo.map((o: any) => (
              <OrderCard key={o.id} o={o} role="customer" otherName={nameMap[o.provider_id] ?? 'Živnostník'} todo={customerTodo(o)} />
            ))}
          </section>
        )}

        {/* 2) OBJEDNÁVKY U MĚ — práce, kterou mám udělat */}
        {isProvider && provOrders.length > 0 && (
          <section className="space-y-3">
            <h2 className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">
              Objednávky u mě ({provOrders.length})
            </h2>
            {provOrders.map((o: any) => (
              <OrderCard key={o.id} o={o} role="provider" otherName={nameMap[o.customer_id] ?? 'Zákazník'} />
            ))}
          </section>
        )}

        {/* 3) CO JSEM SI OBJEDNAL — bez těch, co čekají na akci */}
        {custOstatni.length > 0 && (
          <section className="space-y-3">
            <h2 className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">
              Co jsem si objednal ({custOstatni.length})
            </h2>
            {custOstatni.map((o: any) => (
              <OrderCard key={o.id} o={o} role="customer" otherName={nameMap[o.provider_id] ?? 'Živnostník'} />
            ))}
          </section>
        )}
      </div>

    </div>
  )
}