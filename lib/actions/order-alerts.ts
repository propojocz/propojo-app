'use server'
// lib/actions/order-alerts.ts
// Kolik objednávek na mě čeká — abych je nemusel hledat.
// Pravidla jsou společná se seznamem objednávek (lib/order-todo.ts), takže číslo v menu
// vždy odpovídá zvýrazněným objednávkám v seznamu (23. 10. 2026).

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { customerTodo, providerTodo, TODO_COLUMNS, type TodoOrder } from '@/lib/order-todo'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Row = TodoOrder & { authorized_at: string | null; service_item_id: string | null }
type Admin = ReturnType<typeof getAdminClient>

/** Nezaplacené objednávky z poptávky žijí jen v chatu jednání – v seznamu ani v počtu nejsou */
async function withoutRequestDrafts(admin: Admin, rows: Row[]): Promise<Row[]> {
  const ids = rows.filter((o) => !o.authorized_at && !o.service_item_id).map((o) => o.id)
  if (ids.length === 0) return rows
  const { data } = await admin.from('order_events').select('order_id').eq('type', 'created_from_request').in('order_id', ids)
  const hidden = new Set(((data ?? []) as Array<{ order_id: string }>).map((e) => e.order_id))
  return rows.filter((o) => !hidden.has(o.id))
}

/** Objednávky s otevřeným „Původní termín nemohu dodržet“ */
export async function openReschedulesOf(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set()
  const { data } = await getAdminClient()
    .from('order_reschedules').select('order_id').eq('status', 'open').eq('kind', 'cannot_keep_original').in('order_id', orderIds)
  return new Set(((data ?? []) as Array<{ order_id: string }>).map((r) => r.order_id))
}

export async function getCustomerTodoCount(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const admin = getAdminClient()
  const { data } = await admin.from('orders').select(TODO_COLUMNS).eq('customer_id', user.id).not('status', 'in', '("zruseno","dokonceno")')
  const rows = await withoutRequestDrafts(admin, (data ?? []) as unknown as Row[])
  const resch = await openReschedulesOf(rows.filter((o) => o.booking_state === 'confirmed').map((o) => o.id))
  return rows.filter((o) => customerTodo(o, { openReschedule: resch }) !== null).length
}

export async function getProviderTodoCount(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const admin = getAdminClient()
  const { data } = await admin.from('orders').select(TODO_COLUMNS).eq('provider_id', user.id).not('status', 'in', '("zruseno","dokonceno")')
  const rows = await withoutRequestDrafts(admin, (data ?? []) as unknown as Row[])
  const now = Date.now()
  return rows.filter((o) => providerTodo(o, now) !== null).length
}
