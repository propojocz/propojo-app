'use server'
// lib/actions/booking.ts
// Model v2: akce nad rezervací, které nehýbou penězi.
//
// cancelBeforePayment – zrušení (zákazník) / odmítnutí (poskytovatel) objednávky, u které
// ještě nic nebylo předautorizováno: domluva termínu, přijatý termín čekající na platbu,
// rozpracovaná platba. Po předautorizaci se ruší jinak (uvolnění / refund – vrstvy 3 a 4).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/actions/notifications'
import { updateOrderStatus } from '@/lib/actions/orders'
import { adminDb, cancelPendingPayment, loadBookingOrder } from '@/lib/booking/payments'

type Result = { success: true } | { success: false; error: string }

export async function cancelBeforePayment(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const db = adminDb()
  const order = await loadBookingOrder(db, orderId)
  if (!order) return { success: false, error: 'Objednávka nenalezena.' }

  const by = order.customer_id === user.id ? 'customer' : order.provider_id === user.id ? 'provider' : null
  if (!by) return { success: false, error: 'K této objednávce nemáte přístup.' }

  // Rozpracovaná platba: ukončit checkout a posunout stav rezervace.
  if (order.booking_state === 'pending_payment') {
    const ok = await cancelPendingPayment(db, order, by, user.id)
    if (!ok) {
      return { success: false, error: 'Objednávku se nepodařilo zrušit – platba mezitím nejspíš proběhla. Obnovte stránku.' }
    }
    const nazev = order.service_items?.name || order.services?.title || 'Objednávka'
    await createNotification({
      userId: by === 'customer' ? order.provider_id : order.customer_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: by === 'customer' ? 'Zákazník objednávku zrušil' : 'Poskytovatel objednávku odmítl',
      preview: `${nazev} · platba nebyla dokončena, nic nebylo strženo.`,
    })
    revalidatePath('/dashboard/objednavky')
    revalidatePath('/dashboard/terminy')
    revalidatePath(`/dashboard/objednavky/${orderId}`)
    return { success: true }
  }

  // Rezervace ještě nevznikla (domluva, přijatý termín bez otevřené platby) nebo platba vypršela:
  // obyčejné zrušení objednávky bez peněz (uvolní termín a dá vědět druhé straně).
  if (order.booking_state === null || order.booking_state === 'payment_expired') {
    if (order.status !== 'cekajici' && order.status !== 'prijato') {
      return { success: false, error: 'Tuto objednávku už nelze zrušit.' }
    }
    const res = await updateOrderStatus(orderId, 'zruseno' as any)
    return res.success ? { success: true } : { success: false, error: res.error ?? 'Nepodařilo se zrušit.' }
  }

  return { success: false, error: 'Po zaplacení se rezervace ruší jinak – tato možnost bude doplněna.' }
}
