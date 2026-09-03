'use server'
// lib/actions/payout.ts
// Vrstva 4a: uvolnění zálohy poskytovateli (transfer), vratka zákazníkovi (refund),
// a řešení sporu adminem (resolveDispute). Poskytovatel nese Stripe poplatek.
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { revalidatePath } from 'next/cache'
import { createNotification } from '@/lib/actions/notifications'
import { vyrobekStornoPodil } from '@/lib/product-storno'
import { AUTO_RELEASE_DAYS } from '@/lib/payout-config'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Result = { success: true } | { success: false; error: string }

// Čistá částka (po Stripe poplatku) v haléřích z payment intentu
async function getNetAmount(paymentIntentId: string): Promise<number | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    })
    const charge: any = (pi as any).latest_charge
    const bt: any = charge?.balance_transaction
    if (bt && typeof bt.net === 'number') return bt.net
    return null
  } catch (err) {
    console.error('[payout] getNetAmount error:', err)
    return null
  }
}

// Provede transfer čisté částky poskytovateli. Vrací true při úspěchu.
async function doTransfer(paymentIntentId: string | null, nominal: number, providerAccount: string): Promise<boolean> {
  try {
    let amount = Math.round(nominal * 100)
    if (paymentIntentId) {
      const net = await getNetAmount(paymentIntentId)
      if (net) amount = net
    }
    await stripe.transfers.create({
      amount,
      currency: 'czk',
      destination: providerAccount,
      metadata: { kind: 'deposit_release' },
    })
    return true
  } catch (err) {
    console.error('[payout] doTransfer error:', err)
    return false
  }
}

// Provede refund zákazníkovi. Vrací true při úspěchu.
async function doRefund(paymentIntentId: string): Promise<boolean> {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      metadata: { kind: 'deposit_refund' },
    })
    return true
  } catch (err) {
    console.error('[payout] doRefund error:', err)
    return false
  }
}

// Refund KONKRÉTNÍ částky (haléře) zákazníkovi – pro split.
async function doPartialRefund(paymentIntentId: string, amountHaler: number): Promise<boolean> {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountHaler,
      metadata: { kind: 'deposit_split_refund' },
    })
    return true
  } catch (err) {
    console.error('[payout] doPartialRefund error:', err)
    return false
  }
}

// Transfer KONKRÉTNÍ částky (haléře) poskytovateli – pro split.
async function doPartialTransfer(amountHaler: number, providerAccount: string): Promise<boolean> {
  try {
    await stripe.transfers.create({
      amount: amountHaler,
      currency: 'czk',
      destination: providerAccount,
      metadata: { kind: 'deposit_split_release' },
    })
    return true
  } catch (err) {
    console.error('[payout] doPartialTransfer error:', err)
    return false
  }
}

