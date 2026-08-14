'use server'
// lib/actions/deposit.ts
// Platba zálohy (Model A) / poplatku za výjezd (Model B) za objednávku.
// Peníze přitečou na Propojo a DRŽÍ se (separate charges and transfers).
// Převod poskytovateli / vratka = vrstva 4.
//
// ČÁSTKA se bere v tomto pořadí:
//   1) orders.deposit_amount — zamrzlá při objednání, platí i když poskytovatel
//      mezitím ceník změnil (zákazník platí to, co viděl),
//   2) service_items — úkon, který si zákazník objednal,
//   3) services — karta, jen jako záloha pro objednávky z doby před ceníkem.
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Stripe má minimální částku platby (pro CZK ~ekvivalent 0,50 €). Držíme bezpečné minimum.
const MIN_AMOUNT_CZK = 20

// Jak dlouho platí odkaz na platbu. Bez tohoto pole ho Stripe drží 24 hodin —
// zákazník by mohl zaplatit druhý den za termín, který mezitím dostal někdo
// jiný. 30 minut je nejkratší doba, kterou Stripe dovolí.
const CHECKOUT_MINUTES = 30

type Result = { success: true; url: string } | { success: false; error: string }

export async function createDepositCheckout(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, customer_id, provider_id, status, deposit_status, deposit_amount, service_item_id,
      services(title, payment_model, deposit_amount, quote_fee),
      service_items(name, payment_model, deposit_amount, quote_fee),
      profiles!orders_provider_id_fkey(stripe_account_id, stripe_payouts_enabled)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }

  if (order.customer_id !== user.id) {
    return { success: false, error: 'K této objednávce nemáte přístup.' }
  }

  if (order.status !== 'prijato') {
    return { success: false, error: 'Zálohu lze zaplatit až po přijetí objednávky poskytovatelem.' }
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

  // Model určuje ÚKON (má-li ho objednávka), jinak karta — starý tok.
  const isModelB = (item?.payment_model ?? svc?.payment_model) === 'B'

  // U modelu B se platí poplatek za nacenění, u modelu A rezervační záloha.
  // Zamrzlá částka na objednávce má u modelu A přednost před ceníkem.
  // U plné platby předem se účtuje CELÁ cena úkonu (deposit_amount je u ní null).
  const isFullPayment = !isModelB && (item as any)?.deposit_type === 'plna_platba'
  const amount = isModelB
    ? Number(item?.quote_fee ?? svc?.quote_fee ?? 0)
    : isFullPayment
      ? Number(order.deposit_amount ?? (item as any)?.price ?? 0)
      : Number(order.deposit_amount ?? item?.deposit_amount ?? svc?.deposit_amount ?? 0)

  if (!amount || amount <= 0) {
    return { success: false, error: 'Pro tuto objednávku není nastavena žádná platba předem.' }
  }

  // Stripe minimum – pod 20 Kč platbu nelze spustit
  if (amount < MIN_AMOUNT_CZK) {
    return { success: false, error: `Minimální částka platby je ${MIN_AMOUNT_CZK} Kč.` }
  }

  // V názvu platby chceme úkon, který si zákazník objednal — ne název celé karty.
  const nazev = item?.name || svc?.title || 'služba'
  const popis = isModelB
    ? `Poplatek za nacenění – ${nazev}`
    : isFullPayment
      ? `Platba předem – ${nazev}`
      : `Rezervační záloha – ${nazev}`

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
      // Po vypršení Stripe pošle událost checkout.session.expired — podle ní
      // se uvolní zamluvený termín.
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
      success_url: `${APP_URL}/dashboard/objednavky/${orderId}?platba=uspech`,
      cancel_url: `${APP_URL}/dashboard/objednavky/${orderId}?platba=zruseno`,
      locale: 'cs',
      metadata: { order_id: orderId, kind: 'deposit' },
    })

    if (!session.url) return { success: false, error: 'Nepodařilo se vytvořit platbu.' }

    await (supabase.from('orders') as any)
      .update({ stripe_checkout_session_id: session.id, deposit_amount: amount })
      .eq('id', orderId)

    return { success: true, url: session.url }
  } catch (err) {
    console.error('[deposit] Stripe error:', err)
    return { success: false, error: 'Platbu se nepodařilo spustit. Zkuste to znovu.' }
  }
} 