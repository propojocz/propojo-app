'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Přepínač oblíbeného: když není → přidá, když je → odebere. Vrací nový stav.
export async function toggleFavorite(providerId: string): Promise<{ success: boolean; favorited: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, favorited: false, error: 'Nejste přihlášeni.' }

  // Je už mezi oblíbenými?
  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider_id', providerId)
    .maybeSingle() as { data: { id: string } | null }

  if (existing) {
    const { error } = await supabase.from('favorites').delete().eq('id', existing.id)
    if (error) {
      console.error('[toggleFavorite delete]', error)
      return { success: false, favorited: true, error: 'Nepodařilo se odebrat.' }
    }
    revalidatePath('/dashboard')
    return { success: true, favorited: false }
  } else {
    const { error } = await (supabase.from('favorites') as any).insert({
      user_id: user.id,
      provider_id: providerId,
    })
    if (error) {
      console.error('[toggleFavorite insert]', error)
      return { success: false, favorited: false, error: 'Nepodařilo se přidat.' }
    }
    revalidatePath('/dashboard')
    return { success: true, favorited: true }
  }
}

// Zjistí, jestli má přihlášený uživatel daného poskytovatele v oblíbených.
export async function isFavorited(providerId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider_id', providerId)
    .maybeSingle() as { data: { id: string } | null }

  return !!data
}