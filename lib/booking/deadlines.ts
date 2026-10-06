// lib/booking/deadlines.ts
// Vrstva 3c: hlídání lhůt rezervací. Spouští se každých 5 minut
// (/api/cron/booking-tick, Supabase pg_cron + pg_net – Vercel Hobby umí cron jen 1× denně).
//
//  1) propadnutí – poskytovatel nepotvrdil do confirm_deadline_at (48 h, nejpozději začátek termínu):
//     uvolní se preautorizace ve Stripe, termín se vrátí do kalendáře, obě strany dostanou oznámení;
//  2) připomínka poskytovateli před koncem lhůty (jednou, evidováno v order_events);
//  3) opuštěné zámky přímé rezervace a záchrana rozpracovaných plateb (dřív jen 1× denně).
//
// Každý krok běží zvlášť – chyba v jednom nesmí zastavit ostatní.

import { createNotification } from '@/lib/actions/notifications'
import { autoReleaseUnpaidReservations } from '@/lib/actions/payout'
import { terminDlouze } from '@/lib/format'
import { BOOKING_POLICY } from './policy'
import {
  BOOKING_ORDER_COLUMNS,
  releaseAuthorization,
  rescueBookings,
  type BookingOrder,
  type Db,
} from './payments'

const HOUR = 3_600_000

function nazev(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || 'Rezervace'
}

async function notify(params: Parameters<typeof createNotification>[0]) {
  try {
    await createNotification(params)
  } catch (err) {
    console.error('[deadlines] notifikace:', err)
  }
}

/** 1) Rezervace, které poskytovatel nepotvrdil včas → propadnou (bez provize, nic se nestrhne). */
export async function expireUnconfirmedBookings(db: Db, now = new Date()): Promise<{ expired: number; failed: number }> {
  const { data } = await db
    .from('orders')
    .select(BOOKING_ORDER_COLUMNS)
    .eq('booking_state', 'awaiting_confirmation')
    .lt('confirm_deadline_at', now.toISOString())
    .limit(50)

  let expired = 0
  let failed = 0
  for (const order of (data ?? []) as unknown as BookingOrder[]) {
    try {
      const ok = await releaseAuthorization(db, order, 'confirmation_expired', { type: 'system' })
      if (!ok) { failed++; continue }
      expired++
      const termin = order.scheduled_at ? ` (${terminDlouze(order.scheduled_at)})` : ''
      await notify({
        userId: order.customer_id,
        type: 'status_change',
        orderId: order.id,
        title: 'Poskytovatel rezervaci nepotvrdil včas',
        preview: `${nazev(order)}${termin} · nic nebylo strženo, blokace na kartě se uvolnila. Banka ji může ještě pár dní ukazovat jako čekající platbu.`,
      })
      await notify({
        userId: order.provider_id,
        type: 'status_change',
        orderId: order.id,
        title: 'Rezervace propadla – nepotvrdili jste ji včas',
        preview: `${nazev(order)}${termin} · zákazníkovi se uvolnila blokace na kartě, termín je znovu volný.`,
      })
    } catch (err) {
      console.error('[deadlines] propadnutí', order.id, err)
      failed++
    }
  }
  return { expired, failed }
}

/** 2) Jedna připomínka poskytovateli, když se blíží konec lhůty na potvrzení. */
export async function remindUnconfirmedBookings(db: Db, now = new Date()): Promise<{ reminded: number }> {
  const { hoursBeforeDeadline, minHoursAfterAuthorization } = BOOKING_POLICY.confirmationReminder
  const { data } = await db
    .from('orders')
    .select(BOOKING_ORDER_COLUMNS)
    .eq('booking_state', 'awaiting_confirmation')
    .gt('confirm_deadline_at', now.toISOString())
    .lte('confirm_deadline_at', new Date(now.getTime() + hoursBeforeDeadline * HOUR).toISOString())
    .lte('authorized_at', new Date(now.getTime() - minHoursAfterAuthorization * HOUR).toISOString())
    .limit(100)

  const orders = (data ?? []) as unknown as BookingOrder[]
  if (orders.length === 0) return { reminded: 0 }

  // Komu už připomínka odešla
  const { data: sent } = await db
    .from('order_events')
    .select('order_id')
    .eq('type', 'confirmation_reminder_sent')
    .in('order_id', orders.map((o) => o.id))
  const done = new Set(((sent ?? []) as { order_id: string }[]).map((r) => r.order_id))

  let reminded = 0
  for (const order of orders) {
    if (done.has(order.id) || !order.confirm_deadline_at) continue
    const hodin = Math.max(1, Math.round((new Date(order.confirm_deadline_at).getTime() - now.getTime()) / HOUR))
    // Nejdřív evidence – kdyby oznámení selhalo, raději žádná připomínka než dvě.
    // Souběh dvou běhů (oba ještě nic neviděly): oba zapíšou záznam, pošle jen ten, jehož záznam je první.
    const { data: mine } = await db
      .from('order_events')
      .insert({
        order_id: order.id,
        type: 'confirmation_reminder_sent',
        actor_type: 'system',
        payload: { deadline: order.confirm_deadline_at },
      })
      .select('id')
      .single()
    const { data: first } = await db
      .from('order_events')
      .select('id')
      .eq('order_id', order.id)
      .eq('type', 'confirmation_reminder_sent')
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!mine || !first || (first as { id: string }).id !== (mine as { id: string }).id) continue
    await notify({
      userId: order.provider_id,
      type: 'status_change',
      orderId: order.id,
      title: `Rezervace čeká na potvrzení – zbývá asi ${hodin} h`,
      preview: `${nazev(order)}${order.scheduled_at ? ` (${terminDlouze(order.scheduled_at)})` : ''} · potvrďte ji do ${terminDlouze(order.confirm_deadline_at)}, jinak propadne.`,
    })
    reminded++
  }
  return { reminded }
}

/** Celý pětiminutový běh. */
export async function runBookingTick(db: Db) {
  const [propadle, pripominky, zamky, platby] = await Promise.allSettled([
    expireUnconfirmedBookings(db),
    remindUnconfirmedBookings(db),
    // Opuštěné zámky přímé rezervace (zákazník neprošel shrnutím) – nic není předautorizováno.
    autoReleaseUnpaidReservations(),
    // Rozpracované platby a nedokončený capture – stav vždy ověří ve Stripe.
    rescueBookings(db),
  ])
  const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : { chyba: String(r.reason) })
  return {
    propadle: val(propadle),
    pripominky: val(pripominky),
    zamky: val(zamky),
    platby: val(platby),
  }
}
