// app/api/stripe/webhook/route.ts
//
// Stripe webhook — Stripe sem POSÍLÁ události (platba proběhla, předplatné
// zrušeno, karta selhala…). Bez tohoto endpointu se po zaplacení NIC nestane:
// předplatné se neaktivuje, zálohy se nepotvrdí. Proto je nezbytný před spuštěním.
//
// BEZPEČNOST: každou událost ověřujeme podpisem (STRIPE_WEBHOOK_SECRET).
// Bez ověření by kdokoli mohl poslat falešné „předplatné aktivováno" bez placení.
//
// Zapisujeme přes SERVICE ROLE (webhook nemá přihlášeného uživatele) — a navíc
// service role obchází ochranný trigger na profiles.

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import {
  subscriptionStartedEmail,
  subscriptionCanceledEmail,
  paymentFailedEmail,
} from '@/lib/email/templates'
import { Resend } from 'resend'
import { createNotification } from '@/lib/actions/notifications'
import { releaseSlotAndMerge } from '@/lib/slot-merge'
import { claimMatchingAvailabilitySlot } from '@/lib/slot-claim'
import { datum } from '@/lib/format'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function sendMail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: 'Propojo <notifikace@propojo.cz>', to, subject, html })
  } catch (err) {
    console.error('[webhook] e-mail:', err)
  }
}

// Formát ceny do e-mailu podle období
function priceText(billing: string | null): string {
  return billing === 'yearly' ? '2 990 Kč/rok' : '299 Kč/měsíc'
}

// Najde e-mail a jméno poskytovatele podle user_id
async function getProvider(db: ReturnType<typeof admin>, userId: string) {
  const { data } = await db.from('profiles').select('full_name').eq('id', userId).single() as { data: any }
  const { data: authUser } = await db.auth.admin.getUserById(userId)
  return {
    name: (data?.full_name as string) ?? 'Poskytovatel',
    email: authUser?.user?.email ?? null,
  }
}

// Z Stripe subscription objektu složí řádek pro naši tabulku
// Období předplatného. V novějších verzích Stripe API (dahlia) jsou tato pole
// na položce předplatného (items.data[0]), ne přímo na subscription. Bereme je
// odtud, s fallbackem, ať to funguje napříč verzemi.
function periodBounds(sub: Stripe.Subscription): { start: number | null; end: number | null } {
  const item = sub.items?.data?.[0] as any
  const anySub = sub as any
  const start = item?.current_period_start ?? anySub.current_period_start ?? null
  const end = item?.current_period_end ?? anySub.current_period_end ?? null
  return { start, end }
}

function subRow(sub: Stripe.Subscription, userId: string, billing: string | null) {
  const { start, end } = periodBounds(sub)
  return {
    user_id: userId,
    status: sub.status, // 'trialing' | 'active' | 'past_due' | 'canceled' …
    billing_period: billing,
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  }
}

// Období odvodíme z ceny (interval), ať to nemusíme tahat z metadat
function billingFromSub(sub: Stripe.Subscription): string {
  const interval = sub.items.data[0]?.price?.recurring?.interval
  return interval === 'year' ? 'yearly' : 'monthly'
}

// Uloží/aktualizuje předplatné. Když řádek pro subscription existuje, přepíše ho;
// jinak založí nový. (upsert podle stripe_subscription_id)
async function upsertSubscription(db: ReturnType<typeof admin>, sub: Stripe.Subscription, userId: string) {
  const billing = billingFromSub(sub)
  const row = subRow(sub, userId, billing)

  // Existuje už řádek pro tohle subscription?
  const { data: existing } = await db
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle() as { data: { id: string } | null }

  if (existing) {
    await (db.from('subscriptions') as any).update(row).eq('id', existing.id)
  } else {
    await (db.from('subscriptions') as any).insert(row)
  }
  return billing
}

