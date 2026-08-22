'use server'
// lib/actions/reservation-release.ts
// Výslovné opuštění právě drženého, ale NEZAPLACENÉHO termínu.
//
// DŮLEŽITÉ: samotný návrat ze Stripe přes ?platba=zruseno tuhle funkci už
// automaticky nespouští. Návrat z checkoutu může znamenat chybu Apple Pay,
// zavření okna nebo prostě potřebu zkusit platbu znovu.
//
// Tahle akce se použije až ve chvíli, kdy zákazník sám klikne „Vybrat jiný termín".
//  1) přímá rezervace availability_slotu -> objednávku zrušíme a slot vrátíme,
//  2) termín domluvený přes návrhy (bez slot_id) -> objednávku NErušíme; vrátíme
//     ji do stavu cekajici a stejný chat pokračuje dál.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { createNotification } from '@/lib/actions/notifications'
import { releaseSlotAndMerge } from '@/lib/slot-merge'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type ReleaseIntent = 'change_term' | 'checkout_failed'

type ReleaseResult =
  | { released: true; outcome: 'cancelled' | 'negotiation' }
  | { released: false; outcome?: undefined }

export async function releaseUnpaidReservation(
  orderId: string,
  intent?: ReleaseIntent
): Promise<ReleaseResult> {
  // Pojistka proti starým call-siteům: samotný návrat ze Stripe NIKDY nesmí
  // změnit termín ani poslat poskytovateli zprávu. Uvolnění proběhne jen po
  // výslovné akci zákazníka nebo při interním selhání vytvoření checkoutu.
  if (!intent) return { released: false }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { released: false }

  const admin = getAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, status, deposit_status, slot_id, scheduled_at, scheduled_end, stripe_checkout_session_id, service_items(name), services(title)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { released: false }
  if (order.customer_id !== user.id) return { released: false }
  if (order.status !== 'prijato') return { released: false }
  // Tohle je cesta pro NEZAPLACENÝ termín. U nových objednávek bývá stav
  // 'pending', ale starší nebo přerušený checkout může mít null/'none'.
  // Zaplacené / refundované peníze se touto akcí nikdy nesmí uvolňovat.
  if (order.deposit_status === 'paid' || order.deposit_status === 'released' || order.deposit_status === 'refunded') {
    return { released: false }
  }

  // Aktuální checkout ukončíme, protože zákazník právě řekl, že TENHLE termín
  // nechce. Tím se starý odkaz nedá později omylem zaplatit.
  if (order.stripe_checkout_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id)
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(order.stripe_checkout_session_id)
      }
    } catch (err) {
      console.warn('[releaseUnpaidReservation] session.expire:', err)
    }
  }

  const nazev = order.service_items?.name || order.services?.title || 'Rezervace'

  if (order.slot_id) {
    // Přímá rezervace: fyzický slot vrátíme. Tahle konkrétní objednávka končí;
    // zákazník se vrátí na kartu a vybere jiný dostupný čas.
    const uvolneno = await releaseSlotAndMerge(admin, order.slot_id, orderId)

    const { error } = await (admin.from('orders') as any)
      .update({
        status: 'zruseno',
        hold_expires_at: null,
        stripe_checkout_session_id: null,
      })
      .eq('id', orderId)
      .eq('status', 'prijato')

    if (error) {
      console.error('[releaseUnpaidReservation] zrušení přímé rezervace:', error)
      return { released: false }
    }

    if (uvolneno) {
      try {
        await createNotification({
          userId: order.provider_id,
          type: 'status_change',
          orderId,
          actorId: order.customer_id,
          title: 'Termín je zase volný',
          preview: `${nazev} · zákazník si vybere jiný termín.`,
        })
      } catch { /* notifikace není kritická */ }
    }

    revalidatePath('/dashboard/objednavky')
    revalidatePath('/dashboard/terminy')
    revalidatePath(`/dashboard/objednavky/${orderId}`)
    return { released: true, outcome: 'cancelled' }
  }

  // Domluvený termín bez fyzického slotu: objednávku zachováme, smažeme pouze
  // nepotvrzený termín a vrátíme ji do stejné fáze domlouvání.
  const { error } = await (admin.from('orders') as any)
    .update({
      status: 'cekajici',
      scheduled_at: null,
      scheduled_end: null,
      deposit_status: 'none',
      hold_expires_at: null,
      stripe_checkout_session_id: null,
    })
    .eq('id', orderId)
    .eq('status', 'prijato')

  if (error) {
    console.error('[releaseUnpaidReservation] návrat do domluvy:', error)
    return { released: false }
  }

  // Poskytovatele kontaktujeme jen tehdy, když zákazník OPRAVDU klikl na
  // „Vybrat jiný termín“. Technické selhání checkoutu není žádost o změnu.
  if (intent === 'change_term') {
    try {
      await (admin.from('messages') as any).insert({
        order_id: orderId,
        sender_id: order.customer_id,
        content: 'Zvolený termín mi nevyhovuje. Prosím o návrh jiného termínu.',
      })
      await createNotification({
        userId: order.provider_id,
        type: 'status_change',
        orderId,
        actorId: order.customer_id,
        title: 'Zákazník chce jiný termín',
        preview: `${nazev} · objednávka zůstává otevřená.`,
      })
    } catch { /* zpráva/notifikace nejsou kritické */ }
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { released: true, outcome: 'negotiation' }
}