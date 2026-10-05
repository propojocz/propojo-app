// app/api/kalendar/[orderId]/route.ts
// Událost do kalendáře (.ics) pro potvrzenou rezervaci – otevře ji Google, Apple i Outlook kalendář.
// Jen pro zákazníka nebo poskytovatele té objednávky a jen u potvrzené rezervace (platba stržená),
// aby se v kalendáři nikdy neobjevil nepotvrzený termín.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminDb } from '@/lib/booking/payments'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export async function GET(_req: Request, { params }: { params: { orderId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nejste přihlášeni.' }, { status: 401 })

  const db = adminDb()
  const { data } = await db
    .from('orders')
    .select('id, customer_id, provider_id, booking_state, offer_kind, scheduled_at, scheduled_end, service_location, location_address, location_city, service_items(name), services(title, address, city, location_type)')
    .eq('id', params.orderId)
    .maybeSingle()
  const o = data as any
  if (!o || (o.customer_id !== user.id && o.provider_id !== user.id)) {
    return NextResponse.json({ error: 'Objednávka nenalezena.' }, { status: 404 })
  }
  if (o.booking_state !== 'confirmed' || !o.scheduled_at) {
    return NextResponse.json({ error: 'Do kalendáře jde přidat jen potvrzená rezervace.' }, { status: 400 })
  }

  const isProvider = o.provider_id === user.id
  const nazev = o.service_items?.name || o.services?.title || 'Rezervace'
  const atCustomer = o.service_location
    ? o.service_location === 'u_zakaznika'
    : o.services?.location_type !== 'u_poskytovatele'
  const misto = atCustomer ? (o.location_address ?? o.location_city ?? '') : (o.services?.address ?? o.services?.city ?? '')
  const konec = o.scheduled_end ?? new Date(new Date(o.scheduled_at).getTime() + 60 * 60_000).toISOString()
  const summary = o.offer_kind === 'B'
    ? (isProvider ? `Výjezd: ${nazev}` : `Přijede poskytovatel: ${nazev}`)
    : nazev
  const popis = `${o.offer_kind === 'B' ? 'Čas je okno příjezdu. ' : ''}Detail rezervace: ${APP_URL}/dashboard/objednavky/${o.id}`

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Propojo//Rezervace//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${o.id}@propojo.cz`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(o.scheduled_at)}`,
    `DTEND:${icsDate(konec)}`,
    `SUMMARY:${icsText(summary)}`,
    misto ? `LOCATION:${icsText(misto)}` : null,
    `DESCRIPTION:${icsText(popis)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="propojo-rezervace-${o.id.slice(0, 8)}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
