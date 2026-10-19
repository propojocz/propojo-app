'use server'
// lib/actions/homepage-images.ts
// Obrázky v sekci „Jak to funguje“ na úvodní stránce (19. 10. 2026, varianta A): nahrává admin
// v /admin/obrazky, stránka při každém načtení vybere náhodně jeden ze zapnutých (v rozmezí od–do).
// Tabulka homepage_images (docs/sql/homepage-obrazky.sql) má zamčenou RLS – vše přes service role,
// zápis jen po kontrole profiles.is_admin. Reklama zatím ne.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminDb } from '@/lib/booking/payments'
import { isoZPrazskehoCasu } from '@/lib/format'

export type HomepageImage = {
  id: string
  image_url: string
  alt: string
  link_url: string | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

type Result = { success: true } | { success: false; error: string }

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nejste přihlášeni.' }
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single() as { data: { is_admin: boolean } | null }
  if (profile?.is_admin !== true) return { ok: false, error: 'Jen pro administrátora.' }
  return { ok: true, userId: user.id }
}

/** Obrázek pro úvodní stránku – náhodně jeden ze zapnutých; null = žádný (nebo ještě neproběhlo SQL) */
export async function getHomepageImage(): Promise<Pick<HomepageImage, 'image_url' | 'alt' | 'link_url'> | null> {
  const db = adminDb() as any
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('homepage_images')
    .select('image_url, alt, link_url, starts_at, ends_at')
    .eq('is_active', true)
    .limit(50)
  if (error || !data) return null
  const live = (data as any[]).filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at > nowIso))
  if (live.length === 0) return null
  const pick = live[Math.floor(Math.random() * live.length)]
  return { image_url: pick.image_url, alt: pick.alt ?? '', link_url: pick.link_url ?? null }
}

export async function listHomepageImages(): Promise<HomepageImage[]> {
  const auth = await requireAdmin()
  if (!auth.ok) return []
  const { data } = await (adminDb() as any)
    .from('homepage_images')
    .select('id, image_url, alt, link_url, is_active, starts_at, ends_at, created_at')
    .order('created_at', { ascending: false })
  return (data ?? []) as HomepageImage[]
}

export async function addHomepageImage(values: {
  image_url: string
  alt: string
  link_url?: string | null
  /** 'YYYY-MM-DD' – od tohoto dne (pražsky od půlnoci) */
  starts_on?: string | null
  /** 'YYYY-MM-DD' – včetně tohoto dne */
  ends_on?: string | null
}): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  // Jen obrázky z našeho úložiště (nahrané přes ImageUpload), žádné cizí adresy
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  const url = values.image_url?.trim() ?? ''
  if (!url.startsWith(storagePrefix)) return { success: false, error: 'Nahrajte prosím obrázek.' }
  const alt = values.alt?.trim() ?? ''
  if (alt.length < 3) return { success: false, error: 'Napište krátký popis obrázku (co je na něm).' }
  const link = values.link_url?.trim() || null
  if (link && !link.startsWith('/') && !/^https:\/\//.test(link)) {
    return { success: false, error: 'Odkaz musí začínat „/“ (stránka Propoja) nebo „https://“.' }
  }
  const day = /^\d{4}-\d{2}-\d{2}$/
  if ((values.starts_on && !day.test(values.starts_on)) || (values.ends_on && !day.test(values.ends_on))) {
    return { success: false, error: 'Neplatné datum.' }
  }
  const startsAt = values.starts_on ? isoZPrazskehoCasu(values.starts_on, '00:00') : null
  // „do“ včetně celého dne
  const endsAt = values.ends_on ? new Date(new Date(isoZPrazskehoCasu(values.ends_on, '00:00')).getTime() + 86_400_000).toISOString() : null
  if (startsAt && endsAt && endsAt <= startsAt) return { success: false, error: 'Konec musí být po začátku.' }

  const { error } = await (adminDb() as any).from('homepage_images').insert({
    image_url: url,
    alt: alt.slice(0, 200),
    link_url: link,
    starts_at: startsAt,
    ends_at: endsAt,
    created_by: auth.userId,
  })
  if (error) {
    console.error('[homepage-images] přidání:', error.message)
    return { success: false, error: 'Obrázek se nepodařilo uložit. Proběhlo SQL homepage-obrazky.sql?' }
  }
  revalidatePath('/')
  revalidatePath('/admin/obrazky')
  return { success: true }
}

export async function setHomepageImageActive(id: string, active: boolean): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { error } = await (adminDb() as any).from('homepage_images').update({ is_active: active }).eq('id', id)
  if (error) return { success: false, error: 'Nepodařilo se uložit.' }
  revalidatePath('/')
  revalidatePath('/admin/obrazky')
  return { success: true }
}

export async function deleteHomepageImage(id: string): Promise<Result> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { error } = await (adminDb() as any).from('homepage_images').delete().eq('id', id)
  if (error) return { success: false, error: 'Nepodařilo se smazat.' }
  revalidatePath('/')
  revalidatePath('/admin/obrazky')
  return { success: true }
}
