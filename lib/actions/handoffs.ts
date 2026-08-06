'use server'
// lib/actions/handoffs.ts
// Přihrávání poptávek — když poskytovatel nestíhá, přihraje poptávku
// kolegovi místo aby ji odmítl. Zakázka tím ZŮSTANE v Propoju.
//
// Tok:
//   A dostane poptávku → nestíhá → přihraje B (vznikne handoff 'nabidnuto')
//   → B přijme → objednávka se převede na B (provider_id + service_id)
//   → nebo B odmítne → A ji řeší dál (odmítne/přihraje jinam)
//
// Bez odměn — jen se zaznamenává, kdo komu přihrál (pojistka + základ
// budoucí pobídky).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Result = { success: true } | { success: false; error: string }

// ── Přihrát poptávku kolegovi ───────────────────────────────────
export async function handoffOrder(
  orderId: string,
  toProviderId: string,
  toServiceId: string | null,
  note?: string
): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders').select('id, provider_id, status')
    .eq('id', orderId).maybeSingle() as { data: { id: string; provider_id: string; status: string } | null }
  if (!order) return { success: false, error: 'Objednávka neexistuje.' }
  if (order.provider_id !== user.id) return { success: false, error: 'Tuhle poptávku nemůžete přihrát — není vaše.' }
  if (toProviderId === user.id) return { success: false, error: 'Nemůžete přihrát sám sobě.' }

  // Přihrávat jde jen dokud poptávka není potvrzená/zaplacená.
  if (['potvrzeno', 'zaplaceno', 'dokonceno', 'zruseno'].includes(order.status)) {
    return { success: false, error: 'Tuhle poptávku už nejde přihrát — je vyřízená.' }
  }

  // Ještě neběží jiné aktivní přihrání téhle objednávky?
  const { data: aktivni } = await admin
    .from('order_handoffs').select('id')
    .eq('order_id', orderId).eq('status', 'nabidnuto').maybeSingle()
  if (aktivni) return { success: false, error: 'Tahle poptávka už čeká u jiného kolegy.' }

  const { error } = await (admin.from('order_handoffs') as any).insert({
    order_id: orderId,
    from_provider: user.id,
    to_provider: toProviderId,
    to_service_id: toServiceId,
    status: 'nabidnuto',
    note: note?.trim() || null,
  })
  if (error) {
    console.error('[handoffOrder]', error)
    return { success: false, error: 'Nepodařilo se přihrát poptávku.' }
  }

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/poptavky')
  return { success: true }
}

// ── Kolega přijme přihrávku → objednávka se převede na něj ──────
export async function acceptHandoff(handoffId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: h } = await admin
    .from('order_handoffs')
    .select('id, order_id, to_provider, to_service_id, status')
    .eq('id', handoffId).maybeSingle() as { data: any }
  if (!h) return { success: false, error: 'Přihrávka neexistuje.' }
  if (h.to_provider !== user.id) return { success: false, error: 'Tahle přihrávka není pro vás.' }
  if (h.status !== 'nabidnuto') return { success: false, error: 'Přihrávka už byla vyřízena.' }

  // Převedeme objednávku na nového poskytovatele.
  const patch: Record<string, unknown> = { provider_id: user.id }
  if (h.to_service_id) patch.service_id = h.to_service_id
  const { error: upErr } = await (admin.from('orders') as any).update(patch).eq('id', h.order_id)
  if (upErr) {
    console.error('[acceptHandoff] orders', upErr)
    return { success: false, error: 'Nepodařilo se převzít objednávku.' }
  }

  await (admin.from('order_handoffs') as any)
    .update({ status: 'prijato', decided_at: new Date().toISOString() })
    .eq('id', handoffId)

  revalidatePath('/dashboard/objednavky')
  revalidatePath('/poptavky')
  return { success: true }
}

// ── Kolega odmítne → vrací se původnímu poskytovateli ──────────
export async function declineHandoff(handoffId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: h } = await admin
    .from('order_handoffs').select('id, to_provider, status')
    .eq('id', handoffId).maybeSingle() as { data: { id: string; to_provider: string; status: string } | null }
  if (!h) return { success: false, error: 'Přihrávka neexistuje.' }
  if (h.to_provider !== user.id) return { success: false, error: 'Tahle přihrávka není pro vás.' }
  if (h.status !== 'nabidnuto') return { success: false, error: 'Přihrávka už byla vyřízena.' }

  const { error } = await (admin.from('order_handoffs') as any)
    .update({ status: 'odmitnuto', decided_at: new Date().toISOString() })
    .eq('id', handoffId)
  if (error) {
    console.error('[declineHandoff]', error)
    return { success: false, error: 'Nepodařilo se odmítnout.' }
  }
  revalidatePath('/dashboard/objednavky')
  revalidatePath('/poptavky')
  return { success: true }
}

