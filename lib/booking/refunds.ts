// lib/booking/refunds.ts
// Vrstva 4: automatické vracení peněz z účtu poskytovatele (model §7, §11, §21 – katalog AUTOREF).
//
// Zásady:
// - Spouští se jen spouštěč z uzavřeného katalogu (rules.ts) a jen v rozsahu pokynu, který poskytovatel
//   odsouhlasil (booking_consents.scope). Rozhoduje decideAutoRefund – tady se jen provede.
// - Refund vzniká na Standard účtu poskytovatele (Direct Charge). Provize Propoja se nevrací
//   (refund_application_fee: false), poplatek Stripe nese poskytovatel.
// - Stav refundu se bere ze Stripe (odpověď API, pak webhook refund.*), nikdy z vlastního předpokladu.
// - Selže-li volání Stripe, řádek zůstane „requested“ a cron ho zkusí znovu; po 24 h se označí jako
//   selhaný a obě strany dostanou oznámení – povinnost vrátit peníze zůstává poskytovateli.

import { stripe } from '@/lib/stripe'
import { createNotification } from '@/lib/actions/notifications'
import { sendEmail } from '@/lib/email/send'
import { refundFailedEmail } from '@/lib/email/templates'
import { alertAdmins } from './alerts'
import { loadBookingOrder, logOrderEvent, type BookingOrder, type Db } from './payments'
import {
  decideAutoRefund,
  disputeBlocksRefund,
  fromStripeRefundStatus,
  isAutoRefundTrigger,
  isRefundInFlight,
  type AutoRefundTrigger,
  type RefundStatus,
} from './rules'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

/** Jak dlouho cron zkouší zadat refund, který Stripe nepřijal, než ho označí jako selhaný */
const RETRY_WINDOW_MS = 24 * 3600_000

type Initiator = 'customer' | 'provider' | 'system'

export type AutoRefundResult =
  | { kind: 'started'; amountHalere: number; status: RefundStatus }
  | { kind: 'queued'; amountHalere: number }
  | { kind: 'skipped'; reason: string }

export type OrderRefundRow = {
  id: string
  amount_halere: number
  status: RefundStatus
  refund_trigger: string
  created_at: string
  succeeded_at: string | null
}

/** Rozsah posledního pokynu poskytovatele (prázdný = žádný pokyn → automatika nic nespustí) */
async function instructionScope(db: Db, providerId: string): Promise<AutoRefundTrigger[]> {
  const { data } = await db
    .from('booking_consents')
    .select('scope')
    .eq('user_id', providerId)
    .eq('kind', 'provider_auto_refund_instruction')
    .order('accepted_at', { ascending: false })
    .limit(1)
  const scope = ((data ?? [])[0] as { scope: string[] | null } | undefined)?.scope ?? []
  return scope.filter(isAutoRefundTrigger)
}

