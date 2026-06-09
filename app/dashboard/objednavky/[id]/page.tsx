// app/dashboard/objednavky/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OrderDetailClient from './OrderDetailClient'

interface Props { params: { id: string } }

export default async function OrderDetailPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit')

  // Načti objednávku
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, services(id, title, price, price_unit, category, city, description)')
    .eq('id', params.id)
    .single()

  if (error || !order) notFound()

  // Ověř že uživatel je účastník
  if (order.client_id !== user.id && order.provider_id !== user.id) notFound()

  const isProvider = order.provider_id === user.id

  // Načti profily obou stran
  const otherId = isProvider ? order.client_id : order.provider_id
  const [{ data: myProfile }, { data: otherProfile }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name, avatar_url, phone, city').eq('id', otherId).single(),
  ])

  // Načti historii zpráv
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-4">
      <Link href="/dashboard/objednavky" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na objednávky
      </Link>

      <OrderDetailClient
        order={order}
        myProfile={myProfile}
        otherProfile={otherProfile}
        initialMessages={messages ?? []}
        isProvider={isProvider}
        userId={user.id}
      />
    </div>
  )
}
