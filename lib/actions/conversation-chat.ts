'use server'
// lib/actions/conversation-chat.ts
// Chat v době JEDNÁNÍ o poptávce — tedy PŘED výběrem poskytovatele, kdy ještě
// neexistuje objednávka. Píše a čte zprávy přes conversation_id (order_id = null),
// což dnešní order chat (sendOrderMessage / detail objednávky) neumí — ten jede
// jen přes order_id.
//
// Jakmile zákazník vybere termín a zaplatí, finalizeRequestSelection doplní order_id na
// konverzaci i na tyhle zprávy, takže od té chvíle se totéž vlákno zobrazuje ve
// stávajícím order chatu a dál se pokračuje přes sendOrderMessage. Tenhle soubor
// se tedy používá jen ve fázi jednání.
//
// 10. 10. 2026: chat jednání skládá domluvu – zákazník pošle, kdy se mu to hodí, a rozpočet
// (sendCustomerPreference), poskytovatel odhad ceny a termíny. Vybrat poskytovatele jde jen
// s termínem (selectProviderWithTerm); poptávka se ostatním uzavře až zaplacením.
//
// Účastníci se ověřují V KÓDU (RLS zamčená, píše se přes service role):
//   - poskytovatel = request_responses.provider_id
//   - zákazník     = requests.customer_id (přes request_response.request_id)

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from './notifications'
import { BOOKING_POLICY } from '@/lib/booking/policy'
import { createDraftOrderFromResponse } from '@/lib/booking/request-selection'
import { cas, terminDlouze } from '@/lib/format'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type ConvInfo = {
  status: string
  orderId: string | null
  responseId: string | null
  requestId: string | null
  providerId: string | null
  customerId: string | null
}

// Dohledá konverzaci a její dva účastníky. Funguje pro obě fáze: když už má
// konverzace order_id (po výběru), bere strany z objednávky; jinak z reakce a
// poptávky.
async function loadConversation(admin: any, conversationId: string): Promise<ConvInfo | null> {
  const { data: conv } = await admin
    .from('conversations')
    .select('id, status, order_id, request_response_id')
    .eq('id', conversationId)
    .single() as { data: { id: string; status: string; order_id: string | null; request_response_id: string | null } | null }
  if (!conv) return null

  if (conv.order_id) {
    const { data: ord } = await admin
      .from('orders')
      .select('provider_id, customer_id')
      .eq('id', conv.order_id)
      .single() as { data: { provider_id: string; customer_id: string } | null }
    return {
      status: conv.status,
      orderId: conv.order_id,
      responseId: conv.request_response_id,
      requestId: null,
      providerId: ord?.provider_id ?? null,
      customerId: ord?.customer_id ?? null,
    }
  }

  if (conv.request_response_id) {
    const { data: rr } = await admin
      .from('request_responses')
      .select('provider_id, request_id')
      .eq('id', conv.request_response_id)
      .single() as { data: { provider_id: string; request_id: string } | null }
    let customerId: string | null = null
    if (rr?.request_id) {
      const { data: req } = await admin
        .from('requests')
        .select('customer_id')
        .eq('id', rr.request_id)
        .single() as { data: { customer_id: string | null } | null }
      customerId = req?.customer_id ?? null
    }
    return {
      status: conv.status,
      orderId: null,
      responseId: conv.request_response_id,
      requestId: rr?.request_id ?? null,
      providerId: rr?.provider_id ?? null,
      customerId,
    }
  }

  return { status: conv.status, orderId: null, responseId: null, requestId: null, providerId: null, customerId: null }
}

type ChatResult =
  | { success: true; messages: any[] }
  | { success: false; error: string }

// ── Načtení zpráv jednání ────────────────────────────────────
export async function getConversationMessages(conversationId: string): Promise<ChatResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const conv = await loadConversation(admin, conversationId)
  if (!conv) return { success: false, error: 'Konverzace nebyla nalezena.' }
  if (user.id !== conv.providerId && user.id !== conv.customerId) {
    return { success: false, error: 'K této konverzaci nemáte přístup.' }
  }

  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[getConversationMessages]', error)
    return { success: false, error: 'Zprávy se nepodařilo načíst.' }
  }
  return { success: true, messages: (data as any[]) ?? [] }
}

type SendResult =
  | { success: true; id: string; message: any }
  | { success: false; error: string }

