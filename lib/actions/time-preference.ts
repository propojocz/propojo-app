'use server'
// lib/actions/time-preference.ts
// VRSTVA 7 — preference zákazníka u poptávky bez termínu.
//
// Zákazník nad chatem vyplní přibližné okno (od–do) a denní dobu. Poskytovatel
// to pak vidí v TimeProposalPanel a podle toho navrhuje konkrétní časy —
// nemusí hádat ani se ptát v chatu.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type TimePref = 'rano' | 'odpoledne' | 'vecer' | 'kdykoli'

type Result = { success: true } | { success: false; error: string }

export async function setTimePreference(
  orderId: string,
  dateFrom: string,
  dateTo: string,
  timePref: TimePref
): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  if (!dateFrom || !dateTo) return { success: false, error: 'Vyplňte prosím obě data.' }
  if (new Date(dateTo) < new Date(dateFrom)) {
    return { success: false, error: 'Datum „do" musí být stejné nebo pozdější než „od".' }
  }

  const { data: order } = await supabase
    .from('orders')
    .select('customer_id, scheduled_at')
    .eq('id', orderId)
    .single() as { data: { customer_id: string; scheduled_at: string | null } | null }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) return { success: false, error: 'Preferenci může zadat jen zákazník objednávky.' }
  if (order.scheduled_at) return { success: false, error: 'Termín je už domluvený.' }

  const { error } = await (supabase.from('orders') as any)
    .update({ pref_date_from: dateFrom, pref_date_to: dateTo, pref_time: timePref })
    .eq('id', orderId)

  if (error) {
    console.error('[setTimePreference]', error)
    return { success: false, error: 'Nepodařilo se uložit.' }
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  return { success: true }
}