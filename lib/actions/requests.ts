'use server'
// lib/actions/requests.ts
// Serverové akce poptávkového systému (tabulky requests / request_responses / conversations).
//
// Model (odsouhlaseno 20.8.): veřejná poptávka → poskytovatelé klikají „Mám zájem"
// → od té chvíle běží chat v conversations. Výběrem JEDNOHO poskytovatele vznikne
// objednávka a ostatní jednání se přepnou na 'not_selected'. POPTÁVKA NENÍ OBJEDNÁVKA.
//
// RLS na těchhle tabulkách je zamčená (čte se přes service role), takže:
//   1) přihlášení a vlastnictví se ověřuje V KÓDU (jako u service-items.ts),
//   2) samotné zápisy jdou přes service-role admin klienta.
// Poptávku smí založit i nepřihlášený člověk — proto zápis nemůže spoléhat na RLS.
//
// Povolené hodnoty status (dle CHECK constraintů v DB):
//   requests.status            : open | selected | closed | expired
//   request_responses.status   : interested | negotiating | rejected | not_selected | selected
//   conversations.status       : open | closed

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createNotification } from './notifications'
import type { ActionResult } from './types'
import { bookingCharge } from '@/lib/booking/commission'
import { loadRequestDetail, type RequestDetailData } from '@/lib/request-detail'

/** Nabídka v odpovědi na poptávku: typ a částka placená přes Propojo (3d, 7. 10. 2026). */
export type ResponseOffer = {
  offerKind: 'A' | 'B'
  chargeKc: number
  quoteFeeDeductible?: boolean
  /** Kde služba proběhne (12. 10. 2026): u zákazníka, nebo v provozovně poskytovatele */
  place?: 'u_zakaznika' | 'u_poskytovatele'
  /** Adresa provozovny (u poskytovatele) – vybraná ze seznamu */
  placeAddress?: { text: string; lat: number | null; lng: number | null } | null
}

/** Místo z nabídky → sloupce request_responses; u provozovny povinná přesná adresa ze seznamu */
function placeOf(offer: ResponseOffer | null | undefined): { ok: true; cols: Record<string, unknown> } | { ok: false; error: string } {
  if (!offer?.place) return { ok: true, cols: {} }
  if (offer.place === 'u_poskytovatele') {
    const a = offer.placeAddress
    if (!a?.text?.trim() || !/\d/.test(a.text) || a.lat == null || a.lng == null) {
      return { ok: false, error: 'Vyberte ze seznamu přesnou adresu, kde služba proběhne (ulice a číslo).' }
    }
    return { ok: true, cols: { place: 'u_poskytovatele', place_address: a.text.trim(), place_lat: a.lat, place_lng: a.lng } }
  }
  return { ok: true, cols: { place: 'u_zakaznika', place_address: null, place_lat: null, place_lng: null } }
}

function checkOffer(offer: ResponseOffer | null | undefined): { ok: true; kind: 'A' | 'B'; halere: number; deductible: boolean } | { ok: false; error: string } {
  if (!offer) return { ok: false, error: 'Vyplňte prosím, co zákazník zaplatí přes Propojo.' }
  if (offer.offerKind !== 'A' && offer.offerKind !== 'B') return { ok: false, error: 'Vyberte typ nabídky.' }
  if (!Number.isInteger(offer.chargeKc) || offer.chargeKc <= 0) return { ok: false, error: 'Zadejte částku v celých korunách.' }
  const c = bookingCharge({ offer_kind: offer.offerKind, deposit_amount: null, quote_fee: null, agreed_charge_halere: offer.chargeKc * 100 })
  if (!c.ok) return { ok: false, error: c.error }
  // Služba se odečítá vždy (VOP 11.1); u výjezdu rozhoduje poskytovatel (VOP 11.6).
  return { ok: true, kind: offer.offerKind, halere: offer.chargeKc * 100, deductible: offer.offerKind === 'B' && offer.quoteFeeDeductible === true }
}

// Kolik poskytovatelů může s JEDNOU poptávkou zároveň aktivně jednat.
// Aktivní = 'interested' nebo 'negotiating'. Odmítnutí ('rejected') místo uvolní.
// Strop je NA POPTÁVKU (chrání zákazníka před záplavou). Kdyby měl být na
// poskytovatele, stačí v countActive počítat podle provider_id místo request_id.
const MAX_ACTIVE_RESPONSES = 5
const ACTIVE_STATUSES = ['interested', 'negotiating'] as const

