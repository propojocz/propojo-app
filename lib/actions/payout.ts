'use server'
// lib/actions/payout.ts
// Vrstva 4a: uvolnění zálohy poskytovateli (transfer), vratka zákazníkovi (refund),
// a řešení sporu adminem (resolveDispute). Poskytovatel nese Stripe poplatek.
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

// Čistá částka (po Stripe poplatku) v haléřích z payment intentu
async function getNetAmount(paymentIntentId: string): Promise<number | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    })
    const charge: any = (pi as any).latest_charge
    const bt: any = charge?.balance_transaction
    if (bt && typeof bt.net === 'number') return bt.net
    return null
  } catch (err) {
    console.error('[payout] getNetAmount error:', err)
    return null
  }
}

// Provede transfer čisté částky poskytovateli. Vrací true při úspěchu.
async function doTransfer(paymentIntentId: string | null, nominal: number, providerAccount: string): Promise<boolean> {
  try {
    let amount = Math.round(nominal * 100)
    if (paymentIntentId) {
      const net = await getNetAmount(paymentIntentId)
      if (net) amount = net
    }
    await stripe.transfers.create({
      amount,
      currency: 'czk',
      destination: providerAccount,
      metadata: { kind: 'deposit_release' },
    })
    return true
  } catch (err) {
    console.error('[payout] doTransfer error:', err)
    return false
  }
}

// Provede refund zákazníkovi. Vrací true při úspěchu.
async function doRefund(paymentIntentId: string): Promise<boolean> {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      metadata: { kind: 'deposit_refund' },
    })
    return true
  } catch (err) {
    console.error('[payout] doRefund error:', err)
    return false
  }
}

// Refund KONKRÉTNÍ částky (haléře) zákazníkovi – pro split.
async function doPartialRefund(paymentIntentId: string, amountHaler: number): Promise<boolean> {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountHaler,
      metadata: { kind: 'deposit_split_refund' },
    })
    return true
  } catch (err) {
    console.error('[payout] doPartialRefund error:', err)
    return false
  }
}

// Transfer KONKRÉTNÍ částky (haléře) poskytovateli – pro split.
async function doPartialTransfer(amountHaler: number, providerAccount: string): Promise<boolean> {
  try {
    await stripe.transfers.create({
      amount: amountHaler,
      currency: 'czk',
      destination: providerAccount,
      metadata: { kind: 'deposit_split_release' },
    })
    return true
  } catch (err) {
    console.error('[payout] doPartialTransfer error:', err)
    return false
  }
}

