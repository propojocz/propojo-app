'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Přepínač oblíbeného: když není → přidá, když je → odebere. Vrací nový stav.
export async function toggleFavorite(providerId: string): Promise<{ success: boolean; favorited: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, favorited: false, error: 'Nejste přihlášeni.' }

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
    revalidatePath('/dashboard/oblibene')
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
    revalidatePath('/dashboard/oblibene')
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

// Seznam oblíbených poskytovatelů přihlášeného uživatele (profil + počet služeb).
export type FavoriteProvider = {
  id: string
  full_name: string | null
  avatar_url: string | null
  city: string | null
  rating: number | null
  review_count: number | null
  ico_verified: boolean | null
  service_count: number
}

export async function getFavorites(): Promise<FavoriteProvider[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: favRows } = await supabase
    .from('favorites')
    .select('provider_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) as { data: { provider_id: string; created_at: string }[] | null }

  const ids = (favRows ?? []).map((r) => r.provider_id)
  if (ids.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, city, rating, review_count, ico_verified, is_provider, is_suspended')
    .in('id', ids) as { data: any[] | null }

  const { data: svcRows } = await supabase
    .from('services')
    .select('provider_id')
    .in('provider_id', ids)
    .eq('is_active', true) as { data: { provider_id: string }[] | null }
  const svcCount: Record<string, number> = {}
  for (const s of svcRows ?? []) svcCount[s.provider_id] = (svcCount[s.provider_id] ?? 0) + 1

  const byId: Record<string, any> = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
  return ids
    .map((id) => byId[id])
    .filter((p) => p && p.is_provider === true && p.is_suspended !== true)
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      city: p.city,
      rating: p.rating,
      review_count: p.review_count,
      ico_verified: p.ico_verified,
      service_count: svcCount[p.id] ?? 0,
    }))
}