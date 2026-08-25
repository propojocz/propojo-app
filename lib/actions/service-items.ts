'use server'
// lib/actions/service-items.ts
// Server actions pro ceník úkonů (tabulka service_items).
//
// Vlastnictví se ověřuje V KÓDU: každá akce nejdřív dohledá kartu (services)
// dané položky a zkontroluje, že její provider_id == přihlášený uživatel.
// RLS z kroku 1 je druhá pojistka, ne jediná.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ServiceItemFormValues } from './types'

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  service_id: z.string().uuid(),
  service_type_id: z.string().uuid().nullable().optional(),
  subcategory_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2, 'Zadejte název úkonu.').max(100),
  payment_model: z.enum(['A', 'B'] as const),
  price_type: z.enum(['fixed', 'range', 'on_agreement'] as const),
  price: z.number().min(0).max(999999).nullable().optional(),
  price_unit: z.enum(['ukon', 'hod', 'kus', 'den', 'projekt', 'm2', 'bm'] as const),
  price_max: z.number().min(0).max(999999).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  hourly_started_billing: z.boolean().optional(),
  deposit_amount: z.number().min(0).max(999999).nullable().optional(),
  deposit_type: z.enum(['zaloha', 'plna_platba', 'bez_platby'] as const).optional(),
  no_show_fee: z.number().min(0).max(999999).nullable().optional(),
  fee_mode: z.enum(['noshow', 'storno', 'zadny'] as const).optional(),
  price_includes_material: z.boolean().nullable().optional(),
  price_note: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  // Podmínky výjezdu — patří k ÚKONU s naceněním (model B), ne ke kartě.
  quote_fee: z.number().min(0).max(999999).nullable().optional(),
  price_per_km: z.number().min(0).max(99999).nullable().optional(),
  free_km: z.number().int().min(0).max(100000).nullable().optional(),
  quote_days: z.number().int().min(0).max(365).nullable().optional(),
})

type ItemParsed = z.infer<typeof itemSchema>

// Stropy pro peníze. Klient je hlídá kvůli srozumitelnosti, server kvůli
// bezpečnosti — obojí musí sedět s konstantami v components/ui/ServiceItemEditor.tsx.
const MIN_DEPOSIT = 200
const MAX_NO_SHOW_FEE = 1000

// Nejvyšší přípustná záloha u úkonu. Bere se NEJNIŽŠÍ deklarovaná cena:
// u rozmezí 500–1500 Kč je to 500, ne 1500. Kdyby zákazník složil 1200 Kč
// a konečná cena byla 500, museli bychom mu vracet — a záloha, která se
// „započítá do ceny", by najednou byla vyšší než cena.
// U hodinové sazby konečnou cenu předem neznáme, takže se nestropuje.
function stropZalohy(d: ItemParsed): number | null {
  if (d.payment_model === 'B') return null
  if (d.price_unit === 'hod') return null
  if (d.price_type !== 'fixed' && d.price_type !== 'range') return null
  return d.price != null && d.price > 0 ? d.price : null
}

// Kolik peněz platforma v okamžiku nedostavení/storna skutečně drží. Z ničeho
// jiného se poplatek strhnout nedá, takže tohle je jeho tvrdý strop:
//   'zaloha'      → složená záloha
//   'plna_platba' → celá cena (povolená jen u pevné ceny, takže ji známe)
//   'bez_platby'  → nic
// Volat AŽ po srovnání deposit_amount, jinak by se stropovalo podle
// neuklizené hodnoty.
function drzenaCastka(d: ItemParsed): number | null {
  if (d.payment_model === 'B') return null
  if (d.deposit_type === 'bez_platby') return 0
  if (d.deposit_type === 'plna_platba') return d.price != null && d.price > 0 ? d.price : null
  return d.deposit_amount ?? null
}

