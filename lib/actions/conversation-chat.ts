'use server'
// lib/actions/conversation-chat.ts
// Chat v době JEDNÁNÍ o poptávce — tedy PŘED výběrem poskytovatele, kdy ještě
// neexistuje objednávka. Píše a čte zprávy přes conversation_id (order_id = null),
// což dnešní order chat (sendOrderMessage / detail objednávky) neumí — ten jede
// jen přes order_id.
//
// Jakmile zákazník vybere poskytovatele, selectProvider doplní order_id na
// konverzaci i na tyhle zprávy, takže od té chvíle se totéž vlákno zobrazuje ve
// stávajícím order chatu a dál se pokračuje přes sendOrderMessage. Tenhle soubor
// se tedy používá jen ve fázi jednání.
//
// Účastníci se ověřují V KÓDU (RLS zamčená, píše se přes service role):
//   - poskytovatel = request_responses.provider_id
//   - zákazník     = requests.customer_id (přes request_response.request_id)

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from './notifications'

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

  const trimmed = content.trim()
  const img = imageUrl?.trim() || null
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
export async function sendPriceEstimate(
  conversationId: string,
  fromAmount: number,
  toAmount?: number | null,
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

  const castka = to != null
    ? `${from.toLocaleString('cs-CZ')} – ${to.toLocaleString('cs-CZ')} Kč`
    : `${from.toLocaleString('cs-CZ')} Kč`
  const content = `Předběžný odhad ceny: ${castka} (nezávazné)`

  const { data, error } = await (admin.from('messages') as any)
    .insert({
      conversation_id: conversationId,
      order_id: conv.orderId,
      sender_id: user.id,
      content,
      type: 'price_proposed',
      payload: { kind: 'price_estimate', from, to },
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