// ── ZÁLOHA ZAPLACENA ──────────────────────────────────────────
// Checkout v režimu 'payment' s metadatem kind='deposit' = zákazník zaplatil
// rezervační zálohu (model A) nebo poplatek za nacenění (model B).
// Bez tohoto kroku by peníze dorazily, ale objednávka by zůstala v 'pending'
// a poskytovatel by nemohl zahájit práci.
//
// POJISTKA: než platbu potvrdíme, ověříme, že objednávka pořád platí a že
// termín na ní stále visí. Nezaplacené rezervace se po 24 h ruší a termín se
// uvolní (autoReleaseUnpaidReservations) — kdyby zákazník zaplatil ze starého
// odkazu potom, dostali bychom dva lidi na jeden čas. V takovém případě peníze
// rovnou vracíme.
async function handleDepositPaid(
  db: ReturnType<typeof admin>,
  session: Stripe.Checkout.Session
) {
  const orderId = session.metadata?.order_id
  if (!orderId) {
    console.error('[webhook] deposit bez order_id v metadatech')
    return
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

  const { data: order } = await db
    .from('orders')
    .select('id, status, slot_id, service_id, scheduled_at, scheduled_end, provider_id, customer_id, deposit_status, deposit_amount, hold_expires_at, stripe_checkout_session_id, service_items(name, duration_minutes), services(title)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) {
    console.error('[webhook] platba k neexistující objednávce', orderId)
    return
  }

  const nazev = order.service_items?.name || order.services?.title || null

  // Platná je jen poslední aktivní checkout session u objednávky, která pořád čeká
  // na tuhle platbu. U domluveného termínu (bez slot_id) navíc musí pořád existovat
  // scheduled_at. Fyzický slot se kontroluje jen u přímé rezervace.
  let platna = order.status === 'prijato' && order.deposit_status === 'pending'

  if (platna && order.stripe_checkout_session_id && order.stripe_checkout_session_id !== session.id) {
    platna = false
  }

  if (platna && order.slot_id) {
    const { data: slot } = await db
      .from('availability_slots')
      .select('id, status, order_id')
      .eq('id', order.slot_id)
      .maybeSingle() as { data: { id: string; status: string; order_id: string | null } | null }

    if (!slot || slot.order_id !== orderId || slot.status !== 'zabrano') {
      platna = false
    }
  } else if (platna && !order.slot_id && !order.scheduled_at) {
    // Domluvený termín už byl mezitím zrušen / vrácen do domlouvání.
    platna = false
  }

  if (!platna) {
    console.warn('[webhook] platba za neplatnou/propadlou rezervaci', orderId, '— vracím peníze')

    let vraceno = false
    if (paymentIntentId) {
      try {
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          metadata: { kind: 'deposit_late_refund', order_id: orderId },
        })
        vraceno = true
      } catch (err) {
        console.error('[webhook] vratka propadlé rezervace selhala:', err)
      }
    }

    if (vraceno) {
      await (db.from('orders') as any)
        .update({ deposit_status: 'refunded', stripe_payment_intent_id: paymentIntentId, hold_expires_at: null })
        .eq('id', orderId)
    }

    try {
      await createNotification({
        userId: order.customer_id,
        type: 'status_change',
        orderId,
        actorId: order.customer_id,
        title: vraceno ? 'Rezervace už nebyla platná — peníze vracíme' : 'Rezervace už nebyla platná',
        preview: vraceno
          ? `${nazev ?? 'Rezervace'} · platba se vrací na kartu, domluvte prosím nový termín.`
          : `${nazev ?? 'Rezervace'} · ozvěte se nám na admin@propojo.cz, vyřešíme to.`,
      })
    } catch (err) {
      console.error('[webhook] notifikace o vratce:', err)
    }
    return
  }

  // U termínu domluveného přes návrhy nemusí být slot_id. Po úspěšné platbě
  // zkusíme potvrzený interval vyříznout z odpovídajícího volného okna, aby se
  // už v přímém rezervačním modalu nezobrazoval jako volný.
  let claimedSlotId: string | null = null
  if (!order.slot_id && order.scheduled_at && order.service_id) {
    const fallbackDur = Number(order.service_items?.duration_minutes ?? 60) || 60
    const scheduledEnd = order.scheduled_end
      ?? new Date(new Date(order.scheduled_at).getTime() + fallbackDur * 60_000).toISOString()
    claimedSlotId = await claimMatchingAvailabilitySlot(db, {
      orderId,
      providerId: order.provider_id,
      serviceId: order.service_id,
      startsAt: order.scheduled_at,
      endsAt: scheduledEnd,
    })
  }

  const { error } = await (db.from('orders') as any)
    .update({
      deposit_status: 'paid',
      hold_expires_at: null,
      ...(claimedSlotId ? { slot_id: claimedSlotId } : {}),
    })
    .eq('id', orderId)
    .eq('deposit_status', 'pending')

  if (error) {
    console.error('[webhook] zápis deposit_status:', error)
    if (claimedSlotId) await releaseSlotAndMerge(db, claimedSlotId, orderId)
    return
  }

  if (paymentIntentId) {
    const { error: piErr } = await (db.from('orders') as any)
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq('id', orderId)
    if (piErr) console.warn('[webhook] payment_intent neuložen:', piErr.message)
  }

  if (!order.provider_id) return

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: order.customer_id ?? null,
      title: 'Záloha zaplacena — termín je potvrzený',
      preview: nazev,
    })
  } catch (err) {
    console.error('[webhook] notifikace o záloze:', err)
  }
}

