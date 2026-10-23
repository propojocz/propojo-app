// lib/order-todo.ts
// Co po mně objednávka chce – JEDNA sada pravidel pro číslo u „Objednávky“ v menu i pro zvýraznění
// v seznamu (23. 10. 2026, Matej: „mám 4 upozornění, ale nevidím, které to jsou“).
// Vrací text výzvy, nebo null. Čistá funkce (server i prohlížeč).

export type TodoOrder = {
  id: string
  status: string | null
  booking_state: string | null
  offer_kind: string | null
  deposit_status: string | null
  scheduled_at: string | null
  location_address?: string | null
  is_inquiry?: boolean | null
}

export type TodoContext = {
  /** Objednávky s otevřeným „Původní termín nemohu dodržet“ (čeká se na odpověď zákazníka) */
  openReschedule?: Set<string>
}

const isV2 = (o: TodoOrder) => !!o.booking_state || !!o.offer_kind

export function customerTodo(o: TodoOrder, ctx: TodoContext = {}): string | null {
  if (o.status === 'zruseno' || o.status === 'dokonceno') return null
  if (isV2(o)) {
    if (ctx.openReschedule?.has(o.id) && o.booking_state === 'confirmed') return 'Poskytovatel navrhuje nový termín – odpovězte'
    if (o.booking_state === 'pending_payment' || (o.booking_state == null && o.status === 'prijato')) return 'Dokončete rezervaci a zaplaťte'
    return null
  }
  // Starý model
  if (o.deposit_status === 'pending') return o.location_address ? 'Zaplaťte, aby termín platil' : 'Doplňte adresu a zaplaťte'
  if (o.status === 'ceka_potvrzeni') return 'Potvrďte dokončení a ohodnoťte'
  return null
}

export function providerTodo(o: TodoOrder, now = Date.now()): string | null {
  if (o.status === 'zruseno' || o.status === 'dokonceno') return null
  if (isV2(o)) {
    if (o.booking_state === 'awaiting_confirmation') return 'Potvrďte, nebo odmítněte rezervaci'
    if (o.booking_state === 'no_show_reported') return 'Zákazník hlásí nedostavení – vyjádřete se'
    return null
  }
  // Starý model (objednávky před modelem v2)
  if (o.status === 'cekajici') return o.is_inquiry ? 'Odpovězte na dotaz' : 'Přijměte, nebo odmítněte objednávku'
  if (o.status === 'prijato') {
    if (o.deposit_status === 'pending') return null // čeká se na zákazníka
    if (o.deposit_status === 'paid') return 'Uzavřete zakázku'
    if (!o.scheduled_at || new Date(o.scheduled_at).getTime() <= now) return 'Uzavřete zakázku'
  }
  return null
}

/** Sloupce objednávky, které pravidla potřebují */
export const TODO_COLUMNS = 'id, status, booking_state, offer_kind, deposit_status, scheduled_at, location_address, is_inquiry, authorized_at, service_item_id'
