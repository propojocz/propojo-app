// lib/booking/notices.ts
// E-maily k rezervaci, které slouží jako trvalý záznam (VOP 8.3): potvrzení rezervace po stržení platby.
// Posílá se jednou (order_events „booking_confirmation_sent“) bez ohledu na cestu potvrzení:
// poskytovatel v aplikaci, stržení ve Stripe Dashboardu, automatické potvrzení termínu od poskytovatele.

import { sendEmail } from '@/lib/email/send'
import { bookingConfirmedEmail } from '@/lib/email/templates'
import { rozsahCasu, terminDlouze } from '@/lib/format'
import { cancellationRules, paymentLabel, paymentMeaning } from './texts'
import { logOrderEvent, type BookingOrder, type Db } from './payments'
import type { OfferKind } from './policy'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

async function emailOf(db: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

export async function sendBookingConfirmedEmail(db: Db, order: BookingOrder): Promise<void> {
  try {
    const kind = order.offer_kind as OfferKind | null
    if (!kind) return
    const { data: sent } = await db.from('order_events').select('id').eq('order_id', order.id).eq('type', 'booking_confirmation_sent').limit(1)
    if ((sent ?? []).length > 0) return

    const to = await emailOf(db, order.customer_id)
    if (!to) return

    const { data: row } = await db
      .from('orders')
      .select('service_location, location_address, provider_place_address, quote_fee_deductible, services(address, city, phone), service_items(quote_fee_deductible)')
      .eq('id', order.id)
      .maybeSingle()
    const o = row as any
    const { data: prof } = await db.from('profiles').select('full_name, company_name, ico, phone').eq('id', order.provider_id).maybeSingle()
    const p = prof as { full_name: string | null; company_name: string | null; ico: string | null; phone: string | null } | null
    const { data: req } = await db.from('booking_consents').select('id').eq('order_id', order.id).eq('kind', 'customer_early_performance_request').limit(1)
    const earlyRequest = (req ?? []).length > 0

    const atProvider = o?.service_location === 'u_poskytovatele'
    const placeText = atProvider
      ? (o?.services?.address ?? o?.provider_place_address ?? o?.services?.city ?? null)
      : (o?.location_address ?? null)
    const termText = order.scheduled_at
      ? (kind === 'B' && order.scheduled_end
          ? `${terminDlouze(order.scheduled_at)} (okno příjezdu ${rozsahCasu(order.scheduled_at, order.scheduled_end)})`
          : terminDlouze(order.scheduled_at))
      : null
    const deductible = (o?.service_items?.quote_fee_deductible ?? o?.quote_fee_deductible) === true
    // Vrstva 6: z toho doprava podle km (samostatný dotaz – sloupce nemusí existovat)
    const { data: tr } = await db.from('orders').select('travel_km, travel_fee_halere, travel_estimated').eq('id', order.id).maybeSingle()
    const t = tr as { travel_km: number | null; travel_fee_halere: number | null; travel_estimated: boolean | null } | null
    const travelNote = t?.travel_fee_halere
      ? ` (z toho doprava ${(t.travel_fee_halere / 100).toLocaleString('cs-CZ')} Kč, ${Number(t.travel_km ?? 0).toLocaleString('cs-CZ')} km${t.travel_estimated ? ' – odhad' : ''})`
      : ''

    const rules = [
      'Když poskytovatel rezervaci zruší, nedorazí, nebo nemůže dodržet termín a nový termín odmítnete, vrátí se vám celá zaplacená částka automaticky.',
      ...cancellationRules(kind, false).slice(-1),
      `Všechna pravidla: ${APP_URL}/storno`,
    ]
    const withdrawalText = kind === 'C'
      ? 'U výrobku na míru právo odstoupit od rezervace nevzniká.'
      : earlyRequest || kind === 'B'
        ? 'Požádali jste o provedení před uplynutím 14denní lhůty pro odstoupení. Do provedení můžete od rezervace odstoupit v jejím detailu, provedením právo zaniká.'
        : 'Od rezervace můžete do 14 dnů odstoupit v jejím detailu. Poskytovatel vám pak zaplacenou částku vrátí.'

    const mail = bookingConfirmedEmail({
      provider: {
        displayName: p?.company_name || p?.full_name || 'Poskytovatel',
        legalName: p?.company_name && p?.full_name ? p.full_name : null,
        ico: p?.ico ?? null,
        phone: o?.services?.phone || p?.phone || null,
        email: await emailOf(db, order.provider_id),
      },
      serviceTitle: order.service_items?.name || order.services?.title || (kind === 'B' ? 'Výjezd a nacenění' : 'Rezervace'),
      termText,
      placeText,
      paymentLabel: paymentLabel(kind),
      amountText: `${(Number(order.charge_halere ?? 0) / 100).toLocaleString('cs-CZ')} Kč${travelNote}`,
      paymentMeaning: paymentMeaning(kind, deductible),
      cancellationRules: rules,
      withdrawalText,
      orderUrl: `${APP_URL}/dashboard/objednavky/${order.id}`,
    })
    if (await sendEmail(to, mail.subject, mail.html)) {
      await logOrderEvent(db, order.id, 'booking_confirmation_sent', { type: 'system' }, {})
    }
  } catch (err) {
    console.error('[notices] potvrzení rezervace:', err)
  }
}
