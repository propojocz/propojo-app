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
  name: z.string().min(2, 'Zadejte název úkonu.').max(100),
  payment_model: z.enum(['A', 'B'] as const),
  price_type: z.enum(['fixed', 'range', 'on_agreement'] as const),
  price: z.number().min(0).max(999999).nullable().optional(),
  price_unit: z.enum(['ukon', 'hod', 'kus', 'den', 'projekt', 'm2', 'bm'] as const),
  price_max: z.number().min(0).max(999999).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  deposit_amount: z.number().min(0).max(999999).nullable().optional(),
  price_includes_material: z.boolean().optional(),
  price_note: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
})

type ItemParsed = z.infer<typeof itemSchema>

// Sjednotí hodnoty podle modelu/typu ceny — stejná logika jako normalize() u služeb,
// ať do DB nejdou nekonzistentní data (např. záloha u modelu B).
function normalizeItem(d: ItemParsed): ItemParsed {
  const out: ItemParsed = { ...d }
  out.name = out.name.trim()
  if (out.price_includes_material == null) out.price_includes_material = true
  if (out.is_active == null) out.is_active = true

  if (out.payment_model === 'B') {
    out.price = null
    out.price_type = 'on_agreement'
    out.price_max = null
    out.deposit_amount = null
    out.price_includes_material = true
    out.price_note = out.price_note?.trim() || null
  } else {
    if (out.price_type === 'on_agreement') {
      out.price = null
      out.price_max = null
    }
    if (out.price_type !== 'range') out.price_max = null
    if (out.deposit_amount != null && out.deposit_amount < 200) out.deposit_amount = 200
    if (out.deposit_amount == null) out.deposit_amount = 200
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