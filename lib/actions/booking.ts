'use server'
// lib/actions/booking.ts
// Model v2: akce nad rezervací z obrazovky objednávky. Pravidla peněz jsou v lib/booking,
// tady jen ověření, kdo akci dělá, a notifikace.
//
// cancelBeforePayment – zrušení (zákazník) / odmítnutí (poskytovatel) dokud se nic nestrhlo:
//   domluva termínu, přijatý termín čekající na platbu, rozpracovaná platba
//   a u zákazníka i předautorizovaná rezervace čekající na potvrzení (jen uvolní blokaci, §8).
// confirmBooking – poskytovatel potvrdí = capture. Teprve úspěšný capture znamená „potvrzeno“ (§4).
// declineBooking – poskytovatel odmítne předautorizovanou rezervaci = uvolnění blokace.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/actions/notifications'
import { updateOrderStatus } from '@/lib/actions/orders'
import {
  adminDb,
  cancelPendingPayment,
  captureBooking,
  loadBookingOrder,
  releaseAuthorization,
  type BookingOrder,
} from '@/lib/booking/payments'

type Result = { success: true } | { success: false; error: string }

function revalidateOrder(orderId: string) {
  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  revalidatePath(`/dashboard/objednavky/${orderId}`)
}

function orderName(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || 'Objednávka'
}

async function loadForUser(orderId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Nejste přihlášeni.' }
  const db = adminDb()
  const order = await loadBookingOrder(db, orderId)
  if (!order) return { ok: false as const, error: 'Objednávka nenalezena.' }
  const by = order.customer_id === user.id ? 'customer' : order.provider_id === user.id ? 'provider' : null
  if (!by) return { ok: false as const, error: 'K této objednávce nemáte přístup.' }
  return { ok: true as const, db, order, by: by as 'customer' | 'provider', userId: user.id }
}

const REASON_MAX = 500

/** Nepovinná zpráva poskytovatele zákazníkovi, proč rezervaci ruší / odmítá – jde do chatu objednávky. */
async function postReason(db: ReturnType<typeof adminDb>, orderId: string, senderId: string, reason?: string | null) {
  const text = (reason ?? '').trim().slice(0, REASON_MAX)
  if (!text) return null
  const { error } = await (db.from('messages') as any).insert({ order_id: orderId, sender_id: senderId, content: text })
  if (error) console.error('[booking] zpráva s důvodem:', error.message)
  return text
}

function withReason(base: string, reason: string | null): string {
  return reason ? `${base} Zpráva: „${reason.length > 80 ? `${reason.slice(0, 80)}…` : reason}“` : base
}

export async function cancelBeforePayment(orderId: string, reason?: string | null): Promise<Result> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx

  // Rozpracovaná platba: ukončit checkout a posunout stav rezervace.
  if (order.booking_state === 'pending_payment') {
    const ok = await cancelPendingPayment(db, order, by, userId)
    if (!ok) {
      return { success: false, error: 'Objednávku se nepodařilo zrušit – platba mezitím nejspíš proběhla. Obnovte stránku.' }
    }
    const text = by === 'provider' ? await postReason(db, orderId, userId, reason) : null
    await createNotification({
      userId: by === 'customer' ? order.provider_id : order.customer_id,
      type: 'status_change',
      orderId,
      actorId: userId,
      title: by === 'customer' ? 'Zákazník objednávku zrušil' : 'Poskytovatel objednávku zrušil',
      preview: withReason(`${orderName(order)} · nic nebylo strženo.`, text),
    })
    revalidateOrder(orderId)
    return { success: true }
  }

  // Zákazník ruší předautorizovanou rezervaci, kterou poskytovatel ještě nepotvrdil:
  // jen se uvolní blokace na kartě, nic se nevrací (§8). Poskytovatel tady odmítá přes declineBooking.
  if (order.booking_state === 'awaiting_confirmation' && by === 'customer') {
    const ok = await releaseAuthorization(db, order, 'customer_cancelled', { type: 'customer', id: userId })
    if (!ok) {
      return { success: false, error: 'Rezervaci se nepodařilo zrušit – poskytovatel ji mezitím nejspíš potvrdil. Obnovte stránku.' }
    }
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: userId,
      title: 'Zákazník rezervaci zrušil',
      preview: `${orderName(order)} · před vaším potvrzením, blokace na kartě se uvolnila.`,
    })
    revalidateOrder(orderId)
    return { success: true }
  }

  // Rezervace ještě nevznikla (domluva, přijatý termín bez otevřené platby) nebo platba vypršela:
  // obyčejné zrušení objednávky bez peněz (uvolní termín a dá vědět druhé straně).
  if (order.booking_state === null || order.booking_state === 'payment_expired') {
    if (order.status !== 'cekajici' && order.status !== 'prijato') {
      return { success: false, error: 'Tuto objednávku už nelze zrušit.' }
    }
    const res = await updateOrderStatus(orderId, 'zruseno' as any)
    if (res.success && by === 'provider') await postReason(db, orderId, userId, reason)
    return res.success ? { success: true } : { success: false, error: res.error ?? 'Nepodařilo se zrušit.' }
  }

  return { success: false, error: 'Potvrzenou rezervaci zatím nelze zrušit v aplikaci – tato možnost bude doplněna.' }
}

export async function confirmBooking(orderId: string): Promise<Result> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx
  if (by !== 'provider') return { success: false, error: 'Rezervaci potvrzuje poskytovatel.' }
  if (order.booking_state !== 'awaiting_confirmation') {
    return { success: false, error: 'Rezervaci teď nelze potvrdit. Obnovte stránku.' }
  }
  // Lhůta: 48 h od předautorizace, vždy ale nejpozději začátek termínu (§4).
  if (order.confirm_deadline_at && new Date(order.confirm_deadline_at).getTime() <= Date.now()) {
    return { success: false, error: 'Lhůta na potvrzení už uplynula, rezervaci nelze potvrdit.' }
  }

  // captureBooking zapíše stav a provizi; notifikaci zákazníkovi pošle handleCaptured.
  const res = await captureBooking(db, order, { type: 'provider', id: userId })
  revalidateOrder(orderId)
  if (!res.ok) return { success: false, error: res.error }
  return { success: true }
}

export async function declineBooking(orderId: string, reason?: string | null): Promise<Result> {
  const ctx = await loadForUser(orderId)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { db, order, by, userId } = ctx
  if (by !== 'provider') return { success: false, error: 'Rezervaci odmítá poskytovatel.' }
  if (order.booking_state !== 'awaiting_confirmation') {
    return { success: false, error: 'Rezervaci teď nelze odmítnout. Obnovte stránku.' }
  }

  const ok = await releaseAuthorization(db, order, 'provider_declined', { type: 'provider', id: userId })
  if (!ok) return { success: false, error: 'Rezervaci se nepodařilo odmítnout. Zkuste to prosím znovu.' }
  const text = await postReason(db, orderId, userId, reason)
  await createNotification({
    userId: order.customer_id,
    type: 'status_change',
    orderId,
    actorId: userId,
    title: 'Poskytovatel rezervaci nepotvrdil',
    preview: withReason(`${orderName(order)} · blokace na kartě se uvolnila, nic nebylo strženo.`, text),
  })
  revalidateOrder(orderId)
  return { success: true }
}