async function refundsOf(db: Db, orderId: string): Promise<OrderRefundRow[]> {
  const { data } = await db
    .from('order_refunds')
    .select('id, amount_halere, status, refund_trigger, created_at, succeeded_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  return (data ?? []) as OrderRefundRow[]
}

/** Refundy objednávky pro zobrazení v detailu (obě strany) */
export async function orderRefunds(db: Db, orderId: string): Promise<OrderRefundRow[]> {
  return refundsOf(db, orderId)
}

function orderTitle(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || (order.offer_kind === 'B' ? 'Výjezd a nacenění' : 'Rezervace')
}

function kc(halere: number): string {
  return `${(halere / 100).toLocaleString('cs-CZ')} Kč`
}

type SubmitResult =
  | { kind: 'stripe'; status: RefundStatus; changed: boolean }
  | { kind: 'queued' }
  | { kind: 'rejected' }
  | { kind: 'already_refunded' }

// Chyby, u kterých nový pokus nepomůže (odpojený účet, spor, neplatný požadavek) – na rozdíl od výpadku sítě
const PERMANENT_STRIPE_ERRORS = ['StripeInvalidRequestError', 'StripePermissionError', 'StripeCardError']

/**
 * Zadá refund ve Stripe pro řádek order_refunds.
 * - stripe: Stripe refund přijal (stav z odpovědi; changed = náš zápis stav opravdu posunul);
 * - queued: dočasná chyba → zkusí znovu cron;
 * - rejected: Stripe refund odmítl natrvalo → řádek „failed“;
 * - already_refunded: platba už je vrácená (např. poskytovatel ručně) → řádek „canceled“, nic se nehlásí.
 */
async function submitToStripe(db: Db, order: BookingOrder, rowId: string, trigger: string, amountHalere: number): Promise<SubmitResult> {
  if (!order.stripe_account_id || !order.stripe_payment_intent_id) return { kind: 'rejected' }
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount: amountHalere,
        refund_application_fee: false,
        metadata: { order_refund_id: rowId, order_id: order.id, trigger },
      },
      { stripeAccount: order.stripe_account_id, idempotencyKey: `autoref-${order.id}-${trigger}-${rowId}` },
    )
    const status = fromStripeRefundStatus(refund.status)
    const now = new Date().toISOString()
    await db.from('order_refunds').update({ stripe_refund_id: refund.id }).eq('id', rowId).is('stripe_refund_id', null)
    // Webhook refund.* mohl stav zapsat dřív než tahle odpověď – konečný stav nepřepisovat zpět
    const { data: upd } = await db
      .from('order_refunds')
      .update({
        stripe_refund_id: refund.id,
        status,
        failure_reason: refund.failure_reason ?? null,
        updated_at: now,
        ...(status === 'succeeded' ? { succeeded_at: now } : {}),
      })
      .eq('id', rowId)
      .in('status', ['requested', 'pending', 'requires_action'])
      .neq('status', status)
      .select('id')
    return { kind: 'stripe', status, changed: (upd ?? []).length > 0 }
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string }
    const message = (e?.message ?? String(err)).slice(0, 500)
    console.error('[refunds] Stripe refund nezadán:', e?.type, e?.code, message)
    const now = new Date().toISOString()
    if (e?.code === 'charge_already_refunded') {
      await db.from('order_refunds').update({ status: 'canceled', failure_reason: message, updated_at: now }).eq('id', rowId).eq('status', 'requested')
      return { kind: 'already_refunded' }
    }
    if (e?.type && PERMANENT_STRIPE_ERRORS.includes(e.type)) {
      await db.from('order_refunds').update({ status: 'failed', failure_reason: message, updated_at: now }).eq('id', rowId).eq('status', 'requested')
      return { kind: 'rejected' }
    }
    await db.from('order_refunds').update({ failure_reason: message, updated_at: now }).eq('id', rowId)
    return { kind: 'queued' }
  }
}

/**
 * Skutečně stržená a už vrácená částka přímo ze Stripe (webhook o ručním refundu mohl ještě nedorazit;
 * při částečném stržení ve Stripe Dashboardu je stržená částka menší než zablokovaná).
 */
async function chargeOnStripe(order: BookingOrder): Promise<{ captured: number; refunded: number } | null> {
  if (!order.stripe_account_id || !order.stripe_charge_id) return null
  try {
    const charge = await stripe.charges.retrieve(order.stripe_charge_id, undefined, { stripeAccount: order.stripe_account_id })
    return { captured: charge.amount_captured ?? 0, refunded: charge.amount_refunded ?? 0 }
  } catch {
    return null
  }
}

/**
 * Automatický refund podle spouštěče z katalogu. Volá se až PO zapsání přechodu stavu
 * (zrušení je hotové, i kdyby Stripe zrovna nebyl dostupný – refund pak dožene cron).
 */
