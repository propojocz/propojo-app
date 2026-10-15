'use server'
// lib/actions/inquiry.ts
// Dotaz = soukromá poptávka (schváleno 14. 10. 2026, upřesněno 15. 10. 2026).
//
// „Napsat poskytovateli“ (karta) i „Nejdřív se domluvit“ (okno objednávky) už nezakládají objednávku.
// Založí POPTÁVKU viditelnou jen tomuto poskytovateli (requests.target_provider_id, mimo veřejnou nástěnku),
// k ní odpověď poskytovatele a konverzaci – a otevře stejný chat jednání jako u veřejné poptávky
// (nabídka, odhad, termíny, „Co je domluveno“, rezervace a platba v okně; objednávka vznikne až zaplacením).
//
// Co u poskytovatele nebo zákazníka chybí, se doplní v chatu: bez vybrané položky nabídku doplní poskytovatel
// („Upravit nabídku“ v chatu), adresu zákazník. S vybranou položkou ceníku je nabídka předvyplněná z ní.
// Na dvojici zákazník + karta je vždy nejvýš jedna otevřená soukromá poptávka – další klik otevře tu samou.
// Staré dotazy (objednávky is_inquiry) zůstávají, nepřevádí se.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from './notifications'
import { customerPreferenceMessage } from '@/lib/chat-preference'
import { itemPriceKc } from '@/lib/booking/commission'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Platnost soukromé poptávky (Matej 15. 10. 2026) */
const PRIVATE_REQUEST_DAYS = 30

type Vysledek =
  | { success: true; url: string; novy: boolean }
  | { success: false; error: string }

export type PrivateRequestInput = {
  serviceId: string
  /** Vybraná položka ceníku („Nejdřív se domluvit“) – předvyplní nabídku */
  itemId?: string | null
  /** První zpráva poskytovateli */
  message?: string | null
  /** „Kdy se vám to hodí“ */
  pref?: { from: string; to: string | null; dayPart: 'kdykoli' | 'rano' | 'odpoledne' | 'vecer' } | null
  /** Obec zákazníka (služba u zákazníka) */
  city?: string | null
  /** „Nakupuji na firmu“ – přenese se do objednávky po zaplacení */
  billing?: { is_company?: boolean; name?: string | null; ico?: string | null; dic?: string | null; address?: string | null } | null
}

type ServiceRow = {
  id: string; provider_id: string; title: string | null; category: string | null; city: string | null
  city_lat: number | null; city_lng: number | null; location_type: string | null
  address: string | null; address_lat: number | null; address_lng: number | null; is_active: boolean | null
}

type ItemRow = {
  id: string; service_id: string; name: string; offer_kind: string | null; deposit_amount: number | null
  quote_fee: number | null; deposit_type: string | null; quote_fee_deductible: boolean | null; is_active: boolean | null
}

const chatUrl = (requestId: string, conversationId: string) => `/poptavky/${requestId}/jednani/${conversationId}`

