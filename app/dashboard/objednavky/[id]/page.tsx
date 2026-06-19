// app/dashboard/objednavky/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OrderDetailClient from './OrderDetailClient'

interface Props { params: { id: string } }

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

export default async function OrderDetailPage({ params }: Props) {
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

  // Profily obou stran (u druhé strany i created_at kvůli "na Propojo od…")
  const [myProfileRes, otherProfileRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city, created_at').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city, created_at').eq('id', otherId).single(),
  ])
  const myProfile = myProfileRes.data as ProfileLite | null
  const otherProfile = otherProfileRes.data as ProfileLite | null

  // Počet DOKONČENÝCH objednávek druhé strany (signál důvěry).
  // U zákazníka počítáme jeho objednávky (customer_id), u poskytovatele jeho zakázky (provider_id).
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

  return (
    <div className="space-y-4">
      <Link href="/dashboard/objednavky" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na objednávky
      </Link>

      <OrderDetailClient
        order={order}
        myProfile={myProfile}
        otherProfile={otherProfile}
        otherCompletedCount={otherCompletedCount ?? 0}
        initialMessages={messages ?? []}
        isProvider={isProvider}
        userId={user.id}
      />
    </div>
  )
}