export async function runAutoRefund(
  db: Db,
  order: BookingOrder,
  trigger: AutoRefundTrigger,
  initiatedBy: Initiator,
): Promise<AutoRefundResult> {
  const actor = { type: initiatedBy, id: initiatedBy === 'customer' ? order.customer_id : initiatedBy === 'provider' ? order.provider_id : null }

  const { data: fresh } = await db
    .from('orders')
    .select('charge_halere, refunded_halere, stripe_dispute_status, confirmed_at')
    .eq('id', order.id)
    .maybeSingle()
  const f = fresh as { charge_halere: number | null; refunded_halere: number | null; stripe_dispute_status: string | null; confirmed_at: string | null } | null

  const rows = await refundsOf(db, order.id)
  const onStripe = await chargeOnStripe(order)
  const decision = decideAutoRefund(
    trigger,
    {
      captured: !!(f?.confirmed_at ?? order.confirmed_at),
      chargeHalere: onStripe?.captured || Number(f?.charge_halere ?? order.charge_halere ?? 0),
      refundedHalere: onStripe?.refunded ?? Number(f?.refunded_halere ?? 0),
      refundInFlight: rows.some((r) => isRefundInFlight(r.status)),
      disputeStatus: f?.stripe_dispute_status ?? null,
    },
    await instructionScope(db, order.provider_id),
  )

  if (decision.action !== 'refund') {
    const reason = decision.action === 'skip' ? decision.reason : 'not_captured'
    await logOrderEvent(db, order.id, 'refund_skipped', actor, { trigger, reason })
    if (reason === 'disputed' || reason === 'not_covered_by_instruction') await notifySkipped(order, reason)
    return { kind: 'skipped', reason }
  }

  const { data: row, error } = await db
    .from('order_refunds')
    .insert({
      order_id: order.id,
      stripe_account_id: order.stripe_account_id,
      amount_halere: decision.amountHalere,
      status: 'requested',
      refund_trigger: trigger,
      initiated_by: initiatedBy,
    })
    .select('id')
    .single()
  if (error || !row) {
    // 23505 = pro tento spouštěč už jeden refund běží (unikátní index) → nic nezdvojovat
    if (error?.code === '23505') return { kind: 'skipped', reason: 'in_flight' }
    console.error('[refunds] order_refunds:', error?.message)
    return { kind: 'skipped', reason: 'db_error' }
  }

  const rowId = (row as { id: string }).id
  await logOrderEvent(db, order.id, 'refund_triggered', actor, { trigger, amount_halere: decision.amountHalere, order_refund_id: rowId })

  const res = await submitToStripe(db, order, rowId, trigger, decision.amountHalere)
  return afterSubmit(db, order, res, decision.amountHalere)
}

/** Společné dořešení po zadání (první pokus i cron): oznámení jen při skutečné změně stavu */
async function afterSubmit(db: Db, order: BookingOrder, res: SubmitResult, amountHalere: number): Promise<AutoRefundResult> {
  if (res.kind === 'queued') return { kind: 'queued', amountHalere }
  if (res.kind === 'already_refunded') return { kind: 'skipped', reason: 'nothing_left' }
  if (res.kind === 'rejected') {
    await notifyRefundFailed(db, order.id, amountHalere)
    return { kind: 'started', amountHalere, status: 'failed' }
  }
  if (res.changed && (res.status === 'failed' || res.status === 'canceled')) await notifyRefundFailed(db, order.id, amountHalere)
  if (res.changed && res.status === 'succeeded') await notifyRefundSucceeded(order, amountHalere)
  return { kind: 'started', amountHalere, status: res.status }
}

/** Cron: refundy, které Stripe nepřijal (výpadek, síť), zkusit znovu; po 24 h označit jako selhané */
export async function retryQueuedRefunds(db: Db, now = new Date()): Promise<{ retried: number; failed: number }> {
  const { data } = await db
    .from('order_refunds')
    .select('id, order_id, amount_halere, refund_trigger, created_at')
    .eq('status', 'requested')
    .is('stripe_refund_id', null)
    .neq('refund_trigger', 'stripe_dashboard')
    .lt('created_at', new Date(now.getTime() - 2 * 60_000).toISOString())
    .limit(50)
  let retried = 0
  let failed = 0
  for (const r of (data ?? []) as Array<{ id: string; order_id: string; amount_halere: number; refund_trigger: string; created_at: string }>) {
    const order = await loadBookingOrder(db, r.order_id)
    if (!order) continue
    if (now.getTime() - new Date(r.created_at).getTime() > RETRY_WINDOW_MS) {
      await db.from('order_refunds').update({ status: 'failed', updated_at: now.toISOString() }).eq('id', r.id).eq('status', 'requested')
      await notifyRefundFailed(db, r.order_id, r.amount_halere)
      failed++
      continue
    }
    const res = await submitToStripe(db, order, r.id, r.refund_trigger, r.amount_halere)
    if (res.kind !== 'queued') retried++
    await afterSubmit(db, order, res, r.amount_halere)
  }
  return { retried, failed }
}