type InterestResult =
  | { success: true; id: string; conversationId: string | null }
  | { success: false; error: string }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Založení poptávky ────────────────────────────────────────
const createSchema = z.object({
  category: z.string().max(100).nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
  description: z.string().min(5, 'Popište, co potřebujete.').max(2000),
  city: z.string().min(1, 'Zadejte město.').max(120),
  city_lat: z.number().nullable().optional(),
  city_lng: z.number().nullable().optional(),
  preferred_date: z.string().max(120).nullable().optional(),
  needed_at: z.string().max(20).nullable().optional(), // 'YYYY-MM-DD'
  email: z.string().email('Neplatný e-mail.').nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  photos: z.array(z.string()).max(12).optional(),
  // Představa zákazníka – vizualizace, jak to má vypadat (12. 10. 2026)
  inspiration_photos: z.array(z.string()).max(8).optional(),
  // Kde se to má konat (12. 10. 2026): u zákazníka / u poskytovatele / je mi to jedno
  place_pref: z.enum(['u_zakaznika', 'u_poskytovatele', 'jedno']).nullable().optional(),
  // Nepovinná přesná adresa (12. 10. 2026) – poskytovatelé ji nevidí, přenese se do objednávky
  address: z.string().max(300).nullable().optional(),
  address_lat: z.number().nullable().optional(),
  address_lng: z.number().nullable().optional(),
  // Nepovinný nezávazný rozpočet zákazníka (11. 10. 2026)
  budget_from_kc: z.number().int().positive().max(10_000_000).nullable().optional(),
  budget_to_kc: z.number().int().positive().max(10_000_000).nullable().optional(),
}).refine((v) => !v.budget_from_kc || !v.budget_to_kc || v.budget_from_kc <= v.budget_to_kc, {
  message: 'Rozpočet „od“ nemůže být vyšší než „do“.', path: ['budget_to_kc'],
})

export type CreateRequestValues = z.infer<typeof createSchema>

// Přesná adresa jen vybraná ze seznamu (souřadnice) a s číslem domu – jinak se neuloží
function requestAddress(d: CreateRequestValues) {
  const text = d.place_pref === 'u_poskytovatele' ? null : (d.address?.trim() || null)
  const ok = !!text && /\d/.test(text) && d.address_lat != null && d.address_lng != null
  return { address: ok ? text : null, address_lat: ok ? d.address_lat : null, address_lng: ok ? d.address_lng : null }
}

export async function createRequest(values: CreateRequestValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const parsed = createSchema.safeParse(values)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Formulář obsahuje chyby.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const d = parsed.data

  // Kontakt: přihlášeného dohledáme přes customer_id, nepřihlášený musí nechat e-mail
  // (odpovídá CHECK requests_kontakt: customer_id IS NOT NULL OR email IS NOT NULL).
  const email = d.email?.trim() || null
  if (!user && !email) {
    return { success: false, error: 'Zadejte e-mail, ať se vám vybraný poskytovatel ozve.' }
  }

  const admin = getAdminClient()

  // Obec musí mít polohu – podle ní se poptávka ukazuje poskytovatelům v okolí a počítá vzdálenost.
  let cityLat = d.city_lat ?? null
  let cityLng = d.city_lng ?? null
  if (cityLat == null || cityLng == null) {
    const { data: obec } = await admin
      .from('obce').select('latitude, longitude').ilike('obec', d.city.trim()).limit(1).maybeSingle() as { data: { latitude: number; longitude: number } | null }
    if (obec) {
      cityLat = obec.latitude
      cityLng = obec.longitude
    } else if (d.address_lat != null && d.address_lng != null) {
      // Obec z adresy není v seznamu obcí (např. „Praha 4“) → poloha z adresy, zaokrouhlená na ~1 km
      cityLat = Math.round(d.address_lat * 100) / 100
      cityLng = Math.round(d.address_lng * 100) / 100
    } else {
      return { success: false, error: 'Vyberte prosím adresu nebo obec ze seznamu.' }
    }
  }

  const insertData = {
    customer_id: user?.id ?? null,
    email,
    phone: d.phone?.trim() || null,
    category: d.category?.trim() || null,
    subcategory_id: d.subcategory_id ?? null,
    description: d.description.trim(),
    photos: d.photos ?? [],
    inspiration_photos: d.inspiration_photos ?? [],
    city: d.city.trim(),
    city_lat: cityLat,
    city_lng: cityLng,
    preferred_date: d.preferred_date?.trim() || null,
    needed_at: d.needed_at || null,
    budget_from_kc: d.budget_from_kc ?? null,
    budget_to_kc: d.budget_to_kc ?? null,
    ...requestAddress(d),
    place_pref: d.place_pref ?? null,
    // status ('open') i expires_at (now + 14 dní) řeší default v DB
  }

  const { data, error } = await (admin.from('requests') as any)
    .insert(insertData)
    .select('id')
    .single()
  if (error) {
    console.error('[createRequest]', error)
    return { success: false, error: 'Nepodařilo se odeslat poptávku.' }
  }

  revalidatePath('/poptavky')
  return { success: true, id: (data as { id: string }).id }
}

