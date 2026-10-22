// lib/booking/on-site.ts
// Vrstva 6 (22. 10. 2026): výjezd na místě (Model B, model §5, §9; podklad A8).
//
// „Zákazník nezastižen“: jen po PLATNÉM check-inu, po aspoň jednom pokusu o kontakt přes Propojo
// („Nemůžu vás zastihnout“ = zpráva do chatu + oznámení zákazníkovi) a po jednotné čekací době 15 min
// od příjezdu. Je to jen záznam a oznámení – peníze se automaticky nehýbou (Cena výjezdu je stržená
// a nevrací se sama; spotřebitel v 14denní lhůtě může dlužit jen poměrnou část – řeší přímo s poskytovatelem).
//
// Doklad Závazné nabídky: poskytovatel po prohlídce nahraje foto / PDF nabídky, kterou zákazníkovi předal.
// Jen důkaz, že slíbené nacenění dodal – Propojo ho neposuzuje, zákazník ho v aplikaci „nepřijímá“,
// penězi nehýbe (model §5). Soukromé úložiště, vidí obě strany.

import { createNotification } from '@/lib/actions/notifications'
import { sendEmail } from '@/lib/email/send'
import { customerNotReachedEmail } from '@/lib/email/templates'
import { datumCas, terminDlouze } from '@/lib/format'
import { logOrderEvent, type BookingOrder, type Db } from './payments'
import { checkInWindow } from './no-show'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
const MINUTE = 60_000
/** Jednotná čekací doba po platném příjezdu (model §9, nenastavitelná poskytovatelem) */
export const NOT_REACHED_WAIT_MIN = 15
/** Jak dlouho po konci okna příjezdu jde „Zákazník nezastižen“ ještě zaznamenat */
const NOT_REACHED_LATEST_AFTER_END_MIN = 120

export const QUOTE_PROOF_BUCKET = 'quote-proofs'
const MAX_QUOTE_PROOFS = 5

function nazev(order: BookingOrder): string {
  return order.service_items?.name || order.services?.title || 'Výjezd a nacenění'
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
    console.error('[on-site] notifikace:', err)
  }
}

// ─── Zákazník nezastižen ──────────────────────────────────────────────────

export type NotReachedState = {
  /** Čas prvního platného příjezdu (null = žádný) */
  validCheckInAt: string | null
  contactAttempts: string[]
  notReachedAt: string | null
  /** Smí poskytovatel teď poslat „Nemůžu vás zastihnout“ */
  canContact: boolean
  /** Smí poskytovatel teď zaznamenat „Zákazník nezastižen“ / od kdy */
  canMark: boolean
  markFrom: string | null
}

export async function notReachedStateOf(db: Db, order: BookingOrder, now = new Date()): Promise<NotReachedState | null> {
  if (order.offer_kind !== 'B') return null
  const w = checkInWindow(order)
  if (!w) return null
  const [{ data: ci }, { data: ev }] = await Promise.all([
    db.from('check_ins').select('recorded_at').eq('order_id', order.id).eq('is_valid', true).order('recorded_at', { ascending: true }).limit(1),
    db.from('order_events').select('type, occurred_at').eq('order_id', order.id).in('type', ['contact_attempt', 'customer_not_reached']).order('occurred_at', { ascending: true }),
  ])
  const validCheckInAt = ((ci ?? []) as Array<{ recorded_at: string }>)[0]?.recorded_at ?? null
  const events = (ev ?? []) as Array<{ type: string; occurred_at: string }>
  const contactAttempts = events.filter((e) => e.type === 'contact_attempt').map((e) => e.occurred_at)
  const notReachedAt = events.find((e) => e.type === 'customer_not_reached')?.occurred_at ?? null
  const latest = w.windowEnd.getTime() + NOT_REACHED_LATEST_AFTER_END_MIN * MINUTE
  const open = order.booking_state === 'confirmed' && !!validCheckInAt && !notReachedAt && now.getTime() <= latest
  const markFromMs = validCheckInAt ? new Date(validCheckInAt).getTime() + NOT_REACHED_WAIT_MIN * MINUTE : null
  return {
    validCheckInAt,
    contactAttempts,
    notReachedAt,
    canContact: open,
    canMark: open && contactAttempts.length > 0 && markFromMs != null && now.getTime() >= markFromMs,
    markFrom: markFromMs != null ? new Date(markFromMs).toISOString() : null,
  }
}