// ── PLATBA VYPRŠELA ───────────────────────────────────────────
// Odkaz na platbu platí 30 minut (deposit.ts). Když zákazník nezaplatí,
// Stripe pošle tuhle událost — rezervaci zrušíme a termín vrátíme mezi volné.
// Tím platí pravidlo „co je v kalendáři, to je zaplacené".
//
// Pojistky:
//   · jen objednávky, které pořád čekají na platbu (deposit_status 'pending'),
//   · jen když tahle session je ta poslední — když si zákazník mezitím otevřel
//     platbu znovu, starší vypršelá session nesmí novou rezervaci zabít,
//   · termín uvolníme jen tehdy, sedí-li na něm order_id téhle objednávky.
async function handleDepositExpired(
  db: ReturnType<typeof admin>,
  session: Stripe.Checkout.Session
) {
  const orderId = session.metadata?.order_id
  if (!orderId) return

  const { data: order } = await db
    .from('orders')
    .select('id, status, deposit_status, slot_id, scheduled_at, customer_id, provider_id, stripe_checkout_session_id, service_items(name), services(title)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return
  if (order.deposit_status !== 'pending') return
  if (order.status !== 'prijato') return
  if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== session.id) return

  const nazev = order.service_items?.name || order.services?.title || 'Rezervace'

  if (order.slot_id) {
    // Přímá rezervace: objednávka bez platby končí a fyzický slot se vrací.
    const uvolneno = await releaseSlotAndMerge(db, order.slot_id, orderId)

    await (db.from('orders') as any)
      .update({ status: 'zruseno', hold_expires_at: null, stripe_checkout_session_id: null })
      .eq('id', orderId)
      .eq('deposit_status', 'pending')

    try {
      await createNotification({
        userId: order.customer_id,
        type: 'status_change',
        orderId,
        actorId: order.customer_id,
        title: 'Rezervace vypršela — nebyla zaplacena',
        preview: `${nazev} · termín jsme uvolnili. Objednat se můžete znovu.`,
      })
      if (uvolneno) {
        await createNotification({
          userId: order.provider_id,
          type: 'status_change',
          orderId,
          actorId: order.provider_id,
          title: 'Termín je zase volný',
          preview: `${nazev} · zákazník zálohu nezaplatil.`,
        })
      }
    } catch (err) {
      console.error('[webhook] notifikace o vypršení:', err)
    }
    return
  }

  // Domluvený termín: vypršení platby neruší celou zakázku. Jen vrátí objednávku
  // do fáze domluvy. Stejný chat a objednávka zůstávají zachované.
  await (db.from('orders') as any)
    .update({
      status: 'cekajici',
      scheduled_at: null,
      scheduled_end: null,
      deposit_status: 'none',
      hold_expires_at: null,
      stripe_checkout_session_id: null,
    })
    .eq('id', orderId)
    .eq('deposit_status', 'pending')

  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: order.customer_id,
      title: 'Platba vypršela — objednávka zůstává otevřená',
      preview: `${nazev} · termín není potvrzený, můžete se domluvit na jiném.`,
    })
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: order.customer_id,
      title: 'Zákazník termín nezaplatil',
      preview: `${nazev} · objednávka zůstává otevřená pro další domluvu.`,
    })
  } catch (err) {
    console.error('[webhook] notifikace o vypršení domluveného termínu:', err)
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = headers().get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  // Stripe při ukládání endpointu (a u „Send test") pošle ping BEZ podpisu.
  // Takový request nemáme jak ověřit — ale musíme vrátit 2xx, jinak Stripe
  // odmítne endpoint uložit („Received status code 403"). Skutečné události
  // vždy podpis mají, takže tímhle nic nepropustíme.
  if (!sig) {
    return NextResponse.json({ received: true, note: 'ping without signature' })
  }

  if (!secret) {
    console.error('[webhook] Chybí STRIPE_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'Konfigurace webhooku chybí' }, { status: 400 })
  }

  // 1) OVĚŘENÍ PODPISU — bez tohoto by šlo podvrhnout jakoukoli událost
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    console.error('[webhook] Neplatný podpis:', err)
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 400 })
  }

  const db = admin()

  try {
    switch (event.type) {
      // ── Checkout dokončen ─────────────────────────────────────────
      // Dva různé případy: předplatné (mode 'subscription') a záloha za
      // objednávku (mode 'payment' + metadata kind='deposit').
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'payment') {
          if (session.metadata?.kind === 'deposit') {
            await handleDepositPaid(db, session)
          }
          break
        }

        if (session.mode !== 'subscription') break

        const userId = session.metadata?.supabase_user_id
        if (!userId || !session.subscription) break

        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const billing = await upsertSubscription(db, sub, userId)

        // Uvítací e-mail k předplatnému
        const p = await getProvider(db, userId)
        if (p.email) {
          const isTrial = sub.status === 'trialing'
          const { subject, html } = subscriptionStartedEmail({
            providerName: p.name,
            isTrial,
            trialEndsAt: sub.trial_end
              ? datum(new Date(sub.trial_end * 1000))
              : undefined,
            priceText: priceText(billing),
            dashboardUrl: `${APP_URL}/dashboard/predplatne`,
          })
          await sendMail(p.email, subject, html)
        }
        break
      }

      // ── Platba vypršela (30 min) ──────────────────────────────────
      // Týká se jen záloh; u předplatného se nic neděje.
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.kind === 'deposit') {
          await handleDepositExpired(db, session)
        }
        break
      }

      // ── Změna předplatného (obnovení, konec trialu, změna karty…) ──
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.supabase_user_id
        if (userId) await upsertSubscription(db, sub, userId)
        break
      }

      // ── Zrušení předplatného ──────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.supabase_user_id
        if (!userId) break

        // Status na 'canceled' → nabídky zmizí z marketplace (filtr bere jen active/trialing)
        await (db.from('subscriptions') as any)
          .update({ status: 'canceled', cancel_at_period_end: true, updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id)

        const p = await getProvider(db, userId)
        if (p.email) {
          const { subject, html } = subscriptionCanceledEmail({
            providerName: p.name,
            activeUntil: (() => {
              const { end } = periodBounds(sub)
              return end ? datum(new Date(end * 1000)) : '—'
            })(),
            subscriptionUrl: `${APP_URL}/dashboard/predplatne`,
          })
          await sendMail(p.email, subject, html)
        }
        break
      }

      // ── Platba předplatného selhala ───────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break

        // Najdeme uživatele podle customer ID
        const { data: sub } = await db
          .from('subscriptions')
          .select('user_id, billing_period')
          .eq('stripe_customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle() as { data: { user_id: string; billing_period: string | null } | null }

        if (!sub) break
        const p = await getProvider(db, sub.user_id)
        if (p.email) {
          const { subject, html } = paymentFailedEmail({
            providerName: p.name,
            priceText: priceText(sub.billing_period),
            retryDate: invoice.next_payment_attempt
              ? datum(new Date(invoice.next_payment_attempt * 1000))
              : undefined,
            subscriptionUrl: `${APP_URL}/dashboard/predplatne`,
          })
          await sendMail(p.email, subject, html)
        }
        break
      }

      // ── Connect účet dokončen (napojení banky) ────────────────────
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const userId = account.metadata?.supabase_user_id
        if (!userId) break

        await (db.from('profiles') as any)
          .update({
            stripe_onboarding_done: account.details_submitted === true,
            stripe_payouts_enabled: account.payouts_enabled === true,
          })
          .eq('id', userId)
        break
      }

      default:
        // Ostatní události ignorujeme (Stripe jich posílá spoustu)
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhook] Chyba při zpracování:', event.type, err)
    // 200 i při chybě zpracování — ať Stripe událost nezkouší donekonečna.
    // (Chybu si zalogujeme a vyřešíme sami.)
    return NextResponse.json({ received: true, warning: 'processing error' })
  }
}