'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { newOrderEmail, orderStatusEmail } from '@/lib/email/templates'
import type { ActionResult, OrderStatus } from './types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

// Admin klient pro čtení emailů z auth.users
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

async function sendNotification(to: string, subject: string, html: string) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Propojo <notifikace@propojo.cz>',
      to,
      subject,
      html,
    })
    if (error) console.error('[email]', error)
  } catch (err) {
    console.error('[email] unexpected:', err)
  }
}

export async function createOrder(values: {
  service_id: string
  provider_id: string
  message?: string
  scheduled_at?: string
  price_agreed?: number
}): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Pro objednávku musíte být přihlášeni.' }

  const { data, error } = await supabase
    .from('orders')
    .insert({ ...values, client_id: user.id })
    .select('id')
    .single()

  if (error) return { success: false, error: 'Objednávku se nepodařilo vytvořit.' }

  // Email živnostníkovi
  try {
    const [
      { data: service },
      { data: clientProfile },
      { data: providerProfile },
      providerEmail,
    ] = await Promise.all([
      supabase.from('services').select('title, price, price_unit, city').eq('id', values.service_id).single(),
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('profiles').select('full_name').eq('id', values.provider_id).single(),
      getUserEmail(values.provider_id),
    ])

    if (service && clientProfile && providerEmail) {
      const { subject, html } = newOrderEmail({
        providerName: providerProfile?.full_name ?? 'Živnostník',
        clientName: clientProfile.full_name,
        serviceTitle: service.title,
        message: values.message,
        price: service.price,
        priceUnit: service.price_unit,
        city: service.city,
        orderUrl: `${APP_URL}/dashboard/objednavky`,
      })
      await sendNotification(providerEmail, subject, html)
    }
  } catch (err) {
    console.error('[createOrder] email:', err)
  }

  revalidatePath('/dashboard/objednavky')
  return { success: true, id: data.id }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .eq('provider_id', user.id)

  if (error) return { success: false, error: 'Nepodařilo se změnit stav.' }

  // Email zákazníkovi
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('client_id, services(title), profiles!orders_provider_id_fkey(full_name)')
      .eq('id', orderId)
      .single()

    if (order) {
      const [clientEmail, { data: clientProfile }] = await Promise.all([
        getUserEmail(order.client_id),
        supabase.from('profiles').select('full_name').eq('id', order.client_id).single(),
      ])

      if (clientEmail) {
        const { subject, html } = orderStatusEmail({
          clientName: clientProfile?.full_name ?? 'Zákazník',
          serviceTitle: (order.services as any)?.title ?? 'Služba',
          providerName: (order.profiles as any)?.full_name ?? 'Živnostník',
          status,
          orderUrl: `${APP_URL}/dashboard/objednavky`,
        })
        await sendNotification(clientEmail, subject, html)
      }
    }
  } catch (err) {
    console.error('[updateOrderStatus] email:', err)
  }

  revalidatePath('/dashboard/objednavky')
  return { success: true, id: orderId }
}