// ── UVOLNĚNÍ ZÁLOHY POSKYTOVATELI (zákazník potvrdí) ──────
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

    if (nominal > 0 && providerAccount) {
      const ok = await doTransfer(order.stripe_payment_intent_id, nominal, providerAccount)
      if (!ok) return { success: false, error: 'Uvolnění zálohy se nepodařilo. Zkuste to znovu.' }
      await (admin.from('orders') as any)
        .update({ deposit_status: 'released', status: 'dokonceno' })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any).update({ status: 'dokonceno' }).eq('id', orderId)
    }
  } else {
    await (admin.from('orders') as any).update({ status: 'dokonceno' }).eq('id', orderId)
  }

  try {
    let jmeno = 'Zákazník'
    const { data: cust } = await admin.from('profiles').select('full_name').eq('id', order.customer_id).single() as { data: { full_name: string | null } | null }
    if (cust?.full_name) jmeno = cust.full_name
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: order.deposit_status === 'paid' ? `${jmeno} potvrdil – záloha vám byla uvolněna` : `${jmeno} potvrdil dokončení`,
      preview: null,
    })
  } catch (err) {
    console.error('[releaseDeposit] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true }
}

// ── VRATKA ZÁKAZNÍKOVI (zrušení) ──────────────────────────
export async function refundDeposit(orderId: string, byUserId: string): Promise<Result> {
  const admin = getAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, deposit_status, stripe_payment_intent_id')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.deposit_status !== 'paid') return { success: true }
  if (!order.stripe_payment_intent_id) {
    console.error('[refundDeposit] chybí payment_intent_id pro', orderId)
    return { success: false, error: 'Chybí údaj o platbě.' }
  }

  const ok = await doRefund(order.stripe_payment_intent_id)
  if (!ok) return { success: false, error: 'Vratku se nepodařilo provést.' }

  await (admin.from('orders') as any).update({ deposit_status: 'refunded' }).eq('id', orderId)

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

// ── NAHLÁŠENÍ SPORU (zákazník) ────────────────────────────
export async function reportDispute(orderId: string, reason: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const trimmed = reason.trim()
  if (!trimmed) return { success: false, error: 'Napište prosím, v čem je problém.' }

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, provider_id, status')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Problém může nahlásit jen zákazník objednávky.' }
  }
  if (order.status !== 'ceka_potvrzeni') {
    return { success: false, error: 'Problém lze nahlásit jen u zakázky čekající na potvrzení.' }
  }

  const admin = getAdminClient()
  await (admin.from('orders') as any)
    .update({
      status: 'spor',
      dispute_reason: trimmed,
      dispute_created_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // Notifikace poskytovateli
  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: 'Zákazník nahlásil problém – řeší Propojo',
      preview: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
    })
  } catch (err) {
    console.error('[reportDispute] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true }
}

// ── ŘEŠENÍ SPORU ADMINEM ──────────────────────────────────
// decision: 'provider' = uvolnit poskytovateli, 'customer' = vrátit zákazníkovi
export async function resolveDispute(orderId: string, decision: 'provider' | 'customer' | 'split'): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  // Ověříme, že volá admin
  const { data: me } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean | null } | null }
  if (me?.is_admin !== true) {
    return { success: false, error: 'Tuto akci může provést jen administrátor.' }
  }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select(`
      id, customer_id, provider_id, status, deposit_status, deposit_amount, stripe_payment_intent_id,
      profiles!orders_provider_id_fkey(stripe_account_id)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.status !== 'spor') {
    return { success: false, error: 'Tato objednávka není ve sporu.' }
  }

  if (decision === 'split') {
    // Rozdělit 50:50. Bezpečně: zákazníkovi vrátíme polovinu ZAPLACENÉ částky,
    // poskytovateli pošleme zbytek toho, co reálně přiteklo (po Stripe poplatku).
    // Tím se Propojo nikdy nedostane do mínusu; poplatek nese poskytovatel.
    if (order.deposit_status === 'paid' && order.stripe_payment_intent_id) {
      const providerAccount = order.profiles?.stripe_account_id
      const nominal = Number(order.deposit_amount ?? 0)
      const nominalHaler = Math.round(nominal * 100)
      const refundHaler = Math.round(nominalHaler / 2) // polovina zaplaceného zpět zákazníkovi

      // Kolik reálně přiteklo (po poplatku)
      const net = await getNetAmount(order.stripe_payment_intent_id) ?? nominalHaler
      const transferHaler = net - refundHaler // zbytek poskytovateli

      // 1) Refund poloviny zákazníkovi
      const refundOk = await doPartialRefund(order.stripe_payment_intent_id, refundHaler)
      if (!refundOk) return { success: false, error: 'Vratku poloviny se nepodařilo provést.' }

      // 2) Transfer zbytku poskytovateli (jen pokud má účet a zbývá co poslat)
      if (providerAccount && transferHaler > 0) {
        const transferOk = await doPartialTransfer(transferHaler, providerAccount)
        if (!transferOk) return { success: false, error: 'Převod poloviny poskytovateli se nepodařil. Vratka zákazníkovi už proběhla – řešte ručně.' }
      }

      await (admin.from('orders') as any)
        .update({ deposit_status: 'refunded', status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    }
    try {
      await createNotification({ userId: order.customer_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor uzavřen – záloha rozdělena napůl', preview: null })
      await createNotification({ userId: order.provider_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor uzavřen – záloha rozdělena napůl', preview: null })
    } catch {}
  } else if (decision === 'provider') {
    // Uvolnit poskytovateli
    if (order.deposit_status === 'paid') {
      const providerAccount = order.profiles?.stripe_account_id
      const nominal = Number(order.deposit_amount ?? 0)
      if (nominal > 0 && providerAccount) {
        const ok = await doTransfer(order.stripe_payment_intent_id, nominal, providerAccount)
        if (!ok) return { success: false, error: 'Uvolnění se nepodařilo.' }
        await (admin.from('orders') as any)
          .update({ deposit_status: 'released', status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
          .eq('id', orderId)
      } else {
        await (admin.from('orders') as any)
          .update({ status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
          .eq('id', orderId)
      }
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    }
    try {
      await createNotification({ userId: order.provider_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor rozhodnut ve váš prospěch – záloha uvolněna', preview: null })
      await createNotification({ userId: order.customer_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor byl uzavřen', preview: null })
    } catch {}
  } else {
    // Vrátit zákazníkovi
    if (order.deposit_status === 'paid' && order.stripe_payment_intent_id) {
      const ok = await doRefund(order.stripe_payment_intent_id)
      if (!ok) return { success: false, error: 'Vratku se nepodařilo provést.' }
      await (admin.from('orders') as any)
        .update({ deposit_status: 'refunded', status: 'zruseno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'zruseno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    }
    try {
      await createNotification({ userId: order.customer_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor rozhodnut ve váš prospěch – záloha vrácena', preview: null })
      await createNotification({ userId: order.provider_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor byl uzavřen', preview: null })
    } catch {}
  }

  revalidatePath('/admin/spory')
  revalidatePath(`/admin/spory/${orderId}`)
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}

// ── ADMIN NAPÍŠE ZPRÁVU DO CHATU OBJEDNÁVKY ───────────────
// Pošle zprávu jménem přihlášeného admina do konverzace dané objednávky.
export async function adminMessageToOrder(orderId: string, content: string, imageUrl?: string | null): Promise<Result & { message?: any }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: me } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean | null } | null }
  if (me?.is_admin !== true) {
    return { success: false, error: 'Tuto akci může provést jen administrátor.' }
  }

  const trimmed = content.trim()
  const img = imageUrl?.trim() || null
  if (!trimmed && !img) return { success: false, error: 'Zpráva je prázdná.' }

  const admin = getAdminClient()
  const { data: inserted, error } = await (admin.from('messages') as any).insert({
    order_id: orderId,
    sender_id: user.id,
    content: trimmed,
    image_url: img,
    is_admin: true,
  }).select('*').single()
  if (error) {
    console.error('[adminMessageToOrder]', error)
    return { success: false, error: 'Zprávu se nepodařilo odeslat.' }
  }

  // Notifikace oběma stranám
  try {
    const { data: order } = await admin
      .from('orders').select('customer_id, provider_id').eq('id', orderId).single() as { data: any }
    if (order) {
      for (const uid of [order.customer_id, order.provider_id]) {
        await createNotification({
          userId: uid,
          type: 'new_message',
          orderId,
          actorId: user.id,
          title: 'Zpráva od podpory Propojo',
          preview: trimmed ? (trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed) : '📷 Fotka',
        })
      }
    }
  } catch (err) {
    console.error('[adminMessageToOrder] notifikace:', err)
  }

  revalidatePath(`/admin/spory/${orderId}`)
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, message: inserted }
}