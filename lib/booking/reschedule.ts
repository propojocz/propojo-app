// lib/booking/reschedule.ts
// Vrstva 4, část 3: „Původní termín nemohu dodržet“ (model §10, AUTOREF-002).
// Poskytovatel prohlásí, že potvrzený termín nesplní, a navrhne nový. Zákazník:
//   přijme → rezervace pokračuje v novém termínu;
//   odmítne nebo nereaguje do expirace (dřívější z 24 h od návrhu a začátku původního termínu)
//   → rezervace se zruší a celá částka se automaticky vrátí z účtu poskytovatele.
// Připomínka zákazníkovi v polovině lhůty, u krátkých lhůt hodinu před koncem (stanovisko AK).
// „Navrhnout alternativní termín“ bez prohlášení nic nemění – to zůstává domluvou ve zprávách.

import { createNotification } from '@/lib/actions/notifications'
import { sendEmail } from '@/lib/email/send'
import { bookingCancelledEmail, rescheduleProposedEmail } from '@/lib/email/templates'
import { datumCas, terminDlouze } from '@/lib/format'
import { claimMatchingAvailabilitySlot } from '@/lib/slot-claim'
import { applyTransition, closeSlot, loadBookingOrder, logOrderEvent, type BookingOrder, type Db } from './payments'
import { BOOKING_POLICY, policyFromSnapshot } from './policy'
import { runAutoRefund } from './refunds'
import { cannotKeepExpiry, earliestBookableStart, toDate } from './state'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
const HOUR = 3_600_000

export type OpenReschedule = {
  id: string
  proposedStart: string
  proposedEnd: string
  originalStart: string | null
  expiresAt: string
  createdAt: string
}

function nazev(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || (order.offer_kind === 'B' ? 'Výjezd a nacenění' : 'Rezervace')
}

function kc(halere: number | null | undefined): string | null {
  const h = Number(halere ?? 0)
  return h > 0 ? `${(h / 100).toLocaleString('cs-CZ')} Kč` : null
}

async function emailOf(db: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

async function notify(params: Parameters<typeof createNotification>[0]) {
  try {
    await createNotification(params)
  } catch (err) {
    console.error('[reschedule] notifikace:', err)
  }
}

export async function openRescheduleOf(db: Db, orderId: string): Promise<OpenReschedule | null> {
  const { data } = await db
    .from('order_reschedules')
    .select('id, proposed_start, proposed_end, original_start, expires_at, created_at')
    .eq('order_id', orderId)
    .eq('kind', 'cannot_keep_original')
    .eq('status', 'open')
    .maybeSingle()
  const r = data as { id: string; proposed_start: string; proposed_end: string; original_start: string | null; expires_at: string; created_at: string } | null
  return r ? { id: r.id, proposedStart: r.proposed_start, proposedEnd: r.proposed_end, originalStart: r.original_start, expiresAt: r.expires_at, createdAt: r.created_at } : null
}

/** Smí poskytovatel teď oznámit „nemohu dodržet“? (potvrzená rezervace, původní termín ještě nezačal) */
export function canDeclareCannotKeep(order: Pick<BookingOrder, 'booking_state' | 'scheduled_at'>, now = new Date()): boolean {
  if (order.booking_state !== 'confirmed') return false
  const start = toDate(order.scheduled_at)
  return !!start && now.getTime() < start.getTime()
}

/** Kdy zákazníkovi připomenout: v polovině lhůty, u lhůty kratší než 4 h hodinu před koncem */
export function rescheduleReminderAt(createdAt: Date, expiresAt: Date): Date | null {
  const window = expiresAt.getTime() - createdAt.getTime()
  const at = window >= 4 * HOUR ? createdAt.getTime() + window / 2 : expiresAt.getTime() - HOUR
  return at > createdAt.getTime() ? new Date(at) : null
}

export async function proposeCannotKeep(
  db: Db,
  order: BookingOrder,
  args: { start: Date; end: Date; note: string | null },
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canDeclareCannotKeep(order, now)) return { ok: false, error: 'U této rezervace už termín změnit nejde.' }
  if (!(args.end.getTime() > args.start.getTime())) return { ok: false, error: 'Konec nového termínu musí být po začátku.' }
  // Pravidla z doby rezervace; chybějící hodnoty ve starším snapshotu doplní aktuální
  const policy = { ...BOOKING_POLICY, ...policyFromSnapshot(order.policy_snapshot) }
  if (args.start.getTime() < earliestBookableStart(now, policy).getTime()) {
    return { ok: false, error: `Nový termín musí začínat nejdříve za ${policy.minLeadMinutes} minut.` }
  }
  if (order.scheduled_at && args.start.getTime() === new Date(order.scheduled_at).getTime()) {
    return { ok: false, error: 'Nový termín je stejný jako původní.' }
  }

  // Kolize s jinými rezervacemi poskytovatele (legacy zrcadlo: aktivní rezervace mají status „prijato“)
  const { data: clash } = await db
    .from('orders')
    .select('id')
    .eq('provider_id', order.provider_id)
    .eq('status', 'prijato')
    .neq('id', order.id)
    .lt('scheduled_at', args.end.toISOString())
    .gt('scheduled_end', args.start.toISOString())
    .limit(1)
  if ((clash ?? []).length > 0) return { ok: false, error: 'V tomto čase už máte jinou rezervaci. Vyberte jiný.' }

  const original = toDate(order.scheduled_at)
  const expiresAt = cannotKeepExpiry(now, original, policy)
  const note = (args.note ?? '').trim().slice(0, 500) || null
  const { data: row, error } = await db
    .from('order_reschedules')
    .insert({
      order_id: order.id,
      kind: 'cannot_keep_original',
      proposed_start: args.start.toISOString(),
      proposed_end: args.end.toISOString(),
      original_start: order.scheduled_at,
      original_end: order.scheduled_end,
      expires_at: expiresAt.toISOString(),
      status: 'open',
      created_by: order.provider_id,
    })
    .select('id')
    .single()
  if (error || !row) {
    // 23505 = už jeden otevřený návrh existuje
    if (error?.code === '23505') return { ok: false, error: 'Na odpověď zákazníka už čeká jiný návrh termínu.' }
    console.error('[reschedule] insert:', error?.message)
    return { ok: false, error: 'Návrh se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
  const id = (row as { id: string }).id
  await logOrderEvent(db, order.id, 'reschedule_proposed', { type: 'provider', id: order.provider_id }, {
    reschedule_id: id, kind: 'cannot_keep_original', proposed_start: args.start.toISOString(), expires_at: expiresAt.toISOString(),
  })
  if (note) {
    const { error: mErr } = await (db.from('messages') as any).insert({ order_id: order.id, sender_id: order.provider_id, content: note })
    if (mErr) console.error('[reschedule] zpráva:', mErr.message)
  }

  const proposedText = terminDlouze(args.start)
  const expiresText = datumCas(expiresAt)
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: 'Poskytovatel nemůže dodržet termín',
    preview: `${nazev(order)} · navrhuje ${proposedText}. Odpovězte do ${expiresText}, jinak se rezervace zruší a peníze se vám vrátí.`,
  })
  const email = await emailOf(db, order.customer_id)
  if (email) {
    const mail = rescheduleProposedEmail({
      serviceTitle: nazev(order),
      originalText: order.scheduled_at ? terminDlouze(order.scheduled_at) : null,
      proposedText,
      expiresText,
      amountText: kc(order.charge_halere),
      note,
      orderUrl: `${APP_URL}/dashboard/objednavky/${order.id}`,
    })
    await sendEmail(email, mail.subject, mail.html)
  }
  return { ok: true }
}

