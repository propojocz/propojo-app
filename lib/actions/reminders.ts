'use server'
// lib/actions/reminders.ts
// VRSTVA 9 — připomínka termínu den předem.
//
// Jednou denně projde potvrzené rezervace, které se konají ZÍTRA, a pošle
// oběma stranám upozornění (zvoneček + push). Reservio to má jako hlavní
// zbraň proti no-show; my to umíme poslat jako push, ne SMS za kredit.
//
// Spouští cron (app/api/cron/reminders/route.ts). Bezpečné pustit opakovaně:
// odeslané připomínky se značí do orders.reminder_sent_at.

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague',
  }).format(new Date(iso))

/**
 * Rozešle připomínky na zítřejší termíny.
 * Vrací počet odeslaných a přeskočených.
 */
export async function sendTomorrowReminders(): Promise<{ sent: number; skipped: number }> {
  const admin = getAdminClient()

  // Okno „zítra" v pražském čase. Bereme širší rozsah a filtrujeme podle data,
  // ať se netrefíme vedle kvůli letnímu času.
  const now = new Date()
  // Okno je jen hrubý předfiltr pro databázi — o tom, co je „zítra", rozhoduje
  // až pražské datum níž. Dřív bylo úzké (12–48 h) a při spuštění v jinou hodinu
  // se dokázalo minout s ranními i pozdními termíny.
  const from = new Date(now.getTime() - 3600 * 1000)
  const to = new Date(now.getTime() + 72 * 3600 * 1000)
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now.getTime() + 24 * 3600 * 1000))

  const { data: rows } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, scheduled_at, location_city, reminder_sent_at, status, deposit_status, hold_expires_at, service_items(name), services(title, city)')
    .not('scheduled_at', 'is', null)
    .is('reminder_sent_at', null)
    .neq('status', 'zruseno')
    .neq('status', 'dokonceno')
    .gte('scheduled_at', from.toISOString())
    .lte('scheduled_at', to.toISOString()) as { data: any[] | null }

  let sent = 0
  let skipped = 0

  for (const o of rows ?? []) {
    // Rozdělaná platba s prošlým zámkem termín nedrží — připomínat ji nemá smysl.
    if (o.deposit_status === 'pending' && o.hold_expires_at
        && new Date(o.hold_expires_at).getTime() <= Date.now()) { skipped++; continue }

    // Opravdu zítra (v pražském datu)?
    const den = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(o.scheduled_at))
    if (den !== tomorrowStr) { skipped++; continue }

    const nazev = o.service_items?.name || o.services?.title || 'Objednaná služba'
    const cas = fmtTime(o.scheduled_at)
    const misto = o.location_city || o.services?.city || null

    try {
      // Zákazníkovi
      await createNotification({
        userId: o.customer_id,
        type: 'status_change',
        orderId: o.id,
        actorId: o.provider_id,
        title: `Zítra v ${cas} — ${nazev}`,
        preview: misto ? `Nezapomeňte, těšíme se. Místo: ${misto}` : 'Nezapomeňte, těšíme se.',
      })
      // Poskytovateli
      await createNotification({
        userId: o.provider_id,
        type: 'status_change',
        orderId: o.id,
        actorId: o.customer_id,
        title: `Zítra v ${cas} máte zakázku`,
        preview: nazev,
      })

      await (admin.from('orders') as any)
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', o.id)

      sent++
    } catch (err) {
      console.error('[sendTomorrowReminders] chyba u', o.id, err)
      skipped++
    }
  }

  return { sent, skipped }
}