'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type OrderForReview = {
  id: string
  customer_id: string
  provider_id: string
  status: string
}

type ExistingReview = { id: string }

// Vytvoří recenzi k dokončené objednávce. Hodnotit smí jen zákazník dané objednávky.
export async function createReview(params: {
  orderId: string
  rating: number
  comment?: string
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, rating, comment } = params

  if (rating < 1 || rating > 5) {
    return { success: false, error: 'Hodnocení musí být 1 až 5 hvězd.' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  // Načti objednávku a ověř pravidla
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, provider_id, status')
    .eq('id', orderId)
    .single() as { data: OrderForReview | null }

  if (!order) return { success: false, error: 'Objednávka nenalezena.' }
  if (order.customer_id !== user.id) return { success: false, error: 'Hodnotit může jen zákazník této objednávky.' }
  if (order.status !== 'dokonceno') return { success: false, error: 'Hodnotit lze až po dokončení objednávky.' }

  // Už existuje recenze pro tuto objednávku? (DB to hlídá unikátností, tohle je hezčí hláška)
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle() as { data: ExistingReview | null }

  if (existing) return { success: false, error: 'Tuto objednávku jste už ohodnotili.' }

  // Vlož recenzi (triggery v DB přepočítají rating a review_count na profilu)
  const { error } = await (supabase.from('reviews') as any).insert({
    order_id: orderId,
    reviewer_id: user.id,
    provider_id: order.provider_id,
    rating,
    comment: comment?.trim() || null,
  })

  if (error) {
    console.error('[createReview]', error)
    return { success: false, error: 'Recenzi se nepodařilo uložit.' }
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath(`/profil/${order.provider_id}`)
  return { success: true }
}