// ═══════════════════════════════════════════════════════════════
// ČTECÍ FUNKCE
// ═══════════════════════════════════════════════════════════════

export type IncomingHandoff = {
  handoff_id: string
  order_id: string
  from_name: string | null
  note: string | null
  order_description: string | null
  created_at: string
}

// Přihrávky, které čekají na MĚ (jsem to_provider, status nabidnuto).
export async function getIncomingHandoffs(): Promise<IncomingHandoff[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getAdminClient()
  const { data: hs } = await admin
    .from('order_handoffs')
    .select('id, order_id, from_provider, note, created_at')
    .eq('to_provider', user.id).eq('status', 'nabidnuto')
    .order('created_at', { ascending: false }) as { data: any[] | null }
  if (!hs?.length) return []

  const fromIds = [...new Set(hs.map(h => h.from_provider))]
  const orderIds = hs.map(h => h.order_id)

  const profiles: Record<string, any> = {}
  const { data: profs } = await admin
    .from('profiles').select('id, full_name, company_name').in('id', fromIds) as { data: any[] | null }
  for (const p of profs ?? []) profiles[p.id] = p

  const orders: Record<string, any> = {}
  const { data: ords } = await admin
    .from('orders').select('id, description').in('id', orderIds) as { data: any[] | null }
  for (const o of ords ?? []) orders[o.id] = o

  return hs.map(h => ({
    handoff_id: h.id,
    order_id: h.order_id,
    from_name: profiles[h.from_provider]?.company_name || profiles[h.from_provider]?.full_name || null,
    note: h.note,
    order_description: orders[h.order_id]?.description ?? null,
    created_at: h.created_at,
  }))
}

// Kolik jsem komu přihrál (pro statistiku, zatím jen počet).
export async function getMyHandoffStats(): Promise<{ given: number; received: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { given: 0, received: 0 }

  const admin = getAdminClient()
  const { count: given } = await admin
    .from('order_handoffs').select('id', { count: 'exact', head: true })
    .eq('from_provider', user.id).eq('status', 'prijato')
  const { count: received } = await admin
    .from('order_handoffs').select('id', { count: 'exact', head: true })
    .eq('to_provider', user.id).eq('status', 'prijato')

  return { given: given ?? 0, received: received ?? 0 }
}

// ── Najít kolegy k přihrání ─────────────────────────────────────
// Přednostně stejná kategorie + okolí, ale lze přihrát KOMUKOLI.
// Vrací poskytovatele s jejich aktivní kartou, na kterou se přihraje.
export async function findColleagues(
  orderId: string,
  query?: string
): Promise<Array<{ provider_id: string; provider_name: string; service_id: string; service_title: string; category: string; same_category: boolean }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getAdminClient()

  // Kategorie původní objednávky (pro přednostní řazení).
  const { data: order } = await admin
    .from('orders').select('service_id').eq('id', orderId).maybeSingle() as { data: { service_id: string | null } | null }
  let origCategory: string | null = null
  if (order?.service_id) {
    const { data: svc } = await admin
      .from('services').select('category').eq('id', order.service_id).maybeSingle() as { data: { category: string } | null }
    origCategory = svc?.category ?? null
  }

  // Aktivní karty jiných poskytovatelů.
  let q = admin
    .from('services').select('id, title, category, provider_id, is_active')
    .eq('is_active', true).neq('provider_id', user.id).limit(40)
  if (query && query.trim().length >= 2) q = q.ilike('title', `%${query.trim()}%`)
  const { data: svcs } = await q as { data: any[] | null }
  if (!svcs?.length) return []

  const provIds = [...new Set(svcs.map(s => s.provider_id))]
  const profiles: Record<string, any> = {}
  const { data: profs } = await admin
    .from('profiles').select('id, full_name, company_name').in('id', provIds) as { data: any[] | null }
  for (const p of profs ?? []) profiles[p.id] = p

  const list = svcs.map(s => ({
    provider_id: s.provider_id,
    provider_name: profiles[s.provider_id]?.company_name || profiles[s.provider_id]?.full_name || 'Poskytovatel',
    service_id: s.id,
    service_title: s.title,
    category: s.category,
    same_category: origCategory != null && s.category === origCategory,
  }))

  // Stejná kategorie první.
  list.sort((a, b) => (a.same_category === b.same_category ? 0 : a.same_category ? -1 : 1))
  return list.slice(0, 12)
}

