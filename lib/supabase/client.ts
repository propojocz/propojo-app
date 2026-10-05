// lib/supabase/client.ts
// Browser-side Supabase client (pro Client Components)

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/**
 * Přihlášený uživatel v prohlížeči. Knihovna Supabase hlídá přihlášení zámkem; když ho jiný
 * požadavek drží déle než 5 s (pomalý dev server, obnova tokenu), převezme ho a původní volání
 * spadne chybou „Lock … was released because another request stole it“. Zkusíme to jednou znovu,
 * jinak vrátíme null – volající se k tomu chová jako k nepřihlášenému (nic nespadne).
 */
export async function getBrowserUser(supabase: ReturnType<typeof createClient>) {
  for (let pokus = 0; pokus < 2; pokus++) {
    try {
      const { data } = await supabase.auth.getUser()
      return data.user
    } catch (err) {
      if (pokus === 1) {
        console.warn('[supabase] getUser selhal:', err)
        return null
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return null
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
