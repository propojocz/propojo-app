'use server'
// lib/actions/reservation-release.ts
// Uvolnění termínu ve chvíli, kdy zákazník odejde z platební stránky.
//
// PROČ: rezervace zabere termín hned a drží ho, dokud platba nevyprší (30 min).
// Většina lidí ale platbu neopouští zavřením prohlížeče — kliknou na Stripe
// stránce na zpět a přistanou u nás na ?platba=zruseno. V tu chvíli víme
// jistě, že platit nebudou, a nemá smysl blokovat čas dalších třicet minut.
//
// Volá se z detailu objednávky (app/dashboard/objednavky/[id]/page.tsx).
// Je BEZPEČNÉ pustit opakovaně: každý krok má podmínku, takže druhé spuštění
// (obnovení stránky, návrat v historii) už nic nezmění.

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

export async function releaseUnpaidReservation(orderId: string): Promise<{ released: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { released: false }

  const admin = getAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, status, deposit_status, slot_id, stripe_checkout_session_id, service_items(name), services(title)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { released: false }

  // Uvolnit smí jen zákazník téhle objednávky — a jen když je pořád v tom
  // stavu, kdy se čeká na platbu za rezervovaný termín.
  if (order.customer_id !== user.id) return { released: false }
  if (!order.slot_id) return { released: false }            // poptávka bez termínu — netýká se
  if (order.status !== 'prijato') return { released: false } // už zrušeno nebo posunuto dál
  if (order.deposit_status !== 'pending') return { released: false } // zaplaceno

  // 1) Ukončit platbu na Stripe, ať zákazník nemůže zaplatit za termín, který
  //    jsme právě pustili dál. Když se to nepovede, nevadí — webhook má u platby
  //    kontrolu vlastnictví slotu a peníze by vrátil.
  if (order.stripe_checkout_session_id) {
    try {
      await stripe.checkout.sessions.expire(order.stripe_checkout_session_id)
    } catch (err) {
      console.warn('[releaseUnpaidReservation] session.expire:', err)
    }
  }

  // 2) Uvolnit termín a slepit ho se sousedy — ať se okno vrátí vcelku,
  //    ne jako úlomek po rezervaci.
  const uvolneno = await releaseSlotAndMerge(admin, order.slot_id, orderId)

  // 3) Zrušit objednávku
  await (admin.from('orders') as any)
    .update({ status: 'zruseno' })
    .eq('id', orderId)
    .eq('status', 'prijato')
    .eq('deposit_status', 'pending')

  const nazev = order.service_items?.name || order.services?.title || 'Rezervace'

  if (uvolneno) {
    try {
      await createNotification({
        userId: order.provider_id,
        type: 'status_change',
        orderId,
        actorId: order.customer_id,
        title: 'Termín je zase volný',
        preview: `${nazev} · zákazník platbu nedokončil.`,
      })
    } catch { /* notifikace není kritická */ }
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/dashboard/terminy')
  return { released: uvolneno }
}