// ── Odeslání zprávy v jednání ────────────────────────────────
// Pozn.: messages_content_check vyžaduje neprázdný content (1–2000 znaků), proto
// tady vyžadujeme text; fotka může jít s ním. Fotka bez textu by constraint
// porušila — stejné omezení má i dnešní order chat, kdyby na to došlo.
export async function sendConversationMessage(
  conversationId: string,
  content: string,
  imageUrl?: string | null,
): Promise<SendResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const img = imageUrl?.trim() || null
  // Příloha (fotka / PDF) jde poslat i bez textu
  const trimmed = content.trim() || (img ? (/\.pdf($|\?)/i.test(img) ? 'Příloha (PDF)' : 'Fotka') : '')
  if (!trimmed) return { success: false, error: 'Napište zprávu.' }
  if (trimmed.length > 2000) return { success: false, error: 'Zpráva je příliš dlouhá.' }

  const admin = getAdminClient()
  const conv = await loadConversation(admin, conversationId)
  if (!conv) return { success: false, error: 'Konverzace nebyla nalezena.' }
  if (user.id !== conv.providerId && user.id !== conv.customerId) {
    return { success: false, error: 'K této konverzaci nemáte přístup.' }
  }
  if (conv.status !== 'open') {
    return { success: false, error: 'Tahle konverzace je uzavřená.' }
  }

  const { data, error } = await (admin.from('messages') as any)
    .insert({
      conversation_id: conversationId,
      order_id: conv.orderId,     // ve fázi jednání null; po výběru už drží objednávku
      sender_id: user.id,
      content: trimmed,
      image_url: img,
    })
    .select('*')
    .single() as { data: any; error: any }
  if (error || !data) {
    console.error('[sendConversationMessage]', error)
    return { success: false, error: 'Zprávu se nepodařilo odeslat.' }
  }

  // Řazení „Moje jednání" podle poslední zprávy.
  if (conv.responseId) {
    await (admin.from('request_responses') as any)
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conv.responseId)
  }

  // Oznámení druhé straně. Když objednávka existuje, míříme na ni; jinak zatím
  // na /poptavky (konkrétní route na jednání se doladí v UI vrstvě).
  try {
    const otherId = user.id === conv.providerId ? conv.customerId : conv.providerId
    if (otherId) {
      const { data: kdo } = await admin
        .from('profiles').select('full_name').eq('id', user.id).maybeSingle() as { data: { full_name: string | null } | null }
      await createNotification({
        userId: otherId,
        type: 'new_message',
        orderId: conv.orderId,
        actorId: user.id,
        title: `Nová zpráva od ${kdo?.full_name ?? 'uživatele'}`,
        preview: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
        url: conv.orderId
          ? null
          : (conv.requestId ? `/poptavky/${conv.requestId}/jednani/${conversationId}` : '/poptavky'),
      })
    }
  } catch (e) {
    console.error('[sendConversationMessage] notifikace', e)
  }

  return { success: true, id: data.id, message: data }
}

// ── Odeslání strukturovaného odhadu ceny (jen poskytovatel) ──
// Nezávazný odhad, který se ukáže i v přehledu zájemců, aby se zákazník mohl
// rozhodnout mezi více poskytovateli. Ukládá se jako zpráva type 'price_proposed'
// s payloadem { kind:'price_estimate', from, to }. Termín se tu NENAVRHUJE —
// závazný termín i platba patří až do objednávky po výběru.
/** Materiál v odhadu ceny (nepovinné): s materiálem / bez materiálu / neuvedeno (null) */
export type EstimateMaterial = 'with' | 'without' | null

