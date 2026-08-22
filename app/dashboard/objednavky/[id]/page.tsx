// app/dashboard/objednavky/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OrderDetailClient from './OrderDetailClient'
import ReviewForm from '@/components/ui/ReviewForm'
import TimeProposalPanel from '@/components/ui/TimeProposalPanel'
import { getProposals } from '@/lib/actions/time-proposals'
import TimePreferenceForm from '@/components/ui/TimePreferenceForm'
import { releaseUnpaidReservation } from '@/lib/actions/reservation-release'

interface Props { params: { id: string }; searchParams: { platba?: string } }

type ServiceLite = {
  id: string
  title: string
  price: number | null
  price_unit: string | null
  category: string | null
  city: string | null
  description: string | null
  payment_model: string | null
  deposit_amount: number | null
  quote_fee: number | null
  location_type: string | null
}

type OrderRow = {
  id: string
  customer_id: string
  provider_id: string
  service_id: string
  status: string
  description: string | null
  total_price: number | null
  created_at: string
  deposit_status: string | null
  deposit_amount: number | null
  location_city: string | null
  location_address: string | null
  location_lat: number | null
  location_lng: number | null
  service_location: string | null
  scheduled_at: string | null
  scheduled_end: string | null
  service_item_id: string | null
  services: ServiceLite | null
  service_items: { name: string | null; deposit_amount: number | null; payment_model: string | null; duration_minutes: number | null } | null
}

type ProfileLite = {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  city: string | null
  created_at: string | null
}

type MessageRow = {
  id: string
  order_id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
  image_url: string | null
}

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit')

  // Návrat ze Stripe přes „zpět". Přímá rezervace se zruší a slot uvolní;
  // objednávka domluvená bez slotu se jen vrátí do stavu čekající, aby se mohli
  // domluvit na jiném termínu ve stejném chatu.
  if (searchParams.platba === 'zruseno') {
    await releaseUnpaidReservation(params.id)
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, services(id, title, price, price_unit, category, city, description, payment_model, deposit_amount, quote_fee, location_type), service_items(name, deposit_amount, payment_model, duration_minutes)')
    .eq('id', params.id)
    .single() as { data: OrderRow | null; error: any }

  if (error || !order) notFound()
  if (order.customer_id !== user.id && order.provider_id !== user.id) notFound()

  const isProvider = order.provider_id === user.id
  const otherId = isProvider ? order.customer_id : order.provider_id

  const proposals = await getProposals(order.id)
  const depositForPanel = Number(
    order.deposit_amount ?? order.service_items?.deposit_amount ?? order.services?.deposit_amount ?? 0
  )

  const proposalModel = order.service_items?.payment_model ?? order.services?.payment_model
  const futureConfirmedTerm = !!order.scheduled_at && new Date(order.scheduled_at).getTime() > Date.now()
  const proposalFlowOpen =
    order.status !== 'zruseno' &&
    order.status !== 'dokonceno' &&
    order.status !== 'ceka_potvrzeni' &&
    proposalModel !== 'B'

  // Bez termínu: provider panel vidí vždy, zákazník až když má co vybírat.
  // S potvrzeným budoucím termínem: provider má kompaktní „Navrhnout změnu",
  // zákazník panel uvidí jen tehdy, když provider opravdu poslal nové návrhy.
  const showProposalPanel = proposalFlowOpen && (
    !order.scheduled_at
      ? (isProvider || proposals.length > 0)
      : (futureConfirmedTerm && (isProvider || proposals.length > 0))
  )

  const [myProfileRes, otherProfileRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city, created_at').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city, created_at').eq('id', otherId).single(),
  ])
  const myProfile = myProfileRes.data as ProfileLite | null
  const otherProfile = otherProfileRes.data as ProfileLite | null

  const otherCompletedField = isProvider ? 'customer_id' : 'provider_id'
  const { count: otherCompletedCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq(otherCompletedField, otherId)
    .eq('status', 'dokonceno')

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true }) as { data: MessageRow[] | null }

  const senderIds = Array.from(new Set((messages ?? []).map((m) => m.sender_id)))
  const namesMap: Record<string, string> = {}
  if (myProfile?.id) namesMap[myProfile.id] = myProfile.full_name ?? 'Já'
  if (otherProfile?.id) namesMap[otherProfile.id] = otherProfile.full_name ?? (isProvider ? 'Zákazník' : 'Živnostník')
  const missing = senderIds.filter((id) => !namesMap[id])
  if (missing.length > 0) {
    const { data: extraProfiles } = await supabase
      .from('profiles').select('id, full_name, is_admin').in('id', missing) as { data: { id: string; full_name: string | null; is_admin: boolean | null }[] | null }
    for (const p of extraProfiles ?? []) {
      namesMap[p.id] = p.is_admin ? 'Propojo' : (p.full_name ?? 'Uživatel')
    }
  }

  const isCustomer = order.customer_id === user.id
  let canReview = false
  if (isCustomer && order.status === 'dokonceno') {
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', params.id)
      .maybeSingle() as { data: { id: string } | null }
    canReview = !existingReview
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/objednavky" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na objednávky
      </Link>

      {/* Přímá rezervace: zrušená platba ruší i rezervaci. */}
      {searchParams.platba === 'zruseno' && order.status === 'zruseno' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          <strong>Platba nebyla dokončena, termín jsme uvolnili.</strong>{' '}
          Rezervaci potvrzuje až zaplacení zálohy. Objednat se můžete znovu, pokud je termín pořád volný.
          <div className="mt-2">
            <Link href={`/sluzby/${order.service_id}`} className="font-bold underline">
              Zpět na nabídku →
            </Link>
          </div>
        </div>
      )}

      {/* Domluvený termín bez slotu: objednávka zůstává otevřená. */}
      {searchParams.platba === 'zruseno' && order.status === 'cekajici' && !order.scheduled_at && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          <strong>Platba nebyla dokončena, ale objednávku jsme nezrušili.</strong>{' '}
          Zvolený termín už není potvrzený. Můžete pokračovat v chatu a domluvit si s poskytovatelem jiný.
        </div>
      )}

      {canReview && <ReviewForm orderId={order.id} />}

      {showProposalPanel && (
        <TimeProposalPanel
          orderId={order.id}
          isProvider={isProvider}
          proposals={proposals}
          depositAmount={depositForPanel}
          scheduledAt={order.scheduled_at}
          depositStatus={order.deposit_status}
          itemName={order.service_items?.name ?? order.services?.title ?? null}
          customerName={isProvider ? (otherProfile?.full_name ?? null) : null}
          prefFrom={(order as any).pref_date_from ?? null}
          prefTo={(order as any).pref_date_to ?? null}
          prefTime={(order as any).pref_time ?? null}
        />
      )}

      {/* Preference zákazníka jen před prvním potvrzeným termínem. */}
      {isCustomer && !order.scheduled_at && order.status === 'cekajici' && proposals.length === 0 && (
        <TimePreferenceForm
          orderId={order.id}
          initialFrom={(order as any).pref_date_from ?? null}
          initialTo={(order as any).pref_date_to ?? null}
          initialTimePref={(order as any).pref_time ?? null}
        />
      )}

      <OrderDetailClient
        order={order}
        myProfile={myProfile}
        otherProfile={otherProfile}
        otherCompletedCount={otherCompletedCount ?? 0}
        initialMessages={messages ?? []}
        senderNames={namesMap}
        isProvider={isProvider}
        userId={user.id}
        platbaStav={searchParams.platba ?? null}
      />
    </div>
  )
}
