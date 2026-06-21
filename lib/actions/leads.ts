'use server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin klient (obchází RLS) — stejný přístup jako v notifications.ts.
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function createLead(params: {
  email: string
  category?: string
  description: string
  city: string
  phone?: string
  preferred_date?: string
  photos?: string[]
}): Promise<{ success: boolean; error?: string }> {
  const email = params.email?.trim()
  const description = params.description?.trim()
  const city = params.city?.trim()

  // Základní validace
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Zadejte platný e-mail.' }
  }
  if (!description || description.length < 5) {
    return { success: false, error: 'Popište prosím, co potřebujete (alespoň pár slov).' }
  }
  if (!city) {
    return { success: false, error: 'Zadejte město nebo lokalitu.' }
  }

  const admin = getAdminClient()
  const { error } = await (admin.from('leads') as any).insert({
    email,
    category: params.category?.trim() || null,
    description,
    city,
    phone: params.phone?.trim() || null,
    preferred_date: params.preferred_date?.trim() || null,
    photos: params.photos ?? [],
    status: 'nova',
  })

  if (error) {
    console.error('[createLead]', error)
    return { success: false, error: 'Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.' }
  }

  return { success: true }
}