export async function sendPriceEstimate(
  conversationId: string,
  fromAmount: number,
  toAmount?: number | null,
  material: EstimateMaterial = null,
): Promise<SendResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const from = Math.round(Number(fromAmount))
  const to = toAmount != null && String(toAmount) !== '' ? Math.round(Number(toAmount)) : null
  if (!from || from <= 0) return { success: false, error: 'Zadejte částku odhadu.' }
  if (to != null && to < from) return { success: false, error: 'Horní hranice nemůže být nižší než dolní.' }

  const admin = getAdminClient()
  const conv = await loadConversation(admin, conversationId)
  if (!conv) return { success: false, error: 'Konverzace nebyla nalezena.' }
  // Odhad posílá jen poskytovatel.
  if (user.id !== conv.providerId) {
    return { success: false, error: 'Odhad ceny může poslat jen poskytovatel.' }
  }
  if (conv.status !== 'open') {
    return { success: false, error: 'Tahle konverzace je uzavřená.' }
  }
  // Poplatek z nabídky se z ceny zakázky odečítá (služba vždy, výjezd podle volby) → odhad nesmí být nižší.
  if (conv.responseId) {
    const { data: rr } = await admin
      .from('request_responses')
      .select('offer_kind, charge_halere, quote_fee_deductible')
      .eq('id', conv.responseId)
      .maybeSingle() as { data: { offer_kind: string | null; charge_halere: number | null; quote_fee_deductible: boolean | null } | null }
    const fee = rr?.charge_halere ? rr.charge_halere / 100 : null
    if (fee && (rr?.offer_kind === 'A' || (rr?.offer_kind === 'B' && rr.quote_fee_deductible)) && from < fee) {
      return { success: false, error: `Odhad nemůže být nižší než ${fee.toLocaleString('cs-CZ')} Kč – ${rr?.offer_kind === 'A' ? 'Rezervační poplatek' : 'Cena výjezdu'} se z ceny zakázky odečítá.` }
    }
  }

  const castka = to != null
    ? `${from.toLocaleString('cs-CZ')} – ${to.toLocaleString('cs-CZ')} Kč`
    : `${from.toLocaleString('cs-CZ')} Kč`
  const mat = material === 'with' ? 'with' : material === 'without' ? 'without' : null
  const content = `Předběžný odhad ceny: ${castka} (nezávazné${mat === 'with' ? ', včetně materiálu' : mat === 'without' ? ', bez materiálu' : ''})`

  const { data, error } = await (admin.from('messages') as any)
    .insert({
      conversation_id: conversationId,
      order_id: conv.orderId,
      sender_id: user.id,
      content,
      type: 'price_proposed',
      payload: { kind: 'price_estimate', from, to, material: mat },
    })
    .select('*')
    .single() as { data: any; error: any }
  if (error || !data) {
    console.error('[sendPriceEstimate]', error)
    return { success: false, error: 'Odhad se nepodařilo odeslat.' }
  }

  if (conv.responseId) {
    await (admin.from('request_responses') as any)
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conv.responseId)
  }

  try {
    if (conv.customerId) {
      await createNotification({
        userId: conv.customerId,
        type: 'new_message',
        orderId: conv.orderId,
        actorId: user.id,
        title: 'Poskytovatel poslal odhad ceny',
        preview: castka,
        url: conv.orderId ? null : (conv.requestId ? `/poptavky/${conv.requestId}/jednani/${conversationId}` : '/poptavky'),
      })
    }
  } catch (e) {
    console.error('[sendPriceEstimate] notifikace', e)
  }

  return { success: true, id: data.id, message: data }
}

// ── Termín přímo v jednání (3d, 7. 10. 2026) ─────────────────
// Poskytovatel může termín navrhnout už v chatu jednání, zákazník pak jedním
// tlačítkem vybere poskytovatele i termín („Vybrat a rezervovat“). Návrh je zpráva
// s payloadem { kind: 'term_proposal', starts_at, ends_at, arrival_window }; závazně
// se ověří (kolize, předstih, platba) až při přijetí v objednávce (acceptProposal).

const ACTIVE_RESPONSE = ['interested', 'negotiating']