// ── UVOLNĚNÍ ZÁLOHY POSKYTOVATELI (zákazník potvrdí) ──────
export async function releaseDeposit(orderId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, customer_id, provider_id, status, deposit_status, deposit_amount, stripe_payment_intent_id,
      profiles!orders_provider_id_fkey(stripe_account_id, stripe_payouts_enabled)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Potvrdit může jen zákazník objednávky.' }
  }
  if (order.status !== 'ceka_potvrzeni') {
    return { success: false, error: 'Objednávka není připravená k potvrzení.' }
  }

  const admin = getAdminClient()
  // Částka mimo blok — potřebujeme ji i níž v notifikaci.
  const nominal = Number(order.deposit_amount ?? 0)

  if (order.deposit_status === 'paid') {
    const providerAccount = order.profiles?.stripe_account_id

    if (nominal > 0 && providerAccount) {
      const ok = await doTransfer(order.stripe_payment_intent_id, nominal, providerAccount)
      if (!ok) return { success: false, error: 'Uvolnění zálohy se nepodařilo. Zkuste to znovu.' }
      await (admin.from('orders') as any)
        .update({ deposit_status: 'released', status: 'dokonceno' })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any).update({ status: 'dokonceno' }).eq('id', orderId)
    }
  } else {
    await (admin.from('orders') as any).update({ status: 'dokonceno' }).eq('id', orderId)
  }

  try {
    let jmeno = 'Zákazník'
    const { data: cust } = await admin.from('profiles').select('full_name').eq('id', order.customer_id).single() as { data: { full_name: string | null } | null }
    if (cust?.full_name) jmeno = cust.full_name
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: order.deposit_status === 'paid' ? `${jmeno} potvrdil – peníze jsou na cestě` : `${jmeno} potvrdil dokončení`,
      // Do náhledu praktické info: kolik a kdy dorazí. Sama částka je na Connect
      // účtu hned, na bankovní účet ji Stripe posílá obvykle do 2 pracovních dnů.
      preview: order.deposit_status === 'paid' && nominal > 0
        ? `${nominal.toLocaleString('cs-CZ')} Kč · na účet obvykle do 2 pracovních dnů`
        : null,
    })
  } catch (err) {
    console.error('[releaseDeposit] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true }
}

// ── VRATKA ZÁKAZNÍKOVI (zrušení) ──────────────────────────
export async function refundDeposit(orderId: string, byUserId: string): Promise<Result> {
  const admin = getAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select(`
      id, customer_id, provider_id, deposit_status, deposit_amount, stripe_payment_intent_id,
      no_show_fee_amount, scheduled_at, needed_at,
      service_items(fee_mode, item_type, lead_time_days),
      profiles!orders_provider_id_fkey(stripe_account_id)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.deposit_status !== 'paid') return { success: true }
  if (!order.stripe_payment_intent_id) {
    console.error('[refundDeposit] chybí payment_intent_id pro', orderId)
    return { success: false, error: 'Chybí údaj o platbě.' }
  }

  const zaplaceno = Number(order.deposit_amount ?? 0)
  const providerAccount = order.profiles?.stripe_account_id

  // ── STORNO POPLATEK ───────────────────────────────────────────
  // Strhne se JEN když ruší ZÁKAZNÍK (ne poskytovatel — to je jeho rozhodnutí,
  // ať nese sám). Dvě různé logiky podle typu položky:
  //   • SLUŽBA: pevná částka, jen když ji poskytovatel nastavil (fee_mode='storno').
  //   • VÝROBEK NA OBJEDNÁVKU: procento podle odstupu od termínu dodání —
  //     viz vyrobekStornoPodil níž. Sklad/bez omezení storno neřeší (kdykoli
  //     plná vratka — fyzický kus se dá prodat jinam, nic se "nezačalo").
  const rusiZakaznik = byUserId === order.customer_id
  const maStorno = order.service_items?.fee_mode === 'storno'
  const jeVyrobekNaObjednavku = order.service_items?.item_type === 'product'
  const stornoPoplatek = !rusiZakaznik
    ? 0
    : maStorno
      ? Math.min(Number(order.no_show_fee_amount ?? 0), zaplaceno)
      : jeVyrobekNaObjednavku
        ? Math.round(zaplaceno * vyrobekStornoPodil(order.needed_at, order.service_items?.lead_time_days))
        : 0

  // Nic ke strhnutí → celá vratka, jak to bylo dřív.
  if (stornoPoplatek <= 0 || !providerAccount) {
    const ok = await doRefund(order.stripe_payment_intent_id)
    if (!ok) return { success: false, error: 'Vratku se nepodařilo provést.' }
    await (admin.from('orders') as any).update({ deposit_status: 'refunded' }).eq('id', orderId)

    try {
      await createNotification({
        userId: order.customer_id,
        type: 'status_change',
        orderId,
        actorId: byUserId,
        title: 'Záloha vám byla vrácena',
        preview: zaplaceno > 0 ? `${zaplaceno.toLocaleString('cs-CZ')} Kč · na kartě do několika pracovních dnů` : null,
      })
    } catch (err) {
      console.error('[refundDeposit] notifikace:', err)
    }
    return { success: true }
  }

  // ── STORNO: NESTRHÁVÁME HNED ──────────────────────────────────
  // Poskytovatel má 24 h, aby poplatek odpustil nebo snížil (domluvili se
  // jinak, je to stálý klient…). Když neudělá nic, vyřídí to cron.
  // Peníze zatím zůstávají držené — stejně jako u nedostavení.
  await (admin.from('orders') as any)
    .update({
      storno_marked_at: new Date().toISOString(),
      storno_fee_amount: stornoPoplatek,
    })
    .eq('id', orderId)

  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: byUserId,
      title: 'Zákazník zrušil objednávku',
      preview: `Storno poplatek ${stornoPoplatek.toLocaleString('cs-CZ')} Kč vám připíšeme do 24 hodin. Když jste se domluvili jinak, můžete ho odpustit.`,
    })
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId,
      actorId: byUserId,
      title: 'Objednávka zrušena',
      preview: `Storno poplatek je ${stornoPoplatek.toLocaleString('cs-CZ')} Kč. Zbytek vám vrátíme do 24 hodin — poskytovatel může poplatek ještě odpustit.`,
    })
  } catch (err) {
    console.error('[refundDeposit] notifikace:', err)
  }

  return { success: true }
}

// ── ODPUŠTĚNÍ / SNÍŽENÍ STORNA (poskytovatel) ─────────────────
// „Domluvili jsme se jinak" → poplatek 0 a zákazníkovi se vrátí všechno.
// Snížit jde, zvýšit ne — stejné pravidlo jako u nedostavení.
export async function waiveStornoFee(orderId: string, novaCastka = 0): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, provider_id, storno_marked_at, storno_fee_amount, deposit_status')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.provider_id !== user.id) return { success: false, error: 'Tohle může jen poskytovatel.' }
  if (!order.storno_marked_at) return { success: false, error: 'U téhle objednávky se storno neřeší.' }
  if (order.deposit_status !== 'paid') return { success: false, error: 'Storno už bylo vyřízeno.' }

  const puvodni = Number(order.storno_fee_amount ?? 0)
  const castka = Math.max(0, Math.min(Number(novaCastka) || 0, puvodni))  // jen snížit

  const { error } = await (admin.from('orders') as any)
    .update({ storno_fee_amount: castka })
    .eq('id', orderId)
  if (error) {
    console.error('[waiveStornoFee]', error)
    return { success: false, error: 'Nepodařilo se uložit.' }
  }

  // Vyřídíme rovnou, ať zákazník nečeká zbytečně dalších 24 hodin.
  const hotovo = await vyporadejStorno(orderId)
  if (!hotovo.success) return hotovo

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}

// ── VYPOŘÁDÁNÍ STORNA (společné pro ruční i automatické) ───────
async function vyporadejStorno(orderId: string): Promise<Result> {
  const admin = getAdminClient()
  const { data: o } = await admin
    .from('orders')
    .select('id, customer_id, provider_id, deposit_amount, storno_fee_amount, deposit_status, stripe_payment_intent_id, profiles!orders_provider_id_fkey(stripe_account_id)')
    .eq('id', orderId)
    .single() as { data: any }

  if (!o) return { success: false, error: 'Objednávka nenalezena.' }
  if (o.deposit_status !== 'paid') return { success: true }   // už vyřízeno

  const zaplaceno = Number(o.deposit_amount ?? 0)
  const poplatek = Math.min(Number(o.storno_fee_amount ?? 0), zaplaceno)
  const vratka = Math.max(0, zaplaceno - poplatek)
  const ucet = o.profiles?.stripe_account_id

  // Poplatek nula → prostě vrátíme všechno.
  if (poplatek <= 0 || !ucet) {
    if (o.stripe_payment_intent_id) {
      const ok = await doRefund(o.stripe_payment_intent_id)
      if (!ok) return { success: false, error: 'Vratku se nepodařilo provést.' }
    }
    await (admin.from('orders') as any).update({ deposit_status: 'refunded' }).eq('id', orderId)
    try {
      await createNotification({
        userId: o.customer_id, type: 'status_change', orderId, actorId: o.provider_id,
        title: 'Záloha vám byla vrácena v plné výši',
        preview: zaplaceno > 0
          ? `${zaplaceno.toLocaleString('cs-CZ')} Kč · poskytovatel storno poplatek odpustil`
          : null,
      })
    } catch { /* notifikace není kritická */ }
    return { success: true }
  }

  // Poplatek poskytovateli, zbytek zákazníkovi.
  const transferOk = await doTransfer(o.stripe_payment_intent_id, poplatek, ucet)
  if (!transferOk) return { success: false, error: 'Převod storno poplatku se nepodařil.' }

  if (vratka > 0 && o.stripe_payment_intent_id) {
    const refundOk = await doPartialRefund(o.stripe_payment_intent_id, Math.round(vratka * 100))
    if (!refundOk) {
      console.error('[vyporadejStorno] částečná vratka selhala u', orderId)
      return { success: false, error: 'Poplatek převeden, ale vratku zbytku se nepodařilo provést.' }
    }
  }

  await (admin.from('orders') as any)
    .update({ deposit_status: vratka > 0 ? 'refunded' : 'released' })
    .eq('id', orderId)

  try {
    await createNotification({
      userId: o.customer_id, type: 'status_change', orderId, actorId: o.provider_id,
      title: vratka > 0 ? 'Zbytek zálohy vám byl vrácen' : 'Záloha propadla jako storno',
      preview: vratka > 0
        ? `Vráceno ${vratka.toLocaleString('cs-CZ')} Kč, storno poplatek ${poplatek.toLocaleString('cs-CZ')} Kč si nechal poskytovatel.`
        : `Storno poplatek ${poplatek.toLocaleString('cs-CZ')} Kč si nechal poskytovatel.`,
    })
    await createNotification({
      userId: o.provider_id, type: 'status_change', orderId, actorId: o.provider_id,
      title: 'Storno poplatek je na cestě',
      preview: `${poplatek.toLocaleString('cs-CZ')} Kč · na účet obvykle do 2 pracovních dnů`,
    })
  } catch { /* notifikace není kritická */ }

  return { success: true }
}

// ── AUTOMATICKÉ VYŘÍZENÍ STORNA PO 24 H ───────────────────────
// Poskytovatel se neozval → poplatek platí tak, jak si ho nastavil.
const STORNO_HOURS = 24

export async function autoResolveStorno(): Promise<{ resolved: number; failed: number }> {
  const admin = getAdminClient()
  const cutoff = new Date(Date.now() - STORNO_HOURS * 3600 * 1000).toISOString()

  const { data: rows } = await admin
    .from('orders')
    .select('id')
    .not('storno_marked_at', 'is', null)
    .eq('deposit_status', 'paid')
    .lt('storno_marked_at', cutoff) as { data: { id: string }[] | null }

  let resolved = 0
  let failed = 0
  for (const r of rows ?? []) {
    const res = await vyporadejStorno(r.id)
    if (res.success) resolved++; else failed++
  }
  return { resolved, failed }
}

// ── NAHLÁŠENÍ SPORU (zákazník) ────────────────────────────
export async function reportDispute(
  orderId: string,
  reason: string,
  /** Kategorie problému a fotky jako důkaz. Nepovinné — starší volání
   *  (jen s textem) fungují dál beze změny. */
  extra?: { category?: string | null; photos?: string[] | null },
): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const trimmed = reason.trim()
  if (!trimmed) return { success: false, error: 'Napište prosím, v čem je problém.' }

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, provider_id, status')
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) {
    return { success: false, error: 'Problém může nahlásit jen zákazník objednávky.' }
  }
  if (order.status !== 'ceka_potvrzeni') {
    return { success: false, error: 'Problém lze nahlásit jen u zakázky čekající na potvrzení.' }
  }

  const admin = getAdminClient()
  const fotky = (extra?.photos ?? []).filter((u) => typeof u === 'string' && u.trim())
  await (admin.from('orders') as any)
    .update({
      status: 'spor',
      dispute_reason: trimmed,
      dispute_category: extra?.category?.trim() || null,
      dispute_photos: fotky.length > 0 ? fotky : null,
      dispute_created_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // Notifikace poskytovateli
  try {
    await createNotification({
      userId: order.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: 'Zákazník nahlásil problém – řeší Propojo',
      preview: (trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed)
        + (fotky.length > 0 ? ` · ${fotky.length} ${fotky.length === 1 ? 'fotka' : fotky.length < 5 ? 'fotky' : 'fotek'}` : ''),
    })
  } catch (err) {
    console.error('[reportDispute] notifikace:', err)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath('/dashboard/objednavky')
  return { success: true }
}

// ── ŘEŠENÍ SPORU ADMINEM ──────────────────────────────────
// decision: 'provider' = uvolnit poskytovateli, 'customer' = vrátit zákazníkovi
export async function resolveDispute(orderId: string, decision: 'provider' | 'customer' | 'split'): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  // Ověříme, že volá admin
  const { data: me } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean | null } | null }
  if (me?.is_admin !== true) {
    return { success: false, error: 'Tuto akci může provést jen administrátor.' }
  }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select(`
      id, customer_id, provider_id, status, deposit_status, deposit_amount, stripe_payment_intent_id,
      profiles!orders_provider_id_fkey(stripe_account_id)
    `)
    .eq('id', orderId)
    .single() as { data: any }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.status !== 'spor') {
    return { success: false, error: 'Tato objednávka není ve sporu.' }
  }

  if (decision === 'split') {
    // Rozdělit 50:50. Bezpečně: zákazníkovi vrátíme polovinu ZAPLACENÉ částky,
    // poskytovateli pošleme zbytek toho, co reálně přiteklo (po Stripe poplatku).
    // Tím se Propojo nikdy nedostane do mínusu; poplatek nese poskytovatel.
    if (order.deposit_status === 'paid' && order.stripe_payment_intent_id) {
      const providerAccount = order.profiles?.stripe_account_id
      const nominal = Number(order.deposit_amount ?? 0)
      const nominalHaler = Math.round(nominal * 100)
      const refundHaler = Math.round(nominalHaler / 2) // polovina zaplaceného zpět zákazníkovi

      // Kolik reálně přiteklo (po poplatku)
      const net = await getNetAmount(order.stripe_payment_intent_id) ?? nominalHaler
      const transferHaler = net - refundHaler // zbytek poskytovateli

      // 1) Refund poloviny zákazníkovi
      const refundOk = await doPartialRefund(order.stripe_payment_intent_id, refundHaler)
      if (!refundOk) return { success: false, error: 'Vratku poloviny se nepodařilo provést.' }

      // 2) Transfer zbytku poskytovateli (jen pokud má účet a zbývá co poslat)
      if (providerAccount && transferHaler > 0) {
        const transferOk = await doPartialTransfer(transferHaler, providerAccount)
        if (!transferOk) return { success: false, error: 'Převod poloviny poskytovateli se nepodařil. Vratka zákazníkovi už proběhla – řešte ručně.' }
      }

      await (admin.from('orders') as any)
        .update({ deposit_status: 'refunded', status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    }
    try {
      await createNotification({ userId: order.customer_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor uzavřen – záloha rozdělena napůl', preview: null })
      await createNotification({ userId: order.provider_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor uzavřen – záloha rozdělena napůl', preview: null })
    } catch {}
  } else if (decision === 'provider') {
    // Uvolnit poskytovateli
    if (order.deposit_status === 'paid') {
      const providerAccount = order.profiles?.stripe_account_id
      const nominal = Number(order.deposit_amount ?? 0)
      if (nominal > 0 && providerAccount) {
        const ok = await doTransfer(order.stripe_payment_intent_id, nominal, providerAccount)
        if (!ok) return { success: false, error: 'Uvolnění se nepodařilo.' }
        await (admin.from('orders') as any)
          .update({ deposit_status: 'released', status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
          .eq('id', orderId)
      } else {
        await (admin.from('orders') as any)
          .update({ status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
          .eq('id', orderId)
      }
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'dokonceno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    }
    try {
      await createNotification({ userId: order.provider_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor rozhodnut ve váš prospěch – záloha uvolněna', preview: null })
      await createNotification({ userId: order.customer_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor byl uzavřen', preview: null })
    } catch {}
  } else {
    // Vrátit zákazníkovi
    if (order.deposit_status === 'paid' && order.stripe_payment_intent_id) {
      const ok = await doRefund(order.stripe_payment_intent_id)
      if (!ok) return { success: false, error: 'Vratku se nepodařilo provést.' }
      await (admin.from('orders') as any)
        .update({ deposit_status: 'refunded', status: 'zruseno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    } else {
      await (admin.from('orders') as any)
        .update({ status: 'zruseno', dispute_resolved_at: new Date().toISOString() })
        .eq('id', orderId)
    }
    try {
      await createNotification({ userId: order.customer_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor rozhodnut ve váš prospěch – záloha vrácena', preview: null })
      await createNotification({ userId: order.provider_id, type: 'status_change', orderId, actorId: user.id, title: 'Spor byl uzavřen', preview: null })
    } catch {}
  }

  revalidatePath('/admin/spory')
  revalidatePath(`/admin/spory/${orderId}`)
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}

// ── ADMIN NAPÍŠE ZPRÁVU DO CHATU OBJEDNÁVKY ───────────────
// Pošle zprávu jménem přihlášeného admina do konverzace dané objednávky.
export async function adminMessageToOrder(orderId: string, content: string, imageUrl?: string | null): Promise<Result & { message?: any }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const { data: me } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean | null } | null }
  if (me?.is_admin !== true) {
    return { success: false, error: 'Tuto akci může provést jen administrátor.' }
  }

  const trimmed = content.trim()
  const img = imageUrl?.trim() || null
  if (!trimmed && !img) return { success: false, error: 'Zpráva je prázdná.' }

  const admin = getAdminClient()
  const { data: inserted, error } = await (admin.from('messages') as any).insert({
    order_id: orderId,
    sender_id: user.id,
    content: trimmed,
    image_url: img,
    is_admin: true,
  }).select('*').single()
  if (error) {
    console.error('[adminMessageToOrder]', error)
    return { success: false, error: 'Zprávu se nepodařilo odeslat.' }
  }

  // Notifikace oběma stranám
  try {
    const { data: order } = await admin
      .from('orders').select('customer_id, provider_id').eq('id', orderId).single() as { data: any }
    if (order) {
      for (const uid of [order.customer_id, order.provider_id]) {
        await createNotification({
          userId: uid,
          type: 'new_message',
          orderId,
          actorId: user.id,
          title: 'Zpráva od podpory Propojo',
          preview: trimmed ? (trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed) : '📷 Fotka',
        })
      }
    }
  } catch (err) {
    console.error('[adminMessageToOrder] notifikace:', err)
  }

  revalidatePath(`/admin/spory/${orderId}`)
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, message: inserted }
}
// ── AUTOMATICKÉ UVOLNĚNÍ PO 7 DNECH MLČENÍ ────────────────
// Když zákazník po dokončení nereaguje, poskytovatel nemá čekat věčně. Po 7 dnech
// od okamžiku, kdy poskytovatel označil zakázku za hotovou (ceka_potvrzeni),
// se záloha uvolní sama — stejně jako by ji zákazník potvrdil.
//
// Spouští se cronem (viz app/api/cron/release-deposits/route.ts). Bez cronu jde
// zavolat i ručně; funkce si sama najde a zpracuje všechny zralé objednávky.
//
// Bezpečné pustit opakovaně: bere jen status 'ceka_potvrzeni' + deposit 'paid',
// a po zpracování stav změní, takže se stejná objednávka podruhé nechytí.

export async function autoReleaseStaleDeposits(): Promise<{ released: number; failed: number }> {
  const admin = getAdminClient()
  const cutoff = new Date(Date.now() - AUTO_RELEASE_DAYS * 24 * 3600 * 1000).toISOString()

  // Objednávky čekající na potvrzení déle než 7 dnů. Rozhoduje okamžik, kdy
  // poskytovatel označil hotovo — ukládáme ho do completed_at (viz níže);
  // starší objednávky bez něj poznáme podle updated_at jako záloha.
  const { data: stale } = await admin
    .from('orders')
    .select('id, provider_id, customer_id, deposit_status, deposit_amount, stripe_payment_intent_id, completed_at, updated_at, profiles!orders_provider_id_fkey(stripe_account_id)')
    .eq('status', 'ceka_potvrzeni')
    .eq('deposit_status', 'paid')
    .lt('completed_at', cutoff) as { data: any[] | null }

  let released = 0
  let failed = 0

  for (const order of stale ?? []) {
    const providerAccount = order.profiles?.stripe_account_id
    const nominal = Number(order.deposit_amount ?? 0)

    try {
      if (nominal > 0 && providerAccount) {
        const ok = await doTransfer(order.stripe_payment_intent_id, nominal, providerAccount)
        if (!ok) { failed++; continue }
        await (admin.from('orders') as any)
          .update({ deposit_status: 'released', status: 'dokonceno' })
          .eq('id', order.id)
      } else {
        await (admin.from('orders') as any)
          .update({ status: 'dokonceno' })
          .eq('id', order.id)
      }
      released++

      try {
        await createNotification({
          userId: order.provider_id,
          type: 'status_change',
          orderId: order.id,
          actorId: order.provider_id,
          title: nominal > 0 ? 'Záloha vám byla automaticky uvolněna' : 'Zakázka byla automaticky uzavřena',
          preview: 'Zákazník do 7 dnů nepotvrdil, uzavřeno automaticky.',
        })
      } catch { /* notifikace není kritická */ }
    } catch (err) {
      console.error('[autoReleaseStaleDeposits] chyba u', order.id, err)
      failed++
    }
  }

  return { released, failed }
}

// ── AUTOMATICKÉ VYŘÍZENÍ NEDOSTAVENÍ ──────────────────────
// Poskytovatel označil „nedorazil", zákazník dostal upozornění a 24 hodin na
// námitku. Když se neozval, appka vyřídí sama — nikdo nic neposuzuje:
//   · storno poplatek (zmrazený na objednávce) jde poskytovateli,
//   · zbytek zaplacené částky se vrátí zákazníkovi.
// Ozval-li se (status 'spor'), tahle funkce se ho ani nedotkne.
const NO_SHOW_HOURS = 24

export async function autoResolveNoShows(): Promise<{ resolved: number; failed: number }> {
  const admin = getAdminClient()
  const cutoff = new Date(Date.now() - NO_SHOW_HOURS * 3600 * 1000).toISOString()

  const { data: rows } = await admin
    .from('orders')
    .select('id, provider_id, customer_id, deposit_amount, no_show_fee_amount, stripe_payment_intent_id, status, profiles!orders_provider_id_fkey(stripe_account_id)')
    .eq('attendance', 'nedorazil')
    .eq('deposit_status', 'paid')
    .neq('status', 'spor')
    .neq('status', 'zruseno')
    .lt('no_show_marked_at', cutoff) as { data: any[] | null }

  let resolved = 0
  let failed = 0

  for (const o of rows ?? []) {
    const zaplaceno = Number(o.deposit_amount ?? 0)
    const noShowFee = Math.min(Number(o.no_show_fee_amount ?? 0), zaplaceno)
    const vratka = Math.max(0, zaplaceno - noShowFee)
    const providerAccount = o.profiles?.stripe_account_id

    try {
      // 1) Storno poskytovateli
      if (noShowFee > 0 && providerAccount) {
        const ok = await doTransfer(o.stripe_payment_intent_id, noShowFee, providerAccount)
        if (!ok) { failed++; continue }
      }

      // 2) Zbytek zpět zákazníkovi
      if (vratka > 0 && o.stripe_payment_intent_id) {
        await stripe.refunds.create({
          payment_intent: o.stripe_payment_intent_id,
          amount: Math.round(vratka * 100),
        })
      }

      await (admin.from('orders') as any)
        .update({ status: 'dokonceno', deposit_status: noShowFee > 0 ? 'released' : 'refunded' })
        .eq('id', o.id)

      try {
        await createNotification({
          userId: o.provider_id,
          type: 'status_change',
          orderId: o.id,
          actorId: o.provider_id,
          title: noShowFee > 0 ? 'Poplatek za nedostavení vyřízen' : 'Nedostavení uzavřeno',
          preview: noShowFee > 0
            ? `${noShowFee.toLocaleString('cs-CZ')} Kč je na cestě na váš účet.`
            : 'U tohoto úkonu nemáte nastavený poplatek za nedostavení.',
        })
        await createNotification({
          userId: o.customer_id,
          type: 'status_change',
          orderId: o.id,
          actorId: o.provider_id,
          title: 'Nedostavení vyřízeno',
          preview: vratka > 0
            ? `Vráceno ${vratka.toLocaleString('cs-CZ')} Kč${noShowFee > 0 ? `, poplatek ${noShowFee.toLocaleString('cs-CZ')} Kč si nechal poskytovatel.` : '.'}`
            : `Poplatek ${noShowFee.toLocaleString('cs-CZ')} Kč za nedostavení si nechal poskytovatel.`,
        })
      } catch { /* notifikace není kritická */ }

      resolved++
    } catch (err) {
      console.error('[autoResolveNoShows] chyba u', o.id, err)
      failed++
    }
  }

  return { resolved, failed }
}

// ── UVOLNĚNÍ NEZAPLACENÝCH REZERVACÍ PO 24 H ──────────────
// Rezervace vypsaného termínu zabere slot okamžitě (reserveSlotForItem) a
// objednávka čeká na zaplacení zálohy. Když zákazník nezaplatí, termín tam
// visel donekonečna a poskytovatel o něj přišel. VOP slibují uvolnění do 24 h.
//
// Co se stane: objednávka → 'zruseno', slot zpět na 'volno' a rovnou viditelný
// (pending_confirm=false), oběma stranám oznámení.
//
// Bezpečnostní pojistky:
//   · bere JEN objednávky se slot_id (rezervace, ne poptávky),
//   · slot uvolní jen když na něm sedí order_id téhle objednávky — cizí ani
//     mezitím přeobsazený termín se nesáhne,
//   · žádné peníze se nepřesouvají (deposit_status je 'pending' = nezaplaceno);
//     kdyby platba dorazila později, webhook ji sám vrátí.
//
// Pozn.: když se okno při rezervaci dělilo, zůstanou po uvolnění dvě sousední
// volná okna místo jednoho. Slučování neděláme — poskytovatel je vidí obě
// a může s nimi naložit sám.
const UNPAID_HOURS = 24

export async function autoReleaseUnpaidReservations(): Promise<{ released: number; failed: number }> {
  const admin = getAdminClient()
  const cutoff = new Date(Date.now() - UNPAID_HOURS * 3600 * 1000).toISOString()

  const { data: rows } = await admin
    .from('orders')
    .select('id, provider_id, customer_id, slot_id, scheduled_at, deposit_amount, service_items(name), services(title)')
    .eq('status', 'prijato')
    .eq('deposit_status', 'pending')
    .not('slot_id', 'is', null)
    .lt('created_at', cutoff) as { data: any[] | null }

  let released = 0
  let failed = 0

  for (const o of rows ?? []) {
    try {
      // 1) Uvolnit termín — jen pokud na něm pořád sedí tahle objednávka
      const { data: freed } = await (admin.from('availability_slots') as any)
        .update({ status: 'volno', order_id: null, pending_confirm: false })
        .eq('id', o.slot_id)
        .eq('order_id', o.id)
        .select('id')

      // 2) Zrušit objednávku (i když slot mezitím převzal někdo jiný —
      //    nezaplacená objednávka nemá důvod dál žít)
      const { error: orderErr } = await (admin.from('orders') as any)
        .update({ status: 'zruseno' })
        .eq('id', o.id)
        .eq('status', 'prijato')
        .eq('deposit_status', 'pending')
      if (orderErr) { failed++; continue }

      released++

      const nazev = o.service_items?.name || o.services?.title || 'objednávka'
      const uvolneno = Array.isArray(freed) && freed.length > 0

      try {
        await createNotification({
          userId: o.customer_id,
          type: 'status_change',
          orderId: o.id,
          actorId: o.customer_id,
          title: 'Rezervace zrušena — záloha nebyla zaplacena',
          preview: `${nazev} · termín jsme uvolnili pro ostatní. Objednat se můžete znovu.`,
        })
        await createNotification({
          userId: o.provider_id,
          type: 'status_change',
          orderId: o.id,
          actorId: o.provider_id,
          title: uvolneno ? 'Nezaplacená rezervace — termín je zase volný' : 'Nezaplacená rezervace zrušena',
          preview: `${nazev} · zákazník do 24 hodin nezaplatil zálohu.`,
        })
      } catch { /* notifikace není kritická */ }
    } catch (err) {
      console.error('[autoReleaseUnpaidReservations] chyba u', o.id, err)
      failed++
    }
  }

  return { released, failed }
}