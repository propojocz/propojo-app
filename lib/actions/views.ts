'use server'
import { createClient } from '@/lib/supabase/server'

// Zvýší počítadlo zhlédnutí profilu o 1.
// Nezapočítá samotného poskytovatele, když si prohlíží vlastní profil.
export async function incrementProfileView(providerId: string): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Vlastníka nepočítáme
    if (user && user.id === providerId) return

    const { error } = await (supabase as any).rpc('increment_profile_views', { p_id: providerId })
    if (error) console.error('[incrementProfileView]', error)
  } catch (err) {
    console.error('[incrementProfileView] neočekávaná chyba:', err)
  }
}