async function emailOf(db: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

/** Selhání refundu → oznámení oběma stranám (stanovisko AK: povinnost vrátit zůstává poskytovateli) */
export async function notifyRefundFailed(db: Db, orderId: string, amountHalere: number) {
  const order = await loadBookingOrder(db, orderId)
  if (!order) return
  const title = orderTitle(order)
  const orderUrl = `${APP_URL}/dashboard/objednavky/${orderId}`
  await alertAdmins({
    title: 'Automatické vrácení peněz selhalo',
    preview: `${title} · ${kc(amountHalere)}. Zákazník i poskytovatel dostali oznámení.`,
    url: `/dashboard/objednavky/${orderId}`,
    actorId: order.provider_id,
  })
  for (const forProvider of [false, true]) {
    const userId = forProvider ? order.provider_id : order.customer_id
    try {
      await createNotification({
        userId,
        type: 'status_change',
        orderId,
        title: 'Vrácení peněz se nezdařilo',
        preview: forProvider
          ? `${title} · ${kc(amountHalere)} se ze Stripe nepodařilo vrátit. Vraťte je prosím zákazníkovi co nejdřív.`
          : `${title} · ${kc(amountHalere)} se nepodařilo vrátit automaticky. Povinnost vrátit je dál na poskytovateli, dali jsme mu vědět.`,
      })
    } catch (err) {
      console.error('[refunds] notifikace:', err)
    }
    const email = await emailOf(db, userId)
    if (email) {
      const mail = refundFailedEmail({ serviceTitle: title, amountText: kc(amountHalere), forProvider, orderUrl })
      await sendEmail(email, mail.subject, mail.html)
    }
  }
}

/** Úspěšně vrácené peníze → krátké oznámení zákazníkovi */
export async function notifyRefundSucceeded(order: BookingOrder, amountHalere: number) {
  try {
    await createNotification({
      userId: order.customer_id,
      type: 'status_change',
      orderId: order.id,
      title: 'Peníze vám byly vráceny',
      preview: `${orderTitle(order)} · ${kc(amountHalere)}. Banka je může připsat až za několik pracovních dnů.`,
    })
  } catch (err) {
    console.error('[refunds] notifikace:', err)
  }
}

/** Automatika se zastavila (spor u banky / chybí pokyn) → obě strany vědí, že peníze se samy nevrátí */
async function notifySkipped(order: BookingOrder, reason: 'disputed' | 'not_covered_by_instruction') {
  const text = reason === 'disputed'
    ? 'K platbě běží reklamace u banky (chargeback), proto se peníze automaticky nevracejí. Vyřeší se v reklamaci.'
    : 'Peníze se automaticky nevracejí – vrácení je na poskytovateli.'
  for (const userId of [order.customer_id, order.provider_id]) {
    try {
      await createNotification({
        userId,
        type: 'status_change',
        orderId: order.id,
        title: 'Peníze se automaticky nevracejí',
        preview: `${orderTitle(order)} · ${text}`,
      })
    } catch (err) {
      console.error('[refunds] notifikace:', err)
    }
  }
}

// ─── Vrácení peněz poskytovatelem (tlačítko „Vrátit peníze zákazníkovi“) ─────────
// Není to automatický refund z katalogu: poskytovatel ho zadává sám, na vlastní pokyn (např. po odstoupení
// zákazníka, VOP 9.4). Propojo jen předá jeho pokyn Stripe na jeho účtu. Provize se nevrací.

/** Kolik ještě jde vrátit (haléře): stržená částka − už vráceno − právě probíhající vrácení */
export async function refundableHalere(db: Db, order: BookingOrder): Promise<number> {
  if (!order.confirmed_at) return 0
  const onStripe = await chargeOnStripe(order)
  const charged = onStripe?.captured || Number(order.charge_halere ?? 0)
  const refunded = onStripe?.refunded ?? Number(order.refunded_halere ?? 0)
  const inFlight = (await refundsOf(db, order.id))
    .filter((r) => isRefundInFlight(r.status))
    .reduce((s, r) => s + r.amount_halere, 0)
  return Math.max(0, charged - refunded - inFlight)
}

export async function runProviderRefund(
  db: Db,
  order: BookingOrder,
  amountHalere: number,
): Promise<{ ok: true; status: RefundStatus | 'queued' } | { ok: false; error: string }> {
  if (!Number.isInteger(amountHalere) || amountHalere <= 0) return { ok: false, error: 'Zadejte částku k vrácení.' }
  const { data: d } = await db.from('orders').select('stripe_dispute_status').eq('id', order.id).maybeSingle()
  if (disputeBlocksRefund((d as { stripe_dispute_status: string | null } | null)?.stripe_dispute_status ?? null)) {
    return { ok: false, error: 'K platbě běží reklamace u banky (chargeback), vrácení teď nejde.' }
  }
  const max = await refundableHalere(db, order)
  if (max <= 0) return { ok: false, error: 'Z této platby už není co vracet.' }
  if (amountHalere > max) return { ok: false, error: `Vrátit jde nejvýš ${kc(max)}.` }

  const { data: row, error } = await db
    .from('order_refunds')
    .insert({
      order_id: order.id,
      stripe_account_id: order.stripe_account_id,
      amount_halere: amountHalere,
      status: 'requested',
      refund_trigger: 'provider_manual',
      initiated_by: 'provider',
    })
    .select('id')
    .single()
  if (error || !row) {
    console.error('[refunds] ruční vrácení:', error?.message)
    return { ok: false, error: 'Vrácení se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
  const rowId = (row as { id: string }).id
  await logOrderEvent(db, order.id, 'refund_triggered', { type: 'provider', id: order.provider_id }, {
    trigger: 'provider_manual', amount_halere: amountHalere, order_refund_id: rowId,
  })
  const res = await submitToStripe(db, order, rowId, 'provider_manual', amountHalere)
  if (res.kind === 'queued') return { ok: true, status: 'queued' }
  if (res.kind === 'already_refunded') return { ok: false, error: 'Platba už je vrácená.' }
  if (res.kind === 'rejected') return { ok: false, error: 'Stripe vrácení odmítl. Zkontrolujte prosím zůstatek na svém Stripe účtu.' }
  if (res.changed && res.status === 'succeeded') await notifyRefundSucceeded(order, amountHalere)
  return { ok: true, status: res.status }
}

/** Co poskytovatele stojí zrušení: provize Propoja + poplatek Stripe za původní platbu (oba se nevracejí) */
export async function cancellationCostHalere(order: BookingOrder): Promise<{ commission: number; stripeFee: number | null } | null> {
  if (!order.confirmed_at) return null
  const commission = Number(order.application_fee_halere ?? 0)
  let stripeFee: number | null = null
  if (order.stripe_account_id && order.stripe_charge_id) {
    try {
      const charge = await stripe.charges.retrieve(order.stripe_charge_id, { expand: ['balance_transaction'] }, { stripeAccount: order.stripe_account_id })
      const bt = charge.balance_transaction as { fee_details?: Array<{ type: string; amount: number }> } | string | null
      if (bt && typeof bt === 'object' && bt.fee_details) {
        stripeFee = bt.fee_details.filter((f) => f.type === 'stripe_fee').reduce((s, f) => s + f.amount, 0)
      }
    } catch {
      stripeFee = null
    }
  }
  return { commission, stripeFee }
}
