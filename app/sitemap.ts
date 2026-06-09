// app/sitemap.ts
import { createClient } from '@/lib/supabase/server'
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient()
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

  // Statické stránky
  const staticPages: MetadataRoute.Sitemap = [
    { url: APP_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${APP_URL}/marketplace`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${APP_URL}/registrace`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${APP_URL}/registrace/zivnostnik`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${APP_URL}/prihlasit`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${APP_URL}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${APP_URL}/pravidla-komunity`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${APP_URL}/podminky`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${APP_URL}/soukromi`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${APP_URL}/storno`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ]

  // Dynamické stránky – služby
  const { data: services } = await supabase
    .from('services')
    .select('id, updated_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1000)

  const servicePages: MetadataRoute.Sitemap = (services ?? []).map(s => ({
    url: `${APP_URL}/sluzby/${s.id}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // Dynamické stránky – profily živnostníků
  const { data: providers } = await supabase
    .from('profiles')
    .select('id, updated_at')
    .eq('is_provider', true)
    .limit(1000)

  const profilePages: MetadataRoute.Sitemap = (providers ?? []).map(p => ({
    url: `${APP_URL}/profil/${p.id}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...servicePages, ...profilePages]
}