// Sjednotí hodnoty podle modelu/typu ceny — stejná logika jako normalize() u služeb,
// ať do DB nejdou nekonzistentní data (např. záloha u modelu B).
function normalizeItem(d: ItemParsed): ItemParsed {
  const out: ItemParsed = { ...d }
  out.name = out.name.trim()
  // Materiál je NEPOVINNÝ údaj. Když se poskytovatel nevyjádří, necháme
  // „neuvedeno" (null) — dřív se tiše doplnilo true, takže karta tvrdila
  // „materiál je v ceně", aniž to kdokoli řekl.
  if (out.price_includes_material === undefined) out.price_includes_material = null
  if (out.is_active == null) out.is_active = true

  if (out.payment_model === 'B') {
    out.price = null
    out.price_type = 'on_agreement'
    out.price_max = null
    out.deposit_amount = null
    out.deposit_type = 'zaloha'
    out.hourly_started_billing = false
    out.no_show_fee = null
    out.fee_mode = 'noshow'
    out.price_includes_material = null
    out.price_note = out.price_note?.trim() || null
  } else {
    // U pevné ceny výjezdové podmínky nedávají smysl — nulujeme,
    // ať v ceníku nezůstanou po přepnutí modelu.
    out.quote_fee = null
    out.price_per_km = null
    out.free_km = null
    out.quote_days = null
    if (out.price_type === 'on_agreement') {
      out.price = null
      out.price_max = null
    }
    if (out.price_type !== 'range') out.price_max = null

    // DÉLKA ÚKONU PODLE JEDNOTKY. Délka má smysl jen tam, kde se z ní dá
    // spočítat termín v kalendáři:
    //   'ukon' → zadává poskytovatel
    //   'hod'  → interně vždy hodinový blok (boolean řeší jen účtování)
    //   ostatní (kus, m2, bm, den, projekt) → délku neznáme, nulujeme
    // Bez tohohle úklidu zůstala po přepnutí jednotky viset stará hodnota
    // a zákazníkovi svítilo „45 min" u ceny za m².
    if (out.price_unit === 'hod') {
      out.duration_minutes = 60
      out.hourly_started_billing = out.hourly_started_billing === true
      if (out.deposit_type === 'plna_platba') out.deposit_type = 'zaloha'
    } else {
      out.hourly_started_billing = false
      if (out.price_unit !== 'ukon') out.duration_minutes = null
    }

    if (out.deposit_type == null) out.deposit_type = 'zaloha'
    if (out.deposit_type === 'bez_platby') {
      out.deposit_amount = null
      out.no_show_fee = null
      out.fee_mode = 'zadny'
    } else if (out.deposit_type === 'plna_platba') {
      out.deposit_amount = null   // platí se celá cena, záloha se neřeší
    } else {
      if (out.deposit_amount != null && out.deposit_amount < MIN_DEPOSIT) out.deposit_amount = MIN_DEPOSIT
      if (out.deposit_amount == null) out.deposit_amount = MIN_DEPOSIT
      // Strop až NAKONEC — u úkonu levnějšího než minimální záloha vyhrává cena
      // (jinak by záloha přesáhla to, co má zákazník celkem zaplatit).
      const strop = stropZalohy(out)
      if (strop != null && out.deposit_amount > strop) out.deposit_amount = strop
    }
    if (out.fee_mode == null) out.fee_mode = 'noshow'
    if (out.fee_mode === 'zadny') out.no_show_fee = null
    if (out.no_show_fee != null && out.no_show_fee <= 0) out.no_show_fee = null
    if (out.no_show_fee != null && out.no_show_fee > MAX_NO_SHOW_FEE) out.no_show_fee = MAX_NO_SHOW_FEE
    // Nikdy víc, než kolik zákazník složil.
    const drzeno = drzenaCastka(out)
    if (out.no_show_fee != null && drzeno != null && out.no_show_fee > drzeno) {
      out.no_show_fee = drzeno > 0 ? drzeno : null
    }
    out.price_note = out.price_note?.trim() || null
  }
  return out
}

// Ověří, že karta (service_id) patří přihlášenému uživateli.
async function assertOwnsService(
  supabase: any,
  serviceId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'Nejste přihlášeni.' }

  const { data: svc, error } = await supabase
    .from('services')
    .select('provider_id')
    .eq('id', serviceId)
    .single()
  if (error || !svc) return { ok: false, error: 'Karta nebyla nalezena.' }
  if ((svc as { provider_id: string }).provider_id !== user.id) {
    return { ok: false, error: 'Tato karta vám nepatří.' }
  }
  return { ok: true, userId: user.id }
}

// Dohledá kartu podle ID položky (pro update/delete, kdy máme jen item id).
async function serviceIdOfItem(supabase: any, itemId: string): Promise<string | null> {
  const { data } = await supabase
    .from('service_items')
    .select('service_id')
    .eq('id', itemId)
    .single()
  return (data as { service_id: string } | null)?.service_id ?? null
}

function refresh(serviceId: string) {
  revalidatePath('/')
  revalidatePath('/marketplace')
  revalidatePath(`/sluzby/${serviceId}`)
  revalidatePath('/dashboard/nabidky')
}