// ── „Mám zájem" (poskytovatel reaguje na poptávku) ───────────
// Založí request_response a k němu conversation, aby od téhle chvíle mohli
// zákazník a poskytovatel chatovat. Objednávka ještě NEVZNIKÁ.
// serviceId = nabídka (karta), kterou poskytovatel na poptávku nabízí — je potřeba
// později u výběru, protože z ní vznikne objednávka.
export async function expressInterest(
  requestId: string,
  serviceId?: string | null,
  /** Typ a částka placená přes Propojo – povinné u nové odpovědi, u existující ji upraví */
  offer?: ResponseOffer | null,
  /** Bez karty: obec, odkud poskytovatel vyjíždí (jinak se vezme z profilu) */
  baseCity?: string | null,
): Promise<InterestResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  // Poskytovatel? (jen poskytovatel může reagovat)
  const { data: profile } = await admin
    .from('profiles')
    .select('is_provider, city')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean; city: string | null } | null }
  if (!profile?.is_provider) {
    return { success: false, error: 'Reagovat na poptávky mohou jen poskytovatelé.' }
  }
  // Bez karty (obecná nabídka) musí být známo, odkud poskytovatel vyjíždí – kvůli vzdálenosti
  // a automatickému potvrzení (10. 10. 2026). Obec z profilu se musí najít v seznamu obcí.
  if (!serviceId && offer) {
    const obec = String(baseCity?.trim() || profile.city || '').split(',')[0].replace(/\s+\d+[a-zA-Z/\d]*$/, '').trim()
    const { data: found } = obec
      ? await admin.from('obce').select('obec').ilike('obec', obec).limit(1).maybeSingle() as { data: { obec: string } | null }
      : { data: null }
    if (!found) {
      return { success: false, error: 'Vyberte ze seznamu obec, ze které vyjíždíte.' }
    }
    // Nová obec z formuláře → do profilu (odtud se počítá vzdálenost)
    if (baseCity?.trim() && found.obec !== profile.city) {
      await (admin.from('profiles') as any).update({ city: found.obec }).eq('id', user.id)
    }
  }

  // Poptávka musí existovat, být otevřená, nevypršelá a ne vlastní.
  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, status, expires_at')
    .eq('id', requestId)
    .single() as { data: { id: string; customer_id: string | null; status: string; expires_at: string } | null }
  if (!req) return { success: false, error: 'Poptávka nebyla nalezena.' }
  if (req.customer_id === user.id) {
    return { success: false, error: 'Na vlastní poptávku reagovat nelze.' }
  }
  if (req.status !== 'open') {
    return { success: false, error: 'Tahle poptávka už není otevřená.' }
  }
  if (new Date(req.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'Platnost téhle poptávky vypršela.' }
  }

  // Už jednou reagoval? (drží i UNIQUE(request_id, provider_id)) Nezakládat druhou.
  const { data: existing } = await admin
    .from('request_responses')
    .select('id, status')
    .eq('request_id', requestId)
    .eq('provider_id', user.id)
    .maybeSingle() as { data: { id: string; status: string } | null }
  const offerCheck = checkOffer(offer)
  const placeCheck = placeOf(offer)
  if (!placeCheck.ok) return { success: false, error: placeCheck.error }
  const placeCols = placeCheck.cols
  if (existing) {
    // Úprava nabídky u živé odpovědi (před výběrem zákazníkem).
    if (offer && (ACTIVE_STATUSES as readonly string[]).includes(existing.status)) {
      if (!offerCheck.ok) return { success: false, error: offerCheck.error }
      await (admin.from('request_responses') as any)
        .update({ offer_kind: offerCheck.kind, charge_halere: offerCheck.halere, quote_fee_deductible: offerCheck.deductible, service_id: serviceId ?? null, ...placeCols, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
    // Aktivní = beze změny (idempotentní). Dřív odmítnutý zájem znovu otevřeme.
    if (existing.status === 'rejected') {
      if (!offerCheck.ok) return { success: false, error: offerCheck.error }
      const strop = await countActive(admin, requestId)
      if (strop >= MAX_ACTIVE_RESPONSES) {
        return { success: false, error: 'Tahle poptávka už má plno zájemců.' }
      }
      await (admin.from('request_responses') as any)
        .update({ status: 'interested', service_id: serviceId ?? null, offer_kind: offerCheck.kind, charge_halere: offerCheck.halere, quote_fee_deductible: offerCheck.deductible, ...placeCols, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
    const convId = await conversationIdOf(admin, existing.id)
    return { success: true, id: existing.id, conversationId: convId }
  }

  if (!offerCheck.ok) return { success: false, error: offerCheck.error }

  // Strop aktivních jednání na tuhle poptávku.
  const aktivnich = await countActive(admin, requestId)
  if (aktivnich >= MAX_ACTIVE_RESPONSES) {
    return { success: false, error: 'Tahle poptávka už má plno zájemců.' }
  }

  // Založ reakci.
  const { data: resp, error: respErr } = await (admin.from('request_responses') as any)
    .insert({
      request_id: requestId,
      provider_id: user.id,
      service_id: serviceId ?? null,
      status: 'interested',
      offer_kind: offerCheck.kind,
      charge_halere: offerCheck.halere,
      quote_fee_deductible: offerCheck.deductible,
      ...placeCols,
    })
    .select('id')
    .single()
  if (respErr || !resp) {
    console.error('[expressInterest] response', respErr)
    return { success: false, error: 'Nepodařilo se odeslat zájem.' }
  }
  const responseId = (resp as { id: string }).id

  // A k ní konverzaci, přes kterou od teď běží chat (order_id zatím null).
  const { data: conv, error: convErr } = await (admin.from('conversations') as any)
    .insert({ request_response_id: responseId, status: 'open' })
    .select('id')
    .single()
  if (convErr || !conv) {
    // Konverzaci nechceme nechat viset bez chatu — reakci vrátíme zpět.
    console.error('[expressInterest] conversation', convErr)
    await (admin.from('request_responses') as any).delete().eq('id', responseId)
    return { success: false, error: 'Nepodařilo se otevřít konverzaci.' }
  }

  // Zákazník ať ví, že má nového zájemce (míří na přehled zájemců).
  try {
    if (req.customer_id) {
      const { data: kdo } = await admin
        .from('profiles').select('full_name').eq('id', user.id).maybeSingle() as { data: { full_name: string | null } | null }
      await createNotification({
        userId: req.customer_id,
        type: 'status_change',
        actorId: user.id,
        title: 'Nový zájemce o vaši poptávku',
        preview: kdo?.full_name ?? null,
        url: `/dashboard/poptavky/${requestId}`,
      })
    }
  } catch (e) {
    console.error('[expressInterest] notifikace', e)
  }

  revalidatePath('/poptavky')
  revalidatePath('/dashboard/objednavky')
  return { success: true, id: responseId, conversationId: (conv as { id: string }).id }
}

// ── Zrušení zájmu (poskytovatel couvne) ──────────────────────
// Uvolní místo pod stropem a zavře konverzaci. Vybranou reakci zrušit nelze.
export async function withdrawInterest(responseId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: resp } = await admin
    .from('request_responses')
    .select('id, provider_id, status')
    .eq('id', responseId)
    .single() as { data: { id: string; provider_id: string; status: string } | null }
  if (!resp) return { success: false, error: 'Reakce nebyla nalezena.' }
  if (resp.provider_id !== user.id) {
    return { success: false, error: 'Tato reakce vám nepatří.' }
  }
  if (resp.status === 'selected') {
    return { success: false, error: 'Vybranou zakázku takhle zrušit nelze.' }
  }

  await (admin.from('request_responses') as any)
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', responseId)
  await (admin.from('conversations') as any)
    .update({ status: 'closed' })
    .eq('request_response_id', responseId)

  revalidatePath('/poptavky')
  revalidatePath('/dashboard/objednavky')
  return { success: true, id: responseId }
}

// ── Výběr poskytovatele ──────────────────────────────────────
// 10. 10. 2026: vybrat poskytovatele bez termínu už nejde. Zákazník vybírá v chatu jednání
// „Vybrat a rezervovat“ u navrženého termínu (selectProviderWithTerm v conversation-chat.ts)
// a poptávka se ostatním uzavře až zaplacením (lib/booking/request-selection.ts).

// ID konverzace patřící k reakci.
async function conversationIdOf(admin: any, responseId: string): Promise<string | null> {
  const { data } = await admin
    .from('conversations')
    .select('id')
    .eq('request_response_id', responseId)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// Počet aktivních (interested/negotiating) reakcí na poptávku.
async function countActive(admin: any, requestId: string): Promise<number> {
  const { count } = await admin
    .from('request_responses')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', requestId)
    .in('status', ACTIVE_STATUSES as unknown as string[])
  return count ?? 0
}

// ── Obnovení poptávky (část B, 9. 10. 2026) ──────────────────
// Zákazník může znovu otevřít poptávku, která vypršela, je uzavřená, nebo z ní vybraná
// objednávka padla před zaplacením. Údaje jde změnit; poptávka se otevře na 14 dní a zájemci,
// kteří dřív „nebyli vybráni“, se vrátí do hry (ten, se kterým to nevyšlo, ne).

const RENEW_DAYS = 14

export type RenewableRequest = {
  id: string
  category: string | null
  description: string
  city: string
  cityLat: number | null
  cityLng: number | null
  preferredDate: string | null
  budgetFrom: number | null
  budgetTo: number | null
  address: { text: string; lat: number | null; lng: number | null } | null
  placePref: 'u_zakaznika' | 'u_poskytovatele' | 'jedno' | null
  phone: string | null
  photos: string[]
  inspirationPhotos: string[]
}

/** Lze poptávku obnovit? (vypršela / uzavřená / objednávka padla před zaplacením) */
async function renewCheck(admin: ReturnType<typeof getAdminClient>, req: any): Promise<{ ok: true } | { ok: false; error: string }> {
  const expired = req.expires_at && new Date(req.expires_at).getTime() < Date.now()
  if (req.status === 'open' && !expired) return { ok: false, error: 'Poptávka je pořád aktivní.' }
  if (req.status === 'selected' && req.selected_response_id) {
    const { data: conv } = await admin
      .from('conversations').select('order_id').eq('request_response_id', req.selected_response_id).maybeSingle() as { data: { order_id: string | null } | null }
    if (conv?.order_id) {
      const { data: ord } = await admin
        .from('orders').select('status, booking_state').eq('id', conv.order_id).maybeSingle() as { data: { status: string; booking_state: string | null } | null }
      const failed = ord && ord.status === 'zruseno' && ord.booking_state !== 'confirmed'
      if (!failed) return { ok: false, error: 'Z poptávky už je objednávka. Obnovit jde jen tehdy, když objednávka padla před zaplacením.' }
    }
  }
  return { ok: true }
}

export async function getRequestForRenew(requestId: string): Promise<RenewableRequest | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = getAdminClient()
  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, status, expires_at, selected_response_id, category, description, city, city_lat, city_lng, preferred_date, phone, photos, budget_from_kc, budget_to_kc, address, address_lat, address_lng, place_pref, inspiration_photos')
    .eq('id', requestId)
    .maybeSingle() as { data: any }
  if (!req || req.customer_id !== user.id) return null
  if (!(await renewCheck(admin, req)).ok) return null
  return {
    id: req.id,
    category: req.category,
    description: req.description,
    city: req.city,
    cityLat: req.city_lat ?? null,
    cityLng: req.city_lng ?? null,
    preferredDate: req.preferred_date ?? null,
    budgetFrom: req.budget_from_kc ?? null,
    budgetTo: req.budget_to_kc ?? null,
    address: req.address ? { text: req.address, lat: req.address_lat, lng: req.address_lng } : null,
    placePref: req.place_pref ?? null,
    phone: req.phone ?? null,
    photos: req.photos ?? [],
    inspirationPhotos: req.inspiration_photos ?? [],
  }
}

export async function renewRequest(requestId: string, values: CreateRequestValues): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const parsed = createSchema.safeParse(values)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Formulář obsahuje chyby.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const d = parsed.data
  const admin = getAdminClient()

  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, status, expires_at, selected_response_id, category')
    .eq('id', requestId)
    .maybeSingle() as { data: any }
  if (!req || req.customer_id !== user.id) return { success: false, error: 'Poptávka nebyla nalezena.' }
  const check = await renewCheck(admin, req)
  if (!check.ok) return { success: false, error: check.error }

  let cityLat = d.city_lat ?? null
  let cityLng = d.city_lng ?? null
  if (cityLat == null || cityLng == null) {
    const { data: obec } = await admin
      .from('obce').select('latitude, longitude').ilike('obec', d.city.trim()).limit(1).maybeSingle() as { data: { latitude: number; longitude: number } | null }
    if (obec) {
      cityLat = obec.latitude
      cityLng = obec.longitude
    } else if (d.address_lat != null && d.address_lng != null) {
      // Obec z adresy není v seznamu obcí (např. „Praha 4“) → poloha z adresy, zaokrouhlená na ~1 km
      cityLat = Math.round(d.address_lat * 100) / 100
      cityLng = Math.round(d.address_lng * 100) / 100
    } else {
      return { success: false, error: 'Vyberte prosím adresu nebo obec ze seznamu.' }
    }
  }

  const now = new Date()
  const { error } = await (admin.from('requests') as any)
    .update({
      category: d.category?.trim() || null,
      subcategory_id: d.subcategory_id ?? null,
      description: d.description.trim(),
      photos: d.photos ?? [],
      inspiration_photos: d.inspiration_photos ?? [],
      city: d.city.trim(),
      city_lat: cityLat,
      city_lng: cityLng,
      preferred_date: d.preferred_date?.trim() || null,
      needed_at: d.needed_at || null,
      budget_from_kc: d.budget_from_kc ?? null,
      budget_to_kc: d.budget_to_kc ?? null,
      ...requestAddress(d),
      place_pref: d.place_pref ?? null,
      phone: d.phone?.trim() || null,
      status: 'open',
      selected_response_id: null,
      expires_at: new Date(now.getTime() + RENEW_DAYS * 24 * 3600_000).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', requestId)
  if (error) {
    console.error('[renewRequest]', error)
    return { success: false, error: 'Poptávku se nepodařilo obnovit.' }
  }

  // Dřív nevybraní zájemci zpět do hry + oznámení; ten, se kterým to nevyšlo, zůstává mimo.
  const { data: back } = await (admin.from('request_responses') as any)
    .update({ status: 'interested', updated_at: now.toISOString() })
    .eq('request_id', requestId)
    .eq('status', 'not_selected')
    .select('id, provider_id') as { data: Array<{ id: string; provider_id: string }> | null }
  if (req.selected_response_id) {
    await (admin.from('request_responses') as any)
      .update({ status: 'not_selected', updated_at: now.toISOString() })
      .eq('id', req.selected_response_id)
  }
  for (const r of back ?? []) {
    try {
      await createNotification({
        userId: r.provider_id,
        type: 'status_change',
        actorId: user.id,
        title: 'Poptávka je znovu aktivní',
        preview: `${d.category?.trim() || 'Poptávka'} · ${d.city.trim()} – zákazník ji obnovil, můžete se znovu ozvat.`,
        url: `/poptavky/${requestId}`,
      })
    } catch (e) {
      console.error('[renewRequest] notifikace', e)
    }
  }

  revalidatePath('/poptavky')
  revalidatePath('/dashboard/poptavky')
  return { success: true, id: requestId }
}

// ── Detail poptávky pro okno na nástěnce (12. 10. 2026) ───────
// Stejná data jako stránka /poptavky/[id] (loadRequestDetail) – okno i stránka ukazují totéž.
export async function getRequestDetail(requestId: string): Promise<RequestDetailData | null> {
  return loadRequestDetail(requestId)
}

