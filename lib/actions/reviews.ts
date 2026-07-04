'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

  // Notifikace poskytovateli o nové recenzi (nezávisle na výsledku)
  try {
    const { data: reviewer } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }
    await (getAdminClient().from('notifications') as any).insert({
      user_id: order.provider_id,
      type: 'review',
      order_id: orderId,
      actor_id: user.id,
      title: 'Nová recenze',
      preview: `${reviewer?.full_name ?? 'Zákazník'} vás ohodnotil${rating >= 4 ? ' ⭐' : ''} — ${rating}/5`,
    })
  } catch (e) {
    console.error('[createReview notification]', e)
  }

  revalidatePath(`/dashboard/objednavky/${orderId}`)
  revalidatePath(`/profil/${order.provider_id}`)
  revalidatePath('/dashboard/recenze')
  return { success: true }
}

// ══════════════════════════════════════════════════════════════
// Odpověď poskytovatele na recenzi + nahlášení adminovi
// Model: JEDNA veřejná odpověď (bez vlákna), zákazník nereaguje.
// ══════════════════════════════════════════════════════════════

type Result = { success: true } | { success: false; error: string }

// Poskytovatel odpoví na recenzi (jednou). Jen vlastník (provider_id recenze).
export async function respondToReview(reviewId: string, response: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const text = response.trim()
  if (text.length === 0) return { success: false, error: 'Odpověď nemůže být prázdná.' }
  if (text.length > 1000) return { success: false, error: 'Odpověď je příliš dlouhá (max 1000 znaků).' }

  const admin = getAdminClient()
  const { data: review } = await admin
    .from('reviews')
    .select('id, provider_id, provider_response')
    .eq('id', reviewId)
    .single() as { data: { id: string; provider_id: string; provider_response: string | null } | null }

  if (!review) return { success: false, error: 'Recenze nenalezena.' }
  if (review.provider_id !== user.id) return { success: false, error: 'Na tuto recenzi nemůžete odpovědět.' }
  if (review.provider_response) return { success: false, error: 'Na recenzi už jste odpověděli.' }

  const { error } = await (admin.from('reviews') as any)
    .update({ provider_response: text, response_created_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) {
    console.error('[respondToReview]', error)
    return { success: false, error: 'Odpověď se nepodařilo uložit.' }
  }

  revalidatePath(`/profil/${user.id}`)
  revalidatePath('/dashboard/recenze')
  return { success: true }
}

// Poskytovatel nahlásí recenzi adminovi (nespravedlivá/urážlivá).
export async function reportReview(reviewId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }

  const admin = getAdminClient()
  const { data: review } = await admin
    .from('reviews')
    .select('id, provider_id, reported_at')
    .eq('id', reviewId)
    .single() as { data: { id: string; provider_id: string; reported_at: string | null } | null }

  if (!review) return { success: false, error: 'Recenze nenalezena.' }
  if (review.provider_id !== user.id) return { success: false, error: 'Tuto recenzi nemůžete nahlásit.' }
  if (review.reported_at) return { success: false, error: 'Recenze už je nahlášena.' }

  const { error } = await (admin.from('reviews') as any)
    .update({ reported_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) {
    console.error('[reportReview]', error)
    return { success: false, error: 'Nahlášení se nepodařilo.' }
  }

  revalidatePath(`/profil/${user.id}`)
  revalidatePath('/dashboard/recenze')
  return { success: true }
}

// Admin: smazat recenzi (po posouzení nahlášení).
export async function adminDeleteReview(reviewId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }
  const { data: me } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean } | null }
  if (me?.is_admin !== true) return { success: false, error: 'Nemáte oprávnění.' }

  const admin = getAdminClient()
  const { error } = await admin.from('reviews').delete().eq('id', reviewId)
  if (error) {
    console.error('[adminDeleteReview]', error)
    return { success: false, error: 'Recenzi se nepodařilo smazat.' }
  }
  revalidatePath('/admin/recenze')
  return { success: true }
}

// Admin: ponechat recenzi (zrušit nahlášení).
export async function adminDismissReport(reviewId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášeni.' }
  const { data: me } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean } | null }
  if (me?.is_admin !== true) return { success: false, error: 'Nemáte oprávnění.' }

  const admin = getAdminClient()
  const { error } = await (admin.from('reviews') as any)
    .update({ reported_at: null })
    .eq('id', reviewId)
  if (error) {
    console.error('[adminDismissReport]', error)
    return { success: false, error: 'Akci se nepodařilo provést.' }
  }
  revalidatePath('/admin/recenze')
  return { success: true }
}