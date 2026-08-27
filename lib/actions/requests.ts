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
})

export type CreateRequestValues = z.infer<typeof createSchema>

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
  const insertData = {
    customer_id: user?.id ?? null,
    email,
    phone: d.phone?.trim() || null,
    category: d.category?.trim() || null,
    subcategory_id: d.subcategory_id ?? null,
    description: d.description.trim(),
    photos: d.photos ?? [],
    city: d.city.trim(),
    city_lat: d.city_lat ?? null,
    city_lng: d.city_lng ?? null,
    preferred_date: d.preferred_date?.trim() || null,
    needed_at: d.needed_at || null,
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
): Promise<InterestResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()

  // Poskytovatel? (jen poskytovatel může reagovat)
  const { data: profile } = await admin
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean } | null }
  if (!profile?.is_provider) {
    return { success: false, error: 'Reagovat na poptávky mohou jen poskytovatelé.' }
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
  if (existing) {
    // Aktivní = beze změny (idempotentní). Dřív odmítnutý zájem znovu otevřeme.
    if (existing.status === 'rejected') {
      const strop = await countActive(admin, requestId)
      if (strop >= MAX_ACTIVE_RESPONSES) {
        return { success: false, error: 'Tahle poptávka už má plno zájemců.' }
      }
      await (admin.from('request_responses') as any)
        .update({ status: 'interested', service_id: serviceId ?? null, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
    const convId = await conversationIdOf(admin, existing.id)
    return { success: true, id: existing.id, conversationId: convId }
  }

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

// ── Výběr poskytovatele → vznik objednávky ───────────────────
// Zákazník zvolí jednu reakci. Vznikne skutečná objednávka (stejný tvar jako
// zacniDotaz — status 'cekajici', bez termínu a platby), na její konverzaci se
// doplní order_id a stejně tak na její dosavadní zprávy, takže celá domluva se
// objeví ve stávajícím order chatu. Ostatní reakce → 'not_selected', jejich
// konverzace se zavřou. Od téhle chvíle běží existující order flow.
export async function selectProvider(requestId: string, responseId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const now = new Date().toISOString()

  // Poptávka + vlastnictví. Anonymní poptávku (bez customer_id) zatím vybrat nelze
  // — chyběl by přihlášený zákazník i cíl objednávky; řešilo by se odkazem s tokenem.
  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, status, description, city')
    .eq('id', requestId)
    .single() as { data: { id: string; customer_id: string | null; status: string; description: string; city: string } | null }
  if (!req) return { success: false, error: 'Poptávka nebyla nalezena.' }
  if (!req.customer_id) {
    return { success: false, error: 'Výběr poskytovatele u anonymní poptávky zatím není možný.' }
  }
  if (req.customer_id !== user.id) {
    return { success: false, error: 'Tahle poptávka není vaše.' }
  }
  if (req.status !== 'open') {
    return { success: false, error: 'U téhle poptávky už je rozhodnuto.' }
  }

  // Vybraná reakce musí patřit k poptávce, být ve hře a mít u sebe nabídku,
  // ze které vznikne objednávka.
  const { data: resp } = await admin
    .from('request_responses')
    .select('id, request_id, provider_id, service_id, status')
    .eq('id', responseId)
    .single() as { data: { id: string; request_id: string; provider_id: string; service_id: string | null; status: string } | null }
  if (!resp || resp.request_id !== requestId) {
    return { success: false, error: 'Reakce k této poptávce nepatří.' }
  }
  if (resp.status === 'rejected') {
    return { success: false, error: 'Tento poskytovatel už není ve hře.' }
  }
  if (!resp.service_id) {
    return { success: false, error: 'Poskytovatel u reakce nemá vybranou konkrétní nabídku.' }
  }

  // 1) Objednávka (stejný minimální tvar jako zacniDotaz, ale není to dotaz).
  const { data: order, error: ordErr } = await (admin.from('orders') as any)
    .insert({
      service_id: resp.service_id,
      provider_id: resp.provider_id,
      customer_id: req.customer_id,
      status: 'cekajici',
      is_inquiry: false,
      location_city: req.city ?? null,
      description: req.description ?? null,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: any }
  if (ordErr || !order) {
    console.error('[selectProvider] order', ordErr)
    return { success: false, error: 'Nepodařilo se vytvořit objednávku.' }
  }
  const orderId = order.id

  // 2) Konverzaci vybrané reakce napojíme na objednávku a doplníme order_id i na
  //    její dosavadní zprávy — tím je celá domluva vidět ve stávajícím order chatu.
  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('request_response_id', responseId)
    .maybeSingle() as { data: { id: string } | null }
  if (conv) {
    await (admin.from('conversations') as any).update({ order_id: orderId }).eq('id', conv.id)
    await (admin.from('messages') as any)
      .update({ order_id: orderId })
      .eq('conversation_id', conv.id)
      .is('order_id', null)
    // Systémový předěl v historii — jasně odděluje „ještě vybírám" od „objednáno".
    // Má i order_id, takže se ukáže i v timeline objednávky.
    await (admin.from('messages') as any).insert({
      conversation_id: conv.id,
      order_id: orderId,
      sender_id: user.id,
      type: 'order_created',
      content: 'Poskytovatel byl vybrán — vznikla objednávka. Nyní můžete potvrdit termín a pokračovat k realizaci.',
    })
  }

  // 3) Stav poptávky a reakcí.
  await (admin.from('requests') as any)
    .update({ status: 'selected', selected_response_id: responseId, updated_at: now })
    .eq('id', requestId)
  await (admin.from('request_responses') as any)
    .update({ status: 'selected', updated_at: now })
    .eq('id', responseId)
  // Ostatní, které byly ve hře, → not_selected (rejected necháváme být).
  await (admin.from('request_responses') as any)
    .update({ status: 'not_selected', updated_at: now })
    .eq('request_id', requestId)
    .neq('id', responseId)
    .in('status', ACTIVE_STATUSES as unknown as string[])

  // Konverzace nevybraných NECHÁVÁME OTEVŘENÉ — není důvod je zamykat; zákazník
  // i poskytovatel do nich mohou dál nahlédnout. Vybraný pokračuje v objednávce.

  // 5) Poskytovateli dát vědět (objednávka teď existuje, notifikace přes orderId).
  try {
    await createNotification({
      userId: resp.provider_id,
      type: 'status_change',
      orderId,
      actorId: user.id,
      title: 'Zákazník vás vybral',
      preview: req.description?.slice(0, 80) ?? null,
    })
  } catch (e) {
    console.error('[selectProvider] notifikace', e)
  }

  revalidatePath('/poptavky')
  revalidatePath('/dashboard/objednavky')
  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true, id: orderId }
}

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