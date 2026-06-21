'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { newOrderEmail, orderStatusEmail } from '@/lib/email/templates'
import type { ActionResult, OrderStatus } from './types'
import { createNotification } from '@/lib/actions/notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

// Admin klient pro čtení e-mailů z auth.users
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
  // Vypínač: bez RESEND_API_KEY e-maily tiše přeskočíme (nikdy neshodí akci).
  // Až klíč doplníš do .env.local / Vercelu, e-maily se samy zapnou.
  if (!process.env.RESEND_API_KEY) return
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
    console.error('[email] neočekávaná chyba:', err)
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

  // Pojistka: u pozastaveného poskytovatele nelze objednat.
  const { data: providerProfile } = await supabase
    .from('profiles')
    .select('is_suspended')
    .eq('id', values.provider_id)
    .single() as { data: { is_suspended: boolean | null } | null }

  if (providerProfile?.is_suspended === true) {
    return { success: false, error: 'Tento poskytovatel není momentálně dostupný.' }
  }

  // Pozn.: tabulka orders má customer_id (NE client_id) a české statusy.
  const { data, error } = await supabase
    .from('orders')
    .insert({
      service_id: values.service_id,
      provider_id: values.provider_id,
      customer_id: user.id,
      description: values.message ?? null,
      total_price: values.price_agreed ?? null,
      status: 'cekajici',
    } as any)
    .select('id')
    .single() as { data: { id: string } | null; error: any }

  if (error || !data) {
    console.error('[createOrder]', error)
    return { success: false, error: 'Objednávku se nepodařilo vytvořit.' }
  }

  // Oznámení poskytovateli o nové poptávce
  try {
    const { data: senderProfile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }
    const { data: svc } = await supabase
      .from('services').select('title').eq('id', values.service_id).single() as { data: { title: string | null } | null }

    await createNotification({
      userId: values.provider_id,
      type: 'status_change',
      orderId: data.id,
      actorId: user.id,
      title: `Nová poptávka od ${senderProfile?.full_name ?? 'zákazníka'}`,
      preview: svc?.title ?? null,
    })
  } catch (err) {
    console.error('[createOrder] notifikace:', err)
  }

  // E-mail poskytovateli (tiše přeskočí, pokud není RESEND_API_KEY)
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
      const sv = service as any
      const { subject, html } = newOrderEmail({
        providerName: (providerProfile as any)?.full_name ?? 'Živnostník',
        clientName: (clientProfile as any).full_name,
        serviceTitle: sv.title,
        message: values.message,
        price: sv.price,
        priceUnit: sv.price_unit,
        city: sv.city,
        orderUrl: `${APP_URL}/dashboard/objednavky`,
      })
      await sendNotification(providerEmail, subject, html)
    }
  } catch (err) {
    console.error('[createOrder] e-mail:', err)
  }

  revalidatePath('/dashboard/objednavky')
  return { success: true, id: data.id }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const { error } = await (supabase.from('orders') as any)
    .update({ status })
    .eq('id', orderId)
    .eq('provider_id', user.id)

  if (error) {
    console.error('[updateOrderStatus]', error)
    return { success: false, error: 'Nepodařilo se změnit stav.' }
  }

  // Oznámení zákazníkovi o změně stavu (běží vždy, nezávisle na e-mailu)
  try {
    const STATUS_TEXT: Record<string, string> = {
      prijato: 'Vaše poptávka byla přijata',
      v_procesu: 'Práce na vaší objednávce byla zahájena',
      dokonceno: 'Vaše objednávka byla dokončena',
      zruseno: 'Vaše objednávka byla zrušena',
    }
    const { data: ord } = await supabase
      .from('orders')
      .select('customer_id, services(title)')
      .eq('id', orderId)
      .single() as { data: any }

    if (ord && ord.customer_id !== user.id) {
      await createNotification({
        userId: ord.customer_id,
        type: 'status_change',
        orderId,
        actorId: user.id,
        title: STATUS_TEXT[status] ?? 'Změna stavu objednávky',
        preview: ord.services?.title ?? null,
      })
    }
  } catch (err) {
    console.error('[updateOrderStatus] notifikace:', err)
  }

  // E-mail zákazníkovi (tiše přeskočí, pokud není RESEND_API_KEY)
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id, services(title), profiles!orders_provider_id_fkey(full_name)')
      .eq('id', orderId)
      .single() as { data: any }

    if (order) {
      const [clientEmail, { data: clientProfile }] = await Promise.all([
        getUserEmail(order.customer_id),
        supabase.from('profiles').select('full_name').eq('id', order.customer_id).single(),
      ])

      if (clientEmail) {
        const { subject, html } = orderStatusEmail({
          clientName: (clientProfile as any)?.full_name ?? 'Zákazník',
          serviceTitle: order.services?.title ?? 'Služba',
          providerName: order.profiles?.full_name ?? 'Živnostník',
          status,
          orderUrl: `${APP_URL}/dashboard/objednavky`,
        })
        await sendNotification(clientEmail, subject, html)
      }
    }
  } catch (err) {
    console.error('[updateOrderStatus] e-mail:', err)
  }

  revalidatePath('/dashboard/objednavky')
  return { success: true, id: orderId }
}

// Odeslání zprávy v rámci objednávky (chat).
// RLS na tabulce messages musí povolit insert/select účastníkům objednávky.
export async function sendOrderMessage(
  orderId: string,
  content: string
): Promise<ActionResult & { message?: any }> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Nejste přihlášeni.' }

  const trimmed = content.trim()
  if (!trimmed) return { success: false, error: 'Zpráva je prázdná.' }

  const { data, error } = await (supabase.from('messages') as any)
    .insert({
      order_id: orderId,
      sender_id: user.id,
      content: trimmed,
    })
    .select('*')
    .single() as { data: any; error: any }

  if (error || !data) {
    console.error('[sendOrderMessage]', error)
    return { success: false, error: 'Zprávu se nepodařilo odeslat.' }
  }

  // Oznámení druhé straně o nové zprávě
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id, provider_id, services(title)')
      .eq('id', orderId)
      .single() as { data: any }

    if (order) {
      const recipientId = order.customer_id === user.id ? order.provider_id : order.customer_id
      const { data: senderProfile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }

      await createNotification({
        userId: recipientId,
        type: 'new_message',
        orderId,
        actorId: user.id,
        title: `Nová zpráva od ${senderProfile?.full_name ?? 'uživatele'}`,
        preview: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
      })
    }
  } catch (err) {
    console.error('[sendOrderMessage] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, id: data.id, message: data }
}