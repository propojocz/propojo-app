'use server'
// lib/actions/deposit.ts
// Platba zálohy (Model A) / poplatku za výjezd (Model B) za objednávku.
// Peníze přitečou na Propojo a DRŽÍ se (separate charges and transfers).
// Převod poskytovateli / vratka = vrstva 4.
//
// Opakovaný pokus o platbu je podporovaný: návrat z Checkout přes „zpět" neznamená,
// že zákazník objednávku ruší. Nový checkout nahradí předchozí session a obnoví hold.

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const MIN_AMOUNT_CZK = 20
const CHECKOUT_MINUTES = 30
// O pár minut déle než checkout kvůli případnému zpoždění webhooku.
const HOLD_MINUTES = 35

type Result = { success: true; url: string } | { success: false; error: string }

export async function createDepositCheckout(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, customer_id, provider_id, status, deposit_status, deposit_amount, service_item_id,
      quantity, unit_price, needed_at,
      scheduled_at, hold_expires_at, stripe_checkout_session_id,
      services(title, payment_model, deposit_amount, quote_fee),
      service_items(name, payment_model, deposit_amount, quote_fee, deposit_type, price, item_type),
      profiles!orders_provider_id_fkey(stripe_account_id, stripe_payouts_enabled)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }

  if (order.customer_id !== user.id) {
    return { success: false, error: 'K této objednávce nemáte přístup.' }
  }

  if (order.status !== 'prijato') {
    return { success: false, error: 'Platbu lze dokončit až po potvrzení termínu.' }
  }

  if (order.deposit_status === 'paid' || order.deposit_status === 'released') {
    return { success: false, error: 'Záloha už byla zaplacena.' }
  }

  const providerAccount = order.profiles?.stripe_account_id
  const payoutsEnabled = order.profiles?.stripe_payouts_enabled === true
  if (!providerAccount || !payoutsEnabled) {
    return { success: false, error: 'Poskytovatel zatím nemá nastavené příjmy plateb. Zkuste to prosím později.' }
  }

  const svc = order.services
  const item = order.service_items ?? null
  const isModelB = (item?.payment_model ?? svc?.payment_model) === 'B'

  // Musí být před podmínkou termínu — výrobek termín nemá a nesmí být blokovaný.
  const jeVyrobek = item?.item_type === 'product'
  const pocetKusu = Math.max(1, Number(order.quantity ?? 1))

  // Výrobek se neplánuje v kalendáři — termín u něj neexistuje a nemá se čekat.
  if (!isModelB && !jeVyrobek && !order.scheduled_at) {
    return { success: false, error: 'Nejdřív musí být potvrzený termín.' }
  }

  const isFullPayment = !isModelB && item?.deposit_type === 'plna_platba'
  // U výrobku je částka za CELOU objednávku (n kusů). orderProduct ji ukládá
  // rovnou správně do deposit_amount; fallbacky níž ale nesou cenu ZA KUS,
  // takže se musí vynásobit — jinak by zákazník za 2 ks zaplatil cenu jednoho.
  const amount = isModelB
    ? Number(item?.quote_fee ?? svc?.quote_fee ?? 0)
    : isFullPayment
      ? Number(order.deposit_amount ?? (Number(item?.price ?? 0) * pocetKusu))
      : Number(order.deposit_amount ?? (Number(item?.deposit_amount ?? svc?.deposit_amount ?? 0) * (jeVyrobek ? pocetKusu : 1)))

  if (!amount || amount <= 0) {
    return { success: false, error: 'Pro tuto objednávku není nastavena žádná platba předem.' }
  }

  if (amount < MIN_AMOUNT_CZK) {
    return { success: false, error: `Minimální částka platby je ${MIN_AMOUNT_CZK} Kč.` }
  }

  // Když už existuje předchozí checkout, nejdřív zjistíme, jestli náhodou nebyl
  // zaplacený a jen ještě nedorazil webhook. Nechceme vytvořit druhou platbu.
  let previousSessionId: string | null = order.stripe_checkout_session_id ?? null
  if (previousSessionId) {
    try {
      const previous = await stripe.checkout.sessions.retrieve(previousSessionId)
      if (previous.payment_status === 'paid') {
        return {
          success: false,
          error: 'Platba už byla odeslána. Chvíli počkejte a obnovte stránku — potvrzení se právě zpracovává.',
        }
      }
    } catch (err) {
      // Starou session nemusíme umět načíst (už mohla být odstraněná/expirnutá).
      // Nový pokus tím neblokujeme.
      console.warn('[deposit] předchozí checkout nelze načíst:', err)
      previousSessionId = null
    }
  }

  const nazev = item?.name || svc?.title || 'služba'
  const nazevSPoctem = jeVyrobek && pocetKusu > 1 ? `${pocetKusu}× ${nazev}` : nazev
  const popis = isModelB
    ? `Poplatek za nacenění – ${nazev}`
    : isFullPayment
      ? `Platba předem – ${nazevSPoctem}`
      : `Záloha – ${nazevSPoctem}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'czk',
          product_data: { name: popis },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      payment_intent_data: {
        metadata: { order_id: orderId, kind: 'deposit' },
      },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
      success_url: `${APP_URL}/dashboard/objednavky/${orderId}?platba=uspech`,
      // Návrat sem znamená jen „checkout nebyl dokončen", ne zrušení objednávky.
      cancel_url: `${APP_URL}/dashboard/objednavky/${orderId}?platba=zruseno`,
      locale: 'cs',
      metadata: { order_id: orderId, kind: 'deposit' },
    })

    if (!session.url) return { success: false, error: 'Nepodařilo se vytvořit platbu.' }

    // Nejdřív označíme NOVOU session jako aktuální. Když pak expirujeme starou,
    // její webhook objednávku neukončí, protože kontroluje stripe_checkout_session_id.
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
    const { error: updateError } = await (supabase.from('orders') as any)
      .update({
        stripe_checkout_session_id: session.id,
        deposit_amount: amount,
        deposit_status: 'pending',
        hold_expires_at: holdExpiresAt,
      })
      .eq('id', orderId)
      .eq('customer_id', user.id)
      .eq('status', 'prijato')

    if (updateError) {
      try { await stripe.checkout.sessions.expire(session.id) } catch {}
      console.error('[deposit] nepodařilo se uložit novou session:', updateError)
      return { success: false, error: 'Platbu se nepodařilo připravit. Zkuste to znovu.' }
    }

    // Starý otevřený checkout zneplatníme, aby zákazník nemohl omylem zaplatit
    // dvě různé session za stejnou objednávku.
    if (previousSessionId && previousSessionId !== session.id) {
      try {
        const previous = await stripe.checkout.sessions.retrieve(previousSessionId)
        if (previous.status === 'open') await stripe.checkout.sessions.expire(previousSessionId)
      } catch (err) {
        console.warn('[deposit] starý checkout se nepodařilo ukončit:', err)
      }
    }

    return { success: true, url: session.url }
  } catch (err) {
    console.error('[deposit] Stripe error:', err)
    return { success: false, error: 'Platbu se nepodařilo spustit. Zkuste to znovu.' }
  }
}