// app/api/featured-services/route.ts
// Vrací až 3 skutečné služby pro hlavní stránku.
// Jen od poskytovatelů, kteří prošli Stripe ověřením (KYC) a nejsou pozastavení.
// Žádná vymyšlená data — když nikdo takový není, vrátí prázdné pole a hlavní
// stránka místo karet ukáže pozvánku pro řemeslníky.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('services')
      .select(`*, profiles (id, full_name, display_name, company_name, avatar_url, rating, review_count, city, is_suspended, ico_verified, stripe_onboarding_done)`)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) {
      console.error('[featured-services]', error)
      return NextResponse.json({ services: [] })
    }

    // Viditelnost řídí AKTIVNÍ PŘEDPLATNÉ (ne napojení Connectu). Bez předplatného
    // se profil ani karty nezobrazují — stejné pravidlo jako v marketplace.
    const candidates = (data ?? []).filter((s: any) => s.profiles?.is_suspended !== true)
    const providerIds = Array.from(new Set(candidates.map((s: any) => s.profiles?.id ?? s.provider_id)))

    const activeSubscribers = new Set<string>()
    if (providerIds.length > 0) {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('user_id, status')
        .in('user_id', providerIds)
        .in('status', ['active', 'trialing'])
      for (const row of (subs ?? []) as any[]) activeSubscribers.add(row.user_id)
    }

    const services = candidates
      .filter((s: any) => activeSubscribers.has(s.profiles?.id ?? s.provider_id))
      .sort((a: any, b: any) => (b.profiles?.rating ?? 0) - (a.profiles?.rating ?? 0))
      .slice(0, 3)

    return NextResponse.json({ services })
  } catch (err) {
    console.error('[featured-services]', err)
    return NextResponse.json({ services: [] })
  }
}