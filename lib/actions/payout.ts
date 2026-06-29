'use server'
// lib/actions/payout.ts
// Vrstva 4a: uvolnění držené zálohy poskytovateli (transfer) a vratka zákazníkovi (refund).
// Poskytovatel nese Stripe poplatek – převádí se ČISTÁ částka, která reálně přitekla.
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { revalidatePath } from 'next/cache'
import { createNotification } from '@/lib/actions/notifications'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Result = { success: true } | { success: false; error: string }

// Zjistí, kolik z platby reálně přiteklo na Propojo (částka po odečtení Stripe poplatku),
// v haléřích. Čte balance transaction navázanou na payment intent.
async function getNetAmount(paymentIntentId: string): Promise<number | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    })
    const charge: any = (pi as any).latest_charge
    const bt: any = charge?.balance_transaction
    if (bt && typeof bt.net === 'number') {
      return bt.net // čistá částka v haléřích (po poplatku)
    }
    return null
  } catch (err) {
    console.error('[payout] getNetAmount error:', err)
    return null
  }
}

// ── UVOLNĚNÍ ZÁLOHY POSKYTOVATELI ─────────────────────────
export async function releaseDeposit(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, customer_id, provider_id, status, deposit_status, deposit_amount, stripe_payment_intent_id,
      profiles!orders_provider_id_fkey(stripe_account_id, stripe_payouts_enabled)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Potvrdit může jen zákazník objednávky.' }
  }
  if (order.status !== 'ceka_potvrzeni') {
    return { success: false, error: 'Objednávka není připravená k potvrzení.' }
  }

  const admin = getAdminClient()

  if (order.deposit_status === 'paid') {
    const providerAccount = order.profiles?.stripe_account_id
    const nominal = Number(order.deposit_amount ?? 0)

    if (nominal > 0 && providerAccount && order.stripe_payment_intent_id) {
      // Zjistíme ČISTOU částku (po Stripe poplatku) – tu převedeme poskytovateli
      const net = await getNetAmount(order.stripe_payment_intent_id)
      const amountToTransfer = net ?? Math.round(nominal * 100) // fallback nominál v haléřích

      try {
        await stripe.transfers.create({
          amount: amountToTransfer,
          currency: 'czk',
          destination: providerAccount,
          metadata: { order_id: orderId, kind: 'deposit_release' },
        })
      } catch (err) {
        console.error('[releaseDeposit] transfer error:', err)
        return { success: false, error: 'Uvolnění zálohy se nepodařilo. Zkuste to znovu.' }
      }

      await (admin.from('orders') as any)
        .update({ deposit_status: 'released', status: 'dokonceno' })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'dokonceno' })
        .eq('id', orderId)
    }
  } else {
    await (admin.from('orders') as any)
      .update({ status: 'dokonceno' })
      .eq('id', orderId)
  }

  try {
    let jmeno = 'Zákazník'
    const { data: cust } = await admin
      .from('profiles').select('full_name').eq('id', order.customer_id).single() as { data: { full_name: string | null } | null }
    if (cust?.full_name) jmeno = cust.full_name

    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: order.deposit_status === 'paid'
        ? `${jmeno} potvrdil – záloha vám byla uvolněna`
        : `${jmeno} potvrdil dokončení`,
      preview: null,
    })
  } catch (err) {
    console.error('[releaseDeposit] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true }
}

// ── VRATKA ZÁKAZNÍKOVI (REFUND) ───────────────────────────
export async function refundDeposit(orderId: string, byUserId: string): Promise<Result> {
  const admin = getAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, deposit_status, stripe_payment_intent_id')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }

  if (order.deposit_status !== 'paid') {
    return { success: true } // není co vracet
  }
  if (!order.stripe_payment_intent_id) {
    console.error('[refundDeposit] chybí payment_intent_id pro', orderId)
    return { success: false, error: 'Chybí údaj o platbě.' }
  }

  try {
    await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      metadata: { order_id: orderId, kind: 'deposit_refund' },
    })
  } catch (err) {
    console.error('[refundDeposit] refund error:', err)
    return { success: false, error: 'Vratku se nepodařilo provést.' }
  }

  await (admin.from('orders') as any)
    .update({ deposit_status: 'refunded' })
    .eq('id', orderId)

  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: byUserId,
      title: 'Záloha vám byla vrácena',
      preview: null,
    })
  } catch (err) {
    console.error('[refundDeposit] notifikace:', err)
  }

  return { success: true }
}