export async function proposeTermInChat(
  conversationId: string,
  startsAt: string,
  minutes: number,
): Promise<SendResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const conv = await loadConversation(admin, conversationId)
  if (!conv || !conv.responseId) return { success: false, error: 'Konverzace nebyla nalezena.' }
  if (user.id !== conv.providerId) return { success: false, error: 'Termín může navrhnout jen poskytovatel.' }
  if (conv.status !== 'open' || conv.orderId) return { success: false, error: 'Tahle konverzace je uzavřená.' }

  const { data: rr } = await admin
    .from('request_responses')
    .select('status, offer_kind, charge_halere')
    .eq('id', conv.responseId)
    .single() as { data: { status: string; offer_kind: string | null; charge_halere: number | null } | null }
  if (!rr || !ACTIVE_RESPONSE.includes(rr.status)) return { success: false, error: 'U téhle poptávky už termín navrhnout nejde.' }
  if ((rr.offer_kind !== 'A' && rr.offer_kind !== 'B') || !rr.charge_halere) {
    return { success: false, error: 'Nejdřív u poptávky vyplňte nabídku (co zákazník zaplatí přes Propojo).' }
  }

  const start = new Date(startsAt)
  if (isNaN(start.getTime())) return { success: false, error: 'Neplatný termín.' }
  if (start.getTime() < Date.now() + BOOKING_POLICY.minLeadMinutes * 60_000) {
    return { success: false, error: `Termín musí začínat nejdříve za ${BOOKING_POLICY.minLeadMinutes} minut.` }
  }
  const arrival = rr.offer_kind === 'B'
  const m = Math.round(Number(minutes))
  if (arrival ? !BOOKING_POLICY.arrivalWindow.optionsMinutes.includes(m) : (!Number.isFinite(m) || m < 5 || m > 720)) {
    return { success: false, error: arrival ? 'Neplatná délka okna příjezdu.' : 'Délka musí být mezi 5 minutami a 12 hodinami.' }
  }
  const end = new Date(start.getTime() + m * 60_000)

  // Rychlá kontrola kolize s jinou rezervací poskytovatele (závazně znovu při přijetí).
  const { data: clashes } = await admin
    .from('orders')
    .select('id, scheduled_at, scheduled_end, deposit_status, hold_expires_at')
    .eq('provider_id', user.id)
    .neq('status', 'zruseno')
    .not('scheduled_at', 'is', null)
    .lt('scheduled_at', end.toISOString()) as { data: any[] | null }
  const clash = (clashes ?? []).find((o) => {
    if (o.deposit_status === 'pending' && o.hold_expires_at && new Date(o.hold_expires_at).getTime() <= Date.now()) return false
    const oEnd = o.scheduled_end ? new Date(o.scheduled_end).getTime() : new Date(o.scheduled_at).getTime() + 60 * 60_000
    return oEnd > start.getTime()
  })
  if (clash) {
    return { success: false, error: `V tu dobu už máte jinou rezervaci (${terminDlouze(clash.scheduled_at)}). Vyberte prosím jiný čas.` }
  }

  const label = arrival ? `${terminDlouze(start)}–${cas(end)} (přijedu v tomto rozmezí)` : `${terminDlouze(start)} (${m} min)`
  const { data, error } = await (admin.from('messages') as any)
    .insert({
      conversation_id: conversationId,
      order_id: null,
      sender_id: user.id,
      content: `Navrhuji termín: ${label}.`,
      type: 'message',
      payload: { kind: 'term_proposal', starts_at: start.toISOString(), ends_at: end.toISOString(), arrival_window: arrival },
    })
    .select('*')
    .single() as { data: any; error: any }
  if (error || !data) {
    console.error('[proposeTermInChat]', error)
    return { success: false, error: 'Návrh se nepodařilo odeslat.' }
  }

  await (admin.from('request_responses') as any)
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conv.responseId)

  try {
    if (conv.customerId) {
      await createNotification({
        userId: conv.customerId,
        type: 'new_message',
        actorId: user.id,
        title: 'Poskytovatel navrhl termín',
        preview: label,
        url: `/poptavky/${conv.requestId}/jednani/${conversationId}`,
      })
    }
  } catch (err) {
    console.error('[proposeTermInChat] notifikace', err)
  }

  return { success: true, id: data.id, message: data }
}

/**
 * Zákazník vybere poskytovatele rovnou s termínem z chatu: vznikne rozpracovaná objednávka, termín
 * se do ní vloží jako návrh a zákazník pokračuje shrnutím (adresa, kontakt, souhlasy) a platbou.
 * Poptávka i ostatní jednání zůstávají otevřené až do zaplacení (finalizeRequestSelection).
 */
export async function selectProviderWithTerm(
  conversationId: string,
  messageId: string,
): Promise<{ success: true; orderId: string; startsAt: string } | { success: false; error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const conv = await loadConversation(admin, conversationId)
  if (!conv || !conv.responseId || !conv.requestId) return { success: false, error: 'Konverzace nebyla nalezena.' }
  if (user.id !== conv.customerId) return { success: false, error: 'Vybírá zákazník.' }

  const { data: msg } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id, payload')
    .eq('id', messageId)
    .maybeSingle() as { data: { id: string; conversation_id: string | null; sender_id: string; payload: any } | null }
  const p = msg?.payload
  if (!msg || msg.conversation_id !== conversationId || msg.sender_id !== conv.providerId || p?.kind !== 'term_proposal') {
    return { success: false, error: 'Návrh termínu nebyl nalezen.' }
  }
  if (new Date(p.starts_at).getTime() < Date.now() + BOOKING_POLICY.minLeadMinutes * 60_000) {
    return { success: false, error: 'Tento termín už nejde vybrat. Požádejte poskytovatele o nový.' }
  }

  const draft = await createDraftOrderFromResponse(admin, {
    requestId: conv.requestId, responseId: conv.responseId, conversationId, customerId: user.id,
  })
  if (!draft.ok) return { success: false, error: draft.error }

  // Návrh termínu do objednávky (u znovu použité objednávky jen když tam ještě není)
  const { data: existing } = await admin
    .from('order_time_proposals')
    .select('id')
    .eq('order_id', draft.orderId)
    .eq('starts_at', p.starts_at)
    .limit(1) as { data: Array<{ id: string }> | null }
  if (!existing?.length) {
    const { error } = await (admin.from('order_time_proposals') as any)
      .insert({ order_id: draft.orderId, starts_at: p.starts_at, ends_at: p.ends_at })
    if (error) {
      console.error('[selectProviderWithTerm] návrh', error)
      return { success: false, error: 'Termín se nepodařilo převzít. Zkuste to prosím znovu.' }
    }
  }

  // Poskytovatel dostane oznámení „Zákazník vybral termín — čeká na platbu“ až při přijetí termínu ve shrnutí
  // (acceptProposal) – tady by bylo duplicitní.
  return { success: true, orderId: draft.orderId, startsAt: p.starts_at }
}

