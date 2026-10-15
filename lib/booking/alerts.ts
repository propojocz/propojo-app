// lib/booking/alerts.ts
// Upozornění pro adminy Propoja (vrstva 4, 13. 10. 2026): podezřelé chování poskytovatele –
// např. Rezervační poplatek / Cena výjezdu na stropu 5 000 Kč („začíná být podezřelý“).
// Oznámení jde všem účtům s profiles.is_admin = true do zvonečku. Nikdy neblokuje hlavní akci.

import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/actions/notifications'
import { BOOKING_POLICY } from './policy'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function alertAdmins(args: { title: string; preview: string; url?: string | null; actorId?: string | null }): Promise<void> {
  try {
    const db = admin()
    const { data } = await db.from('profiles').select('id').eq('is_admin', true).limit(20)
    for (const a of (data ?? []) as Array<{ id: string }>) {
      await createNotification({
        userId: a.id,
        type: 'status_change',
        actorId: args.actorId ?? null,
        title: `⚠️ ${args.title}`,
        preview: args.preview,
        url: args.url ?? null,
      })
    }
  } catch (err) {
    console.error('[alertAdmins]', err)
  }
}

/** Částka (Kč) na hranici podezření → upozornit adminy. Kde: „ceník“, „nabídka na poptávku“, „návrh termínu“. */
export async function alertIfHighCharge(kc: number | null | undefined, ctx: { providerId: string; where: string; url?: string | null }): Promise<void> {
  if (kc == null || !Number.isFinite(kc)) return
  if (kc * 100 < BOOKING_POLICY.trust.alertChargeHalere) return
  const db = admin()
  const { data: p } = await db.from('profiles').select('full_name, company_name').eq('id', ctx.providerId).maybeSingle()
  const prof = p as { full_name: string | null; company_name: string | null } | null
  await alertAdmins({
    title: `Poplatek ${kc.toLocaleString('cs-CZ')} Kč (${ctx.where})`,
    preview: `${prof?.company_name || prof?.full_name || 'Poskytovatel'} nastavil částku na stropu – zkontrolujte, jestli je v pořádku.`,
    url: ctx.url ?? `/profil/${ctx.providerId}`,
    actorId: ctx.providerId,
  })
}

// ─── Zákazník opakovaně ruší zaplacené rezervace (15. 10. 2026) ─────────────
// Zrušení zákazníkem v hranicích §8 nese poskytovatel (provize + poplatek Stripe, AUTOREF-004).
// Ochrana proti zneužití: zatím jen upozornění adminovi – žádná automatická sankce (omezení spotřebitele
// = LEGAL_REVIEW_NEEDED, otázka pro právničku v podkladu VOP, sekce C). Odstoupení od smlouvy se nepočítá
// (zákonné právo).
export const CUSTOMER_CANCEL_ALERT = { windowDays: 30, threshold: 3 }

export async function alertIfCustomerCancelsOften(customerId: string): Promise<void> {
  try {
    const db = admin()
    const since = new Date(Date.now() - CUSTOMER_CANCEL_ALERT.windowDays * 24 * 3600_000).toISOString()
    const { data } = await db
      .from('orders')
      .select('id, cancelled_at')
      .eq('customer_id', customerId)
      .eq('cancel_reason', 'customer_cancelled')
      .not('confirmed_at', 'is', null)
      .gte('cancelled_at', since)
      .limit(50)
    const ids = ((data ?? []) as Array<{ id: string }>).map((o) => o.id)
    if (ids.length < CUSTOMER_CANCEL_ALERT.threshold) return
    // Odstoupení od smlouvy taky končí jako customer_cancelled – ty nepočítat
    const { data: w } = await db.from('withdrawals').select('order_id').in('order_id', ids)
    const withdrawn = new Set(((w ?? []) as Array<{ order_id: string }>).map((r) => r.order_id))
    const count = ids.filter((id) => !withdrawn.has(id)).length
    if (count < CUSTOMER_CANCEL_ALERT.threshold) return
    const { data: p } = await db.from('profiles').select('full_name').eq('id', customerId).maybeSingle()
    const name = (p as { full_name: string | null } | null)?.full_name || 'Zákazník'
    await alertAdmins({
      title: `Zákazník opakovaně ruší zaplacené rezervace (${count}× za ${CUSTOMER_CANCEL_ALERT.windowDays} dní)`,
      preview: `${name} – zrušení nesou poskytovatelé (provize + poplatek Stripe). Zkontrolujte, jestli nejde o zneužití.`,
      url: '/admin/uzivatele',
      actorId: customerId,
    })
  } catch (err) {
    console.error('[alertIfCustomerCancelsOften]', err)
  }
}