// ═══════════════════════════════════════════════════════════════
// SDÍLENÍ PŘIHRÁVKY ODKAZEM (WhatsApp/IG) — pro nečleny Propoja
// ═══════════════════════════════════════════════════════════════

// Vytvoří přihrávku „do světa" (bez konkrétního příjemce) a vrátí odkaz.
// Poskytovatel ho pošle kolegovi přes WhatsApp/Messenger. Kdo klikne,
// uvidí jen nálakový náhled; celé zadání až po registraci a převzetí.
export async function createShareHandoff(
  orderId: string,
  channel: 'whatsapp' | 'messenger' | 'odkaz'
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: order } = await admin
    .from('orders').select('id, provider_id, status')
    .eq('id', orderId).maybeSingle() as { data: { id: string; provider_id: string; status: string } | null }
  if (!order) return { success: false, error: 'Poptávka neexistuje.' }
  if (order.provider_id !== user.id) return { success: false, error: 'Tuhle poptávku nemůžete sdílet — není vaše.' }
  if (['potvrzeno', 'zaplaceno', 'dokonceno', 'zruseno'].includes(order.status)) {
    return { success: false, error: 'Tahle poptávka už je vyřízená.' }
  }

  // Existuje už sdílecí odkaz pro tuhle poptávku? Pak ho použijeme.
  const { data: existing } = await admin
    .from('order_handoffs')
    .select('share_token')
    .eq('order_id', orderId).eq('from_provider', user.id)
    .is('to_provider', null).eq('status', 'nabidnuto')
    .maybeSingle() as { data: { share_token: string } | null }

  let token = existing?.share_token
  if (!token) {
    const { data, error } = await (admin.from('order_handoffs') as any)
      .insert({
        order_id: orderId,
        from_provider: user.id,
        to_provider: null,
        status: 'nabidnuto',
        shared_channel: channel,
      })
      .select('share_token')
      .single()
    if (error) {
      console.error('[createShareHandoff]', error)
      return { success: false, error: 'Nepodařilo se vytvořit odkaz.' }
    }
    token = (data as { share_token: string }).share_token
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://propojo.cz'
  return { success: true, url: `${base}/prihravka/${token}` }
}

export type HandoffPublic = {
  status: string
  kategorie: string | null
  mesto: string | null
  sluzba_nazev: string | null
  cena: number | null
  prihrava: string | null
}

// Veřejný náhled přihrávky — vidí ho kdokoli s odkazem, i nepřihlášený.
// Vrací JEN nálakové údaje (obor, město, cena, kdo přihrává).
export async function getHandoffPublic(token: string): Promise<HandoffPublic | null> {
  const admin = getAdminClient()
  const { data } = await admin
    .from('handoff_public').select('*').eq('share_token', token).maybeSingle() as { data: any }
  if (!data) return null
  return {
    status: data.status,
    kategorie: data.kategorie ?? null,
    mesto: data.mesto ?? null,
    sluzba_nazev: data.sluzba_nazev ?? null,
    cena: data.cena ?? null,
    prihrava: data.prihrava_firma || data.prihrava_jmeno || null,
  }
}

// Nečlen se zaregistroval a chce přihrávku převzít. Ověří token,
// převede objednávku na něj a označí, že ji vzal.
export async function claimSharedHandoff(token: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejdřív se zaregistrujte nebo přihlaste.' }

  const admin = getAdminClient()
  const { data: h } = await admin
    .from('order_handoffs')
    .select('id, order_id, from_provider, status')
    .eq('share_token', token).maybeSingle() as { data: { id: string; order_id: string; from_provider: string; status: string } | null }
  if (!h) return { success: false, error: 'Odkaz je neplatný nebo vypršel.' }
  if (h.status !== 'nabidnuto') return { success: false, error: 'Tahle zakázka už byla převzata.' }
  if (h.from_provider === user.id) return { success: false, error: 'Tuhle poptávku jste přihrával vy sám.' }

  // Převod objednávky na nového poskytovatele.
  const { error: upErr } = await (admin.from('orders') as any)
    .update({ provider_id: user.id }).eq('id', h.order_id)
  if (upErr) {
    console.error('[claimSharedHandoff] orders', upErr)
    return { success: false, error: 'Nepodařilo se převzít zakázku.' }
  }

  await (admin.from('order_handoffs') as any)
    .update({ status: 'prijato', to_provider: user.id, claimed_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', h.id)

  revalidatePath('/dashboard/objednavky')
  return { success: true }
}