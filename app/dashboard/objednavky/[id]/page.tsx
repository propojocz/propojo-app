// app/dashboard/objednavky/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OrderDetailClient from './OrderDetailClient'
import ReviewForm from '@/components/ui/ReviewForm'

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
  services: ServiceLite | null
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

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, services(id, title, price, price_unit, category, city, description, payment_model, deposit_amount, quote_fee)')
    .eq('id', params.id)
    .single() as { data: OrderRow | null; error: any }

  if (error || !order) notFound()

  if (order.customer_id !== user.id && order.provider_id !== user.id) notFound()

  const isProvider = order.provider_id === user.id
  const otherId = isProvider ? order.customer_id : order.provider_id

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

  // Historie zpráv
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true }) as { data: MessageRow[] | null }

  // Mapa jmen VŠECH, kdo v chatu psali (vč. admina/Propojo, pokud zasáhl).
  // Slouží k zobrazení jména nad cizími bublinami.
  const senderIds = Array.from(new Set((messages ?? []).map((m) => m.sender_id)))
  const namesMap: Record<string, string> = {}
  // Předvyplníme z už načtených profilů
  if (myProfile?.id) namesMap[myProfile.id] = myProfile.full_name ?? 'Já'
  if (otherProfile?.id) namesMap[otherProfile.id] = otherProfile.full_name ?? (isProvider ? 'Zákazník' : 'Živnostník')
  // Dohledáme zbylé (typicky admin/Propojo)
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

      {canReview && <ReviewForm orderId={order.id} />}

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