export async function startPrivateRequest(input: PrivateRequestInput): Promise<Vysledek> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }
  const admin = getAdminClient()

  const { data: svcRow } = await admin
    .from('services')
    .select('id, provider_id, title, category, city, city_lat, city_lng, location_type, address, address_lat, address_lng, is_active')
    .eq('id', input.serviceId)
    .maybeSingle()
  const svc = svcRow as ServiceRow | null
  if (!svc || svc.is_active === false) return { success: false, error: 'Nabídka neexistuje.' }
  if (svc.provider_id === user.id) return { success: false, error: 'Tohle je vaše vlastní nabídka.' }

  // Vybraná položka ceníku → nabídka z ní (typ A služba / B výjezd a Rezervační poplatek / Cena výjezdu)
  let item: ItemRow | null = null
  if (input.itemId) {
    const { data: it } = await admin
      .from('service_items')
      .select('id, service_id, name, offer_kind, deposit_amount, quote_fee, deposit_type, quote_fee_deductible, is_active')
      .eq('id', input.itemId)
      .maybeSingle()
    item = (it as ItemRow | null) && (it as ItemRow).service_id === svc.id && (it as ItemRow).is_active !== false ? (it as ItemRow) : null
  }
  const itemKind = item && (item.offer_kind === 'A' || item.offer_kind === 'B') ? item.offer_kind : null
  const itemKc = item && itemKind && item.deposit_type !== 'plna_platba'
    ? itemPriceKc({ offer_kind: itemKind, deposit_amount: item.deposit_amount, quote_fee: item.quote_fee })
    : null
  const offerCols = itemKind && itemKc
    ? { offer_kind: itemKind, charge_halere: Math.round(itemKc * 100), quote_fee_deductible: itemKind === 'B' ? item!.quote_fee_deductible === true : false }
    : {}

  const atProvider = svc.location_type === 'u_poskytovatele'
  const placeCols = atProvider
    ? { place: 'u_poskytovatele', place_address: svc.address, place_lat: svc.address_lat, place_lng: svc.address_lng }
    : { place: 'u_zakaznika' }

  // Už spolu o téhle kartě jednáme? Pak jen otevřeme stejné vlákno (a případně doplníme vybranou položku).
  const { data: existing } = await admin
    .from('requests')
    .select('id, status, expires_at')
    .eq('customer_id', user.id)
    .eq('target_provider_id', svc.provider_id)
    .eq('target_service_id', svc.id)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  const ex = ((existing ?? [])[0] as { id: string } | undefined) ?? null
  if (ex) {
    const { data: rr } = await admin.from('request_responses').select('id, status, offer_kind').eq('request_id', ex.id).eq('provider_id', svc.provider_id).maybeSingle()
    const resp = rr as { id: string; status: string; offer_kind: string | null } | null
    if (resp) {
      const { data: conv } = await admin.from('conversations').select('id').eq('request_response_id', resp.id).maybeSingle()
      const convId = (conv as { id: string } | null)?.id
      if (convId) {
        // Zákazník teď vybral konkrétní položku a nabídka ještě není → doplnit z ní
        if (item && !resp.offer_kind && itemKind && itemKc) {
          await admin.from('request_responses').update({ ...offerCols, service_item_id: item.id, updated_at: new Date().toISOString() }).eq('id', resp.id)
        }
        const first = await postFirstMessages(admin, convId, user.id, resp.id, input, item)
        if (first) await notifyProvider(admin, svc, user.id, chatUrl(ex.id, convId), first, false)
        return { success: true, url: chatUrl(ex.id, convId), novy: false }
      }
    }
  }

  // Obec poptávky: zadaná zákazníkem (služba u něj), jinak obec karty. Musí mít polohu.
  let city = (input.city?.trim() || svc.city || '').trim()
  let cityLat = svc.city_lat
  let cityLng = svc.city_lng
  if (input.city?.trim()) {
    const { data: obec } = await admin.from('obce').select('obec, latitude, longitude').ilike('obec', input.city.trim()).limit(1).maybeSingle()
    const o = obec as { obec: string; latitude: number; longitude: number } | null
    if (o) { city = o.obec; cityLat = o.latitude; cityLng = o.longitude }
  }
  if (!city) {
    const { data: prof } = await admin.from('profiles').select('city').eq('id', user.id).maybeSingle()
    city = String((prof as { city: string | null } | null)?.city ?? '').trim()
  }
  if (!city) return { success: false, error: 'Zadejte prosím obec, kde se má služba provést.' }

  const title = item?.name ?? svc.title ?? 'Služba'
  const { data: req, error: reqErr } = await (admin.from('requests') as any)
    .insert({
      customer_id: user.id,
      category: svc.category ?? null,
      description: (input.message?.trim() || `Dotaz: ${title}`).slice(0, 2000),
      photos: [],
      city,
      city_lat: cityLat,
      city_lng: cityLng,
      place_pref: atProvider ? 'u_poskytovatele' : 'u_zakaznika',
      expires_at: new Date(Date.now() + PRIVATE_REQUEST_DAYS * 24 * 3600_000).toISOString(),
      target_provider_id: svc.provider_id,
      target_service_id: svc.id,
      billing: input.billing?.is_company ? input.billing : null,
    })
    .select('id')
    .single()
  if (reqErr || !req) {
    console.error('[startPrivateRequest] poptávka', reqErr)
    return { success: false, error: 'Nepodařilo se otevřít konverzaci.' }
  }
  const requestId = (req as { id: string }).id

  const { data: resp, error: respErr } = await (admin.from('request_responses') as any)
    .insert({
      request_id: requestId,
      provider_id: svc.provider_id,
      service_id: svc.id,
      service_item_id: item?.id ?? null,
      status: 'interested',
      ...offerCols,
      ...placeCols,
    })
    .select('id')
    .single()
  if (respErr || !resp) {
    console.error('[startPrivateRequest] reakce', respErr)
    await admin.from('requests').delete().eq('id', requestId)
    return { success: false, error: 'Nepodařilo se otevřít konverzaci.' }
  }
  const responseId = (resp as { id: string }).id

  const { data: conv, error: convErr } = await (admin.from('conversations') as any)
    .insert({ request_response_id: responseId, status: 'open' })
    .select('id')
    .single()
  if (convErr || !conv) {
    console.error('[startPrivateRequest] konverzace', convErr)
    await admin.from('request_responses').delete().eq('id', responseId)
    await admin.from('requests').delete().eq('id', requestId)
    return { success: false, error: 'Nepodařilo se otevřít konverzaci.' }
  }
  const conversationId = (conv as { id: string }).id

  const first = await postFirstMessages(admin, conversationId, user.id, responseId, input, item)
  // Poskytovatel se to musí dozvědět, jinak dotaz zapadne – jedno oznámení za celý dotaz
  await notifyProvider(admin, svc, user.id, chatUrl(requestId, conversationId), first ?? (item ? `${svc.title ?? ''} · ${item.name}` : (svc.title ?? null)), true)

  revalidatePath('/dashboard/poptavky')
  return { success: true, url: chatUrl(requestId, conversationId), novy: true }
}

