'use server'
// lib/actions/faqs.ts
// Časté dotazy u nabídky. Upravuje je vlastník karty přímo na kartě —
// nemusí kvůli jedné větě procházet celý formulář nabídky.

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

// Ověří, že karta patří přihlášenému. Vrací id uživatele, nebo null.
async function overVlastnika(serviceId: string): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = getAdminClient()
  const { data } = await admin
    .from('services').select('provider_id').eq('id', serviceId).maybeSingle() as { data: { provider_id: string } | null }
  return data?.provider_id === user.id ? user.id : null
}

export async function saveFaq(
  serviceId: string,
  faqId: string | null,
  question: string,
  answer: string
): Promise<Result> {
  const uid = await overVlastnika(serviceId)
  if (!uid) return { success: false, error: 'Tohle není vaše nabídka.' }

  const q = question.trim()
  const a = answer.trim()
  if (q.length < 5) return { success: false, error: 'Napište otázku — aspoň pět znaků.' }
  if (a.length < 2) return { success: false, error: 'Doplňte odpověď.' }
  if (q.length > 200) return { success: false, error: 'Otázka je moc dlouhá.' }
  if (a.length > 1000) return { success: false, error: 'Odpověď je moc dlouhá.' }

  const admin = getAdminClient()

  if (faqId) {
    const { error } = await (admin.from('service_faqs') as any)
      .update({ question: q, answer: a }).eq('id', faqId).eq('service_id', serviceId)
    if (error) {
      console.error('[saveFaq] update', error)
      return { success: false, error: 'Nepodařilo se uložit.' }
    }
  } else {
    // Nový dotaz jde na konec seznamu.
    const { count } = await admin
      .from('service_faqs').select('id', { count: 'exact', head: true }).eq('service_id', serviceId)
    const { error } = await (admin.from('service_faqs') as any)
      .insert({ service_id: serviceId, question: q, answer: a, sort_order: count ?? 0 })
    if (error) {
      console.error('[saveFaq] insert', error)
      return { success: false, error: 'Nepodařilo se přidat dotaz.' }
    }
  }

  revalidatePath(`/sluzby/${serviceId}`)
  return { success: true }
}

export async function deleteFaq(serviceId: string, faqId: string): Promise<Result> {
  const uid = await overVlastnika(serviceId)
  if (!uid) return { success: false, error: 'Tohle není vaše nabídka.' }

  const admin = getAdminClient()
  const { error } = await (admin.from('service_faqs') as any)
    .delete().eq('id', faqId).eq('service_id', serviceId)
  if (error) {
    console.error('[deleteFaq]', error)
    return { success: false, error: 'Nepodařilo se smazat.' }
  }

  revalidatePath(`/sluzby/${serviceId}`)
  return { success: true }
}