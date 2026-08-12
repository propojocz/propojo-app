'use server'
// lib/actions/reviews-seen.ts
// Zhasnutí odznaku u recenzí. Když poskytovatel otevře své recenze,
// zapíšeme čas — odznak pak počítá jen recenze, které přijdou potom.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function markReviewsSeen(): Promise<{ success: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await (admin.from('profiles') as any)
    .update({ reviews_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('[markReviewsSeen]', error)
    return { success: false }
  }

  // Ať se odznak v hlavičce překreslí hned.
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/recenze')
  return { success: true }
}