// ── Domluva od zákazníka: kdy se to hodí, rozpočet ─────────────────
// Strukturovaná zpráva do chatu jednání. Poskytovatel podle ní pošle odhad a termíny; souhrn
// „Co je domluveno“ bere vždy poslední hodnotu. Nic se tím nerezervuje ani neplatí.

export type CustomerPreference =
  | { kind: 'time_preference'; from: string; to: string | null; dayPart: 'kdykoli' | 'rano' | 'odpoledne' | 'vecer'; note?: string | null }
  | { kind: 'budget'; from: number | null; to: number }

const DAY_PARTS: Record<string, string> = {
  kdykoli: 'kdykoli během dne', rano: 'ráno (8–12)', odpoledne: 'odpoledne (12–17)', vecer: 'večer (17–20)',
}

export async function sendCustomerPreference(conversationId: string, pref: CustomerPreference): Promise<SendResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const conv = await loadConversation(admin, conversationId)
  if (!conv || !conv.responseId) return { success: false, error: 'Konverzace nebyla nalezena.' }
  if (user.id !== conv.customerId) return { success: false, error: 'Tohle posílá zákazník.' }
  if (conv.status !== 'open' || conv.orderId) return { success: false, error: 'Tahle konverzace je uzavřená.' }

  let content: string
  let payload: Record<string, unknown>
  const den = (iso: string) => new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(`${iso}T12:00:00Z`))
  if (pref.kind === 'time_preference') {
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (!iso.test(pref.from) || (pref.to && !iso.test(pref.to))) return { success: false, error: 'Vyberte datum.' }
    if (pref.to && pref.to < pref.from) return { success: false, error: 'Konec nemůže být dřív než začátek.' }
    const part = DAY_PARTS[pref.dayPart] ?? DAY_PARTS.kdykoli
    const note = pref.note?.trim().slice(0, 200) || null
    content = `Hodí se mi: ${pref.to && pref.to !== pref.from ? `${den(pref.from)} – ${den(pref.to)}` : den(pref.from)}, ${part}${note ? ` (${note})` : ''}.`
    payload = { kind: 'time_preference', from: pref.from, to: pref.to && pref.to !== pref.from ? pref.to : null, day_part: pref.dayPart, note }
  } else {
    const to = Math.round(Number(pref.to))
    const from = pref.from != null ? Math.round(Number(pref.from)) : null
    if (!Number.isFinite(to) || to <= 0) return { success: false, error: 'Zadejte rozpočet v Kč.' }
    if (from != null && (!Number.isFinite(from) || from <= 0 || from > to)) return { success: false, error: 'Rozpočet „od“ musí být nižší než „do“.' }
    const castka = from != null ? `${from.toLocaleString('cs-CZ')} – ${to.toLocaleString('cs-CZ')} Kč` : `do ${to.toLocaleString('cs-CZ')} Kč`
    content = `Můj rozpočet: ${castka}.`
    payload = { kind: 'budget', from, to }
  }

  const { data, error } = await (admin.from('messages') as any)
    .insert({ conversation_id: conversationId, order_id: null, sender_id: user.id, content, type: 'message', payload })
    .select('*')
    .single() as { data: any; error: any }
  if (error || !data) {
    console.error('[sendCustomerPreference]', error)
    return { success: false, error: 'Nepodařilo se odeslat.' }
  }
  await (admin.from('request_responses') as any)
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conv.responseId)
  try {
    if (conv.providerId) {
      await createNotification({
        userId: conv.providerId,
        type: 'new_message',
        actorId: user.id,
        title: pref.kind === 'budget' ? 'Zákazník poslal rozpočet' : 'Zákazník napsal, kdy se mu to hodí',
        preview: content,
        url: `/poptavky/${conv.requestId}/jednani/${conversationId}`,
      })
    }
  } catch (err) {
    console.error('[sendCustomerPreference] notifikace', err)
  }
  return { success: true, id: data.id, message: data }
}