/** Zákazník přijme / odmítne, nebo návrh vyprší (cron) */
export async function resolveReschedule(
  db: Db,
  order: BookingOrder,
  resolution: 'accepted' | 'rejected' | 'expired',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const open = await openRescheduleOf(db, order.id)
  if (!open) return { ok: false, error: 'Návrh termínu už není aktivní. Obnovte stránku.' }
  // Rezervace mezitím skončila (zrušení, odstoupení) → návrh jen uzavřít, peníze už řeší jiný krok
  if (order.booking_state !== 'confirmed') {
    await db.from('order_reschedules').update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('id', open.id).eq('status', 'open')
    return { ok: false, error: 'Rezervace už neplatí. Obnovte stránku.' }
  }
  if (resolution !== 'expired' && new Date(open.expiresAt).getTime() <= Date.now()) {
    return { ok: false, error: 'Lhůta na odpověď už uplynula. Obnovte stránku.' }
  }

  // Zámek: návrh uzavře jen jedna strana (zákazník vs. cron)
  const nowIso = new Date().toISOString()
  const { data: closed } = await db
    .from('order_reschedules')
    .update({ status: resolution, resolved_at: nowIso })
    .eq('id', open.id)
    .eq('status', 'open')
    .select('id')
  if (!closed || closed.length === 0) return { ok: false, error: 'Návrh termínu už není aktivní. Obnovte stránku.' }
  const actor = resolution === 'expired' ? { type: 'system' as const } : { type: 'customer' as const, id: order.customer_id }
  await logOrderEvent(db, order.id, 'reschedule_resolved', actor, { reschedule_id: open.id, resolution })

  if (resolution === 'accepted') {
    // Nový čas mezitím mohl obsadit někdo jiný (z volného okna poskytovatele)
    const { data: clash } = await db
      .from('orders')
      .select('id')
      .eq('provider_id', order.provider_id)
      .eq('status', 'prijato')
      .neq('id', order.id)
      .lt('scheduled_at', open.proposedEnd)
      .gt('scheduled_end', open.proposedStart)
      .limit(1)
    if ((clash ?? []).length > 0) {
      await db.from('order_reschedules').update({ status: 'open', resolved_at: null }).eq('id', open.id)
      return { ok: false, error: 'Nový termín mezitím obsadil někdo jiný. Odmítněte ho prosím, peníze se vám vrátí.' }
    }
    const oldSlot = order.slot_id
    const r = await applyTransition(db, order, 'reschedule_accepted', actor, {
      extra: { scheduled_at: open.proposedStart, scheduled_end: open.proposedEnd, slot_id: null },
      payload: { reschedule_id: open.id },
    })
    if (!r.ok) return { ok: false, error: 'Rezervace se mezitím změnila. Obnovte stránku.' }
    // Původní čas poskytovatel dodržet nemůže → nenabízet ho ostatním; nový čas vyříznout z volného okna
    if (oldSlot) await closeSlot(db, oldSlot, order.id)
    if (order.service_id) {
      const claimed = await claimMatchingAvailabilitySlot(db, {
        orderId: order.id, providerId: order.provider_id, serviceId: order.service_id,
        startsAt: open.proposedStart, endsAt: open.proposedEnd,
      })
      if (claimed) await db.from('orders').update({ slot_id: claimed }).eq('id', order.id)
    }
    await notify({
      userId: order.provider_id,
      type: 'status_change',
      orderId: order.id,
      actorId: order.customer_id,
      title: 'Zákazník přijal nový termín',
      preview: `${nazev(order)} · ${terminDlouze(open.proposedStart)}.`,
    })
    return { ok: true }
  }

  const event = resolution === 'rejected' ? 'reschedule_rejected' : 'reschedule_expired'
  const r = await applyTransition(db, order, event, actor, { payload: { reschedule_id: open.id } })
  if (!r.ok) return { ok: false, error: 'Rezervace se mezitím změnila. Obnovte stránku.' }
  const refund = await runAutoRefund(db, order, event, resolution === 'rejected' ? 'customer' : 'system')
  const amount = refund.kind === 'skipped' ? null : kc(refund.amountHalere)
  const why = resolution === 'rejected' ? 'Zákazník nový termín odmítl' : 'Zákazník na nový termín včas nezareagoval'
  await notify({
    userId: order.provider_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.customer_id,
    title: 'Rezervace zrušena – nový termín nepřijat',
    preview: `${nazev(order)} · ${why}. ${amount ? `Zákazníkovi se z vašeho Stripe účtu vrací ${amount}.` : ''}`.trim(),
  })
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: 'Rezervace zrušena',
    preview: `${nazev(order)} · ${amount ? `vrácení ${amount} bylo zahájeno.` : 'stav vrácení peněz najdete v objednávce.'}`,
  })
  const email = await emailOf(db, order.customer_id)
  if (email) {
    const mail = bookingCancelledEmail({
      serviceTitle: nazev(order),
      termText: open.originalStart ? terminDlouze(open.originalStart) : null,
      byProvider: true,
      amountText: amount,
      reason: `Poskytovatel nemohl dodržet původní termín a nový ${resolution === 'rejected' ? 'jste odmítli' : 'jste včas nepřijali'}.`,
      orderUrl: `${APP_URL}/dashboard/objednavky/${order.id}`,
    })
    await sendEmail(email, mail.subject, mail.html)
  }
  return { ok: true }
}