/**
 * První zpráva, vybraná položka a „Kdy se vám to hodí“ do chatu (jako by je zákazník napsal sám).
 * Vkládá se přímo (bez oznámení u každé zprávy) – poskytovatel dostane jedno oznámení o dotazu.
 * Vrací náhled textu pro oznámení (null = nic se neposlalo).
 */
async function postFirstMessages(
  admin: ReturnType<typeof getAdminClient>,
  conversationId: string,
  customerId: string,
  responseId: string,
  input: PrivateRequestInput,
  item: ItemRow | null,
): Promise<string | null> {
  const rows: Array<Record<string, unknown>> = []
  const lines = [item ? `Mám zájem o: ${item.name}` : null, input.message?.trim().slice(0, 2000) || null].filter(Boolean)
  if (lines.length) rows.push({ conversation_id: conversationId, order_id: null, sender_id: customerId, content: lines.join('\n') })
  if (input.pref?.from) {
    const pref = customerPreferenceMessage({ kind: 'time_preference', from: input.pref.from, to: input.pref.to, dayPart: input.pref.dayPart })
    if (pref.ok) rows.push({ conversation_id: conversationId, order_id: null, sender_id: customerId, content: pref.content, type: 'message', payload: pref.payload })
  }
  if (!rows.length) return null
  // Pořadí zpráv: každá o chlup později (stejný čas by je v chatu mohl prohodit)
  const base = Date.now()
  const { error } = await (admin.from('messages') as any).insert(rows.map((row, k) => ({ ...row, created_at: new Date(base + k).toISOString() })))
  if (error) { console.error('[startPrivateRequest] zprávy', error); return null }
  await admin.from('request_responses').update({ last_message_at: new Date().toISOString() }).eq('id', responseId)
  const text = rows.map((row) => String(row.content)).join(' · ')
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

async function notifyProvider(
  admin: ReturnType<typeof getAdminClient>,
  svc: ServiceRow,
  customerId: string,
  url: string,
  preview: string | null,
  isNew: boolean,
) {
  try {
    const { data: kdo } = await admin.from('profiles').select('full_name').eq('id', customerId).maybeSingle()
    const name = (kdo as { full_name: string | null } | null)?.full_name ?? 'zákazníka'
    await createNotification({
      userId: svc.provider_id,
      type: 'new_message',
      actorId: customerId,
      title: isNew ? `Dotaz od ${name}` : `Nová zpráva od ${name}`,
      preview,
      url,
    })
  } catch (e) {
    console.error('[startPrivateRequest] notifikace', e)
  }
}

/** „Napsat poskytovateli“ z karty nabídky */
export async function zacniDotaz(serviceId: string): Promise<Vysledek> {
  return startPrivateRequest({ serviceId })
}