// ── Vytvořit položku ─────────────────────────────────────────
export async function createServiceItem(values: ServiceItemFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const parsed = itemSchema.safeParse(values)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Formulář obsahuje chyby.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const owns = await assertOwnsService(supabase, parsed.data.service_id)
  if (!owns.ok) return { success: false, error: owns.error }

  const norm = normalizeItem(parsed.data)
  const { id: _ignore, sort_order: incomingSort, ...insertBase } = norm

  // sort_order: když nepřišel, dej položku na konec ceníku
  let sort_order = incomingSort
  if (sort_order == null) {
    const { data: last } = await supabase
      .from('service_items')
      .select('sort_order')
      .eq('service_id', norm.service_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastSort = (last as { sort_order: number } | null)?.sort_order ?? -1
    sort_order = lastSort + 1
  }

  const insertData = { ...insertBase, sort_order }
  const { data, error } = await (supabase.from('service_items') as any)
    .insert(insertData)
    .select('id')
    .single()
  if (error) {
    console.error('INSERT service_items error:', error)
    return { success: false, error: 'Nepodařilo se uložit úkon.' }
  }

  refresh(norm.service_id)
  return { success: true, id: (data as { id: string }).id }
}

// ── Upravit položku ──────────────────────────────────────────
export async function updateServiceItem(id: string, values: ServiceItemFormValues): Promise<ActionResult> {
  const supabase = createClient()
  const parsed = itemSchema.safeParse({ ...values, id })
  if (!parsed.success) return { success: false, error: 'Formulář obsahuje chyby.' }

  // Ověř vlastnictví přes SKUTEČNOU kartu položky v DB, ne přes to, co přišlo v datech.
  const realServiceId = await serviceIdOfItem(supabase, id)
  if (!realServiceId) return { success: false, error: 'Úkon nebyl nalezen.' }
  const owns = await assertOwnsService(supabase, realServiceId)
  if (!owns.ok) return { success: false, error: owns.error }

  const norm = normalizeItem(parsed.data)
  // service_id ani sort_order tady nepřepisujeme — položka zůstává na své kartě i pozici
  const { id: _ignore, service_id: _svc, sort_order: _so, ...updateData } = norm

  const { error } = await (supabase.from('service_items') as any)
    .update(updateData)
    .eq('id', id)
  if (error) {
    console.error('UPDATE service_items error:', error)
    return { success: false, error: 'Nepodařilo se uložit změny úkonu.' }
  }

  refresh(realServiceId)
  return { success: true, id }
}

// ── Kolik objednávek visí na položce (pro varování před smazáním) ──
export async function countItemOrders(id: string): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('service_item_id', id)
  return count ?? 0
}

// ── Smazat položku ───────────────────────────────────────────
// Nemažeme tvrdě historii: orders.service_item_id se díky `on delete set null`
// jen vynuluje, cena objednávky zůstává v orders.total_price. Varování na počet
// objednávek řeší UI (countItemOrders výše) — sem se dostane až po potvrzení.
export async function deleteServiceItem(id: string): Promise<ActionResult> {
  const supabase = createClient()

  const realServiceId = await serviceIdOfItem(supabase, id)
  if (!realServiceId) return { success: false, error: 'Úkon nebyl nalezen.' }
  const owns = await assertOwnsService(supabase, realServiceId)
  if (!owns.ok) return { success: false, error: owns.error }

  const { error } = await (supabase.from('service_items') as any)
    .delete()
    .eq('id', id)
  if (error) {
    console.error('DELETE service_items error:', error)
    return { success: false, error: 'Nepodařilo se smazat úkon.' }
  }

  refresh(realServiceId)
  return { success: true, id }
}

// ── Zapnout/vypnout zveřejnění položky ───────────────────────
export async function toggleServiceItemActive(id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = createClient()

  const realServiceId = await serviceIdOfItem(supabase, id)
  if (!realServiceId) return { success: false, error: 'Úkon nebyl nalezen.' }
  const owns = await assertOwnsService(supabase, realServiceId)
  if (!owns.ok) return { success: false, error: owns.error }

  const { error } = await (supabase.from('service_items') as any)
    .update({ is_active })
    .eq('id', id)
  if (error) return { success: false, error: 'Nepodařilo se změnit stav úkonu.' }

  refresh(realServiceId)
  return { success: true, id }
}

// ── Přeuspořádat ceník (drag & drop) ─────────────────────────
// Dostane pole item ID v novém pořadí, přepíše sort_order 0..n.
export async function reorderServiceItems(serviceId: string, orderedIds: string[]): Promise<ActionResult> {
  const supabase = createClient()

  const owns = await assertOwnsService(supabase, serviceId)
  if (!owns.ok) return { success: false, error: owns.error }

  // Ověř, že všechna ID opravdu patří téhle kartě — ať přeuspořádání nesahá jinam.
  const { data: rows } = await supabase
    .from('service_items')
    .select('id')
    .eq('service_id', serviceId)
  const belongs = new Set((rows ?? []).map((r: { id: string }) => r.id))
  if (!orderedIds.every((id) => belongs.has(id))) {
    return { success: false, error: 'Neplatné pořadí položek.' }
  }

  // Zapiš nové pořadí. (Bez transakce — u pár položek to nevadí; kdyby jich byly
  // stovky, řešili bychom RPC. Reálně má karta jednotky až desítky úkonů.)
  for (let i = 0; i < orderedIds.length; i++) {
    await (supabase.from('service_items') as any)
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
  }

  refresh(serviceId)
  return { success: true, id: serviceId }
}