/** „Nemůžu vás zastihnout“ – zpráva do chatu objednávky + oznámení (= pokus o kontakt přes Propojo) */
export async function contactCustomerOnSite(db: Db, order: BookingOrder, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const st = await notReachedStateOf(db, order, now)
  if (!st?.canContact) return { ok: false, error: 'Zprávu jde poslat jen po zaznamenaném příjezdu na místo.' }
  const text = 'Jsem na místě a nemůžu vás zastihnout. Ozvěte se mi prosím co nejdřív.'
  const { error } = await (db.from('messages') as any).insert({ order_id: order.id, sender_id: order.provider_id, content: text })
  if (error) {
    console.error('[on-site] zpráva:', error.message)
    return { ok: false, error: 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu.' }
  }
  await logOrderEvent(db, order.id, 'contact_attempt', { type: 'provider', id: order.provider_id }, { channel: 'chat' })
  await notify({
    userId: order.customer_id,
    type: 'new_message',
    orderId: order.id,
    actorId: order.provider_id,
    title: 'Poskytovatel je u vás a nemůže vás zastihnout',
    preview: `${nazev(order)} · ozvěte se mu prosím co nejdřív.`,
  })
  return { ok: true }
}

export async function markCustomerNotReached(db: Db, order: BookingOrder, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const st = await notReachedStateOf(db, order, now)
  if (!st?.canMark) {
    return { ok: false, error: `„Zákazník nezastižen“ jde zaznamenat ${NOT_REACHED_WAIT_MIN} minut po příjezdu a po zprávě „Nemůžu vás zastihnout“.` }
  }
  await logOrderEvent(db, order.id, 'customer_not_reached', { type: 'provider', id: order.provider_id }, {
    valid_check_in_at: st.validCheckInAt, contact_attempts: st.contactAttempts.length,
  })
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: 'Poskytovatel vás na adrese nezastihl',
    preview: `${nazev(order)} · podrobnosti najdete v objednávce.`,
  })
  const email = await emailOf(db, order.customer_id)
  if (email) {
    const mail = customerNotReachedEmail({
      serviceTitle: nazev(order),
      termText: order.scheduled_at ? terminDlouze(order.scheduled_at) : null,
      arrivedText: st.validCheckInAt ? datumCas(st.validCheckInAt) : null,
      contactText: st.contactAttempts[0] ? datumCas(st.contactAttempts[0]) : null,
      orderUrl: `${APP_URL}/dashboard/objednavky/${order.id}`,
    })
    await sendEmail(email, mail.subject, mail.html)
  }
  return { ok: true }
}

// ─── Doklad Závazné nabídky ───────────────────────────────────────────────

export type QuoteProofRow = { id: string; storage_path: string; mime_type: string; file_name: string | null; uploaded_at: string }

export async function quoteProofsOf(db: Db, orderId: string): Promise<QuoteProofRow[]> {
  const { data } = await db
    .from('quote_proofs')
    .select('id, storage_path, mime_type, file_name, uploaded_at')
    .eq('order_id', orderId)
    .order('uploaded_at', { ascending: true })
  return (data as QuoteProofRow[] | null) ?? []
}

/** Nabídku jde nahrát u potvrzeného výjezdu od začátku okna příjezdu (prohlídka proběhla nebo probíhá) */
export function canUploadQuoteProof(order: BookingOrder, now = new Date()): boolean {
  if (order.offer_kind !== 'B') return false
  if (order.booking_state !== 'confirmed' && order.booking_state !== 'no_show_disputed') return false
  const start = order.scheduled_at ? new Date(order.scheduled_at).getTime() : null
  return start != null && now.getTime() >= start - 30 * MINUTE
}

const ALLOWED_PROOF_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

export async function quoteProofUploadUrl(
  db: Db,
  order: BookingOrder,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  if (!canUploadQuoteProof(order)) return { ok: false, error: 'Nabídku jde nahrát až od začátku výjezdu.' }
  const ext = ALLOWED_PROOF_TYPES[mimeType]
  if (!ext) return { ok: false, error: 'Nahrajte prosím fotku (JPG, PNG) nebo PDF.' }
  const { count } = await db.from('quote_proofs').select('id', { count: 'exact', head: true }).eq('order_id', order.id)
  if ((count ?? 0) >= MAX_QUOTE_PROOFS) return { ok: false, error: `Nahrát jde nejvýš ${MAX_QUOTE_PROOFS} souborů.` }
  const path = `${order.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await db.storage.from(QUOTE_PROOF_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[on-site] upload url:', error?.message)
    return { ok: false, error: 'Soubor teď nejde nahrát.' }
  }
  return { ok: true, path: data.path, token: data.token }
}

export async function recordQuoteProof(
  db: Db,
  order: BookingOrder,
  args: { path: string; mimeType: string; fileName: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canUploadQuoteProof(order)) return { ok: false, error: 'Nabídku jde nahrát až od začátku výjezdu.' }
  if (!args.path.startsWith(`${order.id}/`) || !ALLOWED_PROOF_TYPES[args.mimeType]) return { ok: false, error: 'Neplatný soubor.' }
  const { error } = await db.from('quote_proofs').insert({
    order_id: order.id,
    provider_id: order.provider_id,
    storage_path: args.path,
    mime_type: args.mimeType,
    file_name: (args.fileName ?? '').slice(0, 200) || null,
  })
  if (error) {
    console.error('[on-site] quote_proofs:', error.message)
    await db.storage.from(QUOTE_PROOF_BUCKET).remove([args.path])
    return { ok: false, error: 'Nabídku se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
  await logOrderEvent(db, order.id, 'quote_proof_uploaded', { type: 'provider', id: order.provider_id }, { path: args.path, mime_type: args.mimeType })
  await notify({
    userId: order.customer_id,
    type: 'status_change',
    orderId: order.id,
    actorId: order.provider_id,
    title: 'Poskytovatel nahrál nabídku',
    preview: `${nazev(order)} · nabídku najdete v objednávce.`,
  })
  return { ok: true }
}

/** Dočasné odkazy (1 h) na nahrané nabídky */
export async function quoteProofUrls(db: Db, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out
  const { data } = await db.storage.from(QUOTE_PROOF_BUCKET).createSignedUrls(paths, 3600)
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}