/** Cron: vypršelé návrhy → zrušení + refund; připomínky zákazníkovi */
export async function tickReschedules(db: Db, now = new Date()): Promise<{ open: number; expired: number; reminded: number; error?: string }> {
  let expired = 0
  let reminded = 0
  let note: string | undefined
  const { data, error } = await db
    .from('order_reschedules')
    .select('id, order_id, expires_at, created_at, proposed_start')
    .eq('kind', 'cannot_keep_original')
    .eq('status', 'open')
    .limit(100)
  // Diagnostika v odpovědi cronu (22. 10. 2026: na produkci vypršelý návrh nezpracován) – kolik otevřených vidí
  if (error) return { open: -1, expired, reminded, error: error.message }
  for (const r of (data ?? []) as Array<{ id: string; order_id: string; expires_at: string; created_at: string; proposed_start: string }>) {
    const order = await loadBookingOrder(db, r.order_id)
    if (!order) { note = 'objednávka nenalezena'; continue }
    const expiresAt = new Date(r.expires_at)
    if (expiresAt.getTime() <= now.getTime()) {
      const res = await resolveReschedule(db, order, 'expired')
      if (res.ok) expired++
      else note = res.error
      continue
    }
    const remindAt = rescheduleReminderAt(new Date(r.created_at), expiresAt)
    if (!remindAt || now.getTime() < remindAt.getTime()) continue
    const { data: sent } = await db.from('order_events').select('id').eq('order_id', r.order_id).eq('type', 'reschedule_reminder_sent').eq('payload->>reschedule_id', r.id).limit(1)
    if ((sent ?? []).length > 0) continue
    await notify({
      userId: order.customer_id,
      type: 'status_change',
      orderId: order.id,
      actorId: order.provider_id,
      title: 'Připomínka: odpovězte na nový termín',
      preview: `${nazev(order)} · poskytovatel navrhuje ${terminDlouze(r.proposed_start)}. Do ${datumCas(expiresAt)} – jinak se rezervace zruší a peníze se vám vrátí.`,
    })
    await logOrderEvent(db, order.id, 'reschedule_reminder_sent', { type: 'system' }, { reschedule_id: r.id })
    reminded++
  }
  return { open: (data ?? []).length, expired, reminded, ...(note ? { error: note } : {}) }
}

