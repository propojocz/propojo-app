// lib/request-detail.ts
// Data pro detail jedné poptávky – sdílí je stránka /poptavky/[id] i okno „Detail“ na nástěnce
// (12. 10. 2026), aby obě ukazovaly totéž. Kontakt ani přesnou adresu zákazníka nevrací.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { PickerCard } from '@/components/ui/InterestAction'

const ACTIVE = new Set(['interested', 'negotiating'])

export type RequestDetailData = {
  id: string
  category: string | null
  subcategoryId: string | null
  city: string
  description: string
  preferredDate: string | null
  photos: string[]
  inspirationPhotos: string[]
  budgetFrom: number | null
  budgetTo: number | null
  placePref: string | null
  status: string
  createdAt: string
  isOpen: boolean
  isOwner: boolean
  activeCount: number
  myStatus: string | null
  myConversationId: string | null
  myCards: PickerCard[]
  isLoggedIn: boolean
  isProvider: boolean
  myCity: string | null
}

export async function loadRequestDetail(requestId: string): Promise<RequestDetailData | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, category, subcategory_id, city, description, preferred_date, photos, status, created_at, expires_at, budget_from_kc, budget_to_kc, place_pref, inspiration_photos, target_provider_id')
    .eq('id', requestId)
    .maybeSingle() as { data: {
      id: string; customer_id: string | null; category: string | null; subcategory_id: string | null
      city: string; description: string; preferred_date: string | null; photos: string[] | null
      inspiration_photos: string[] | null
      budget_from_kc: number | null; budget_to_kc: number | null; place_pref: string | null
      status: string; created_at: string; expires_at: string
      target_provider_id: string | null
    } | null }
  if (!req) return null
  // Soukromou poptávku vidí jen zákazník a poskytovatel, pro kterého je
  if (req.target_provider_id && (!user || (user.id !== req.customer_id && user.id !== req.target_provider_id))) return null

  const isOwner = !!user && req.customer_id === user.id
  const isOpen = req.status === 'open' && new Date(req.expires_at).getTime() > Date.now()

  // Reakce → počet zájemců + můj stav.
  const { data: rs } = await admin
    .from('request_responses')
    .select('id, provider_id, status')
    .eq('request_id', requestId) as { data: Array<{ id: string; provider_id: string; status: string }> | null }
  const responses = rs ?? []
  const activeCount = responses.filter((r) => ACTIVE.has(r.status)).length
  const mine = user ? responses.find((r) => r.provider_id === user.id) : undefined

  let myConversationId: string | null = null
  if (mine) {
    const { data: c } = await admin
      .from('conversations').select('id').eq('request_response_id', mine.id).maybeSingle() as { data: { id: string } | null }
    myConversationId = c?.id ?? null
  }

  // Karty poskytovatele (pro picker) — jen když je přihlášený a není to jeho poptávka.
  // Reagovat smí jen poskytovatel (i bez karty) – zákazník jde na registraci poskytovatele
  let myCards: PickerCard[] = []
  let isProvider = false
  let myCity: string | null = null
  if (user && !isOwner) {
    const { data: prof } = await admin
      .from('profiles').select('is_provider, city').eq('id', user.id).maybeSingle() as { data: { is_provider: boolean | null; city: string | null } | null }
    isProvider = prof?.is_provider === true
    myCity = prof?.city ?? null
    const { data: cards } = await admin
      .from('services')
      .select('id, title, category, subcategory_id, location_type, address, address_lat, address_lng')
      .eq('provider_id', user.id)
      .eq('is_active', true) as { data: Array<{ id: string; title: string | null; category: string | null; subcategory_id: string | null; location_type: string | null; address: string | null; address_lat: number | null; address_lng: number | null }> | null }
    myCards = (cards ?? []).map((c) => ({
      id: c.id, title: c.title ?? 'Nabídka', category: c.category, subcategoryId: c.subcategory_id,
      locationType: c.location_type, address: c.address ? { text: c.address, lat: c.address_lat, lng: c.address_lng } : null,
    }))
  }

  return {
    id: req.id,
    category: req.category,
    subcategoryId: req.subcategory_id,
    city: req.city,
    description: req.description,
    preferredDate: req.preferred_date,
    photos: req.photos ?? [],
    inspirationPhotos: req.inspiration_photos ?? [],
    budgetFrom: req.budget_from_kc,
    budgetTo: req.budget_to_kc,
    placePref: req.place_pref,
    status: req.status,
    createdAt: req.created_at,
    isOpen,
    isOwner,
    activeCount,
    myStatus: mine?.status ?? null,
    myConversationId,
    myCards,
    isLoggedIn: !!user,
    isProvider,
    myCity,
  }
}
