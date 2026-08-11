'use server'
// lib/actions/qr.ts
// QR kódy pro poskytovatele — na vizitku, zrcadlo, dveře.
//
// Kód vede na KRÁTKÝ odkaz propojo.cz/q/<token>, ne přímo na kartu.
// Proč: přes ten odkaz umíme spočítat načtení a zároveň zůstává stálý,
// i kdyby se cesty na webu někdy změnily. Vytištěné kódy tak platí navždy.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://propojo.cz'
}

// Token bez znaků, které se pletou (0/O, 1/l/I) — ať jde přepsat z papíru.
const ZNAKY = 'abcdefghjkmnpqrstuvwxyz23456789'
function novyToken(delka = 6): string {
  let t = ''
  for (let i = 0; i < delka; i++) t += ZNAKY[Math.floor(Math.random() * ZNAKY.length)]
  return t
}

export type QrCil = {
  id: string | null          // service_id, null = profil
  itemId: string | null      // konkrétní úkon
  nazev: string
  popis: string
}

export type QrKod = {
  id: string
  token: string
  url: string
  cilUrl: string
  scanCount: number
  serviceId: string | null
  serviceItemId: string | null
}

export type QrStatistika = {
  celkem: number
  tydne: number
  poSlozkach: Array<{ den: string; pocet: number }>
}

// ── Cíle, na které si může poskytovatel udělat kód ──────────────
export async function getQrCile(): Promise<QrCil[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getAdminClient()
  const { data: karty } = await admin
    .from('services')
    .select('id, title, city')
    .eq('provider_id', user.id)
    .order('created_at', { ascending: true }) as { data: any[] | null }

  const cile: QrCil[] = (karty ?? []).map(k => ({
    id: k.id,
    itemId: null,
    nazev: k.title,
    popis: k.city ? `Ceník i termíny — ${k.city}` : 'Ceník i termíny',
  }))

  // Profil až na konci — je to slabší cíl než karta s ceníkem.
  cile.push({
    id: null,
    itemId: null,
    nazev: 'Můj profil',
    popis: 'Všechny mé nabídky a hodnocení pohromadě',
  })

  return cile
}

// ── Získat (nebo poprvé vytvořit) kód pro daný cíl ──────────────
export async function getOrCreateQrKod(
  serviceId: string | null,
  serviceItemId: string | null = null
): Promise<{ success: true; kod: QrKod } | { success: false; error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()

  // Když míří na kartu, musí být moje.
  if (serviceId) {
    const { data: svc } = await admin
      .from('services').select('provider_id').eq('id', serviceId).maybeSingle() as { data: { provider_id: string } | null }
    if (!svc) return { success: false, error: 'Nabídka neexistuje.' }
    if (svc.provider_id !== user.id) return { success: false, error: 'Tohle není vaše nabídka.' }
  }

  // Existuje už?
  let dotaz = admin.from('qr_codes').select('*').eq('provider_id', user.id)
  dotaz = serviceId ? dotaz.eq('service_id', serviceId) : dotaz.is('service_id', null)
  dotaz = serviceItemId ? dotaz.eq('service_item_id', serviceItemId) : dotaz.is('service_item_id', null)
  const { data: existujici } = await dotaz.maybeSingle() as { data: any }

  if (existujici) {
    return { success: true, kod: sestavKod(existujici) }
  }

  // Nový — token zkusíme párkrát, kdyby náhodou kolidoval.
  for (let pokus = 0; pokus < 5; pokus++) {
    const token = novyToken()
    const { data, error } = await (admin.from('qr_codes') as any)
      .insert({
        provider_id: user.id,
        service_id: serviceId,
        service_item_id: serviceItemId,
        token,
      })
      .select('*')
      .single()
    if (!error && data) {
      revalidatePath('/dashboard/qr')
      return { success: true, kod: sestavKod(data) }
    }
    // 23505 = kolize unikátního klíče → zkusíme jiný token
    if ((error as any)?.code !== '23505') {
      console.error('[getOrCreateQrKod]', error)
      return { success: false, error: 'Nepodařilo se vytvořit kód.' }
    }
  }
  return { success: false, error: 'Nepodařilo se vytvořit kód, zkuste to znovu.' }
}

function sestavKod(row: any): QrKod {
  const base = siteUrl()
  const cil = row.service_id
    ? `${base}/sluzby/${row.service_id}${row.service_item_id ? `?ukon=${row.service_item_id}` : ''}`
    : `${base}/profil/${row.provider_id}`
  return {
    id: row.id,
    token: row.token,
    url: `${base}/q/${row.token}`,
    cilUrl: cil,
    scanCount: row.scan_count ?? 0,
    serviceId: row.service_id ?? null,
    serviceItemId: row.service_item_id ?? null,
  }
}

// ── Statistika načtení ──────────────────────────────────────────
export async function getQrStatistika(qrCodeId: string): Promise<QrStatistika> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { celkem: 0, tydne: 0, poSlozkach: [] }

  const admin = getAdminClient()
  const { data: kod } = await admin
    .from('qr_codes').select('provider_id, scan_count').eq('id', qrCodeId).maybeSingle() as { data: any }
  if (!kod || kod.provider_id !== user.id) return { celkem: 0, tydne: 0, poSlozkach: [] }

  const tydenZpet = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: scans } = await admin
    .from('qr_scans').select('created_at')
    .eq('qr_code_id', qrCodeId)
    .gte('created_at', tydenZpet) as { data: { created_at: string }[] | null }

  // Rozpad po dnech pro malý graf.
  const dny: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000)
    dny[d.toISOString().slice(0, 10)] = 0
  }
  for (const s of scans ?? []) {
    const klic = s.created_at.slice(0, 10)
    if (klic in dny) dny[klic]++
  }

  return {
    celkem: kod.scan_count ?? 0,
    tydne: (scans ?? []).length,
    poSlozkach: Object.entries(dny).map(([den, pocet]) => ({ den, pocet })),
  }
}

// ── Jméno pro tiskové šablony ───────────────────────────────────
export async function getTiskUdaje(): Promise<{ jmeno: string; mesto: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { jmeno: 'Propojo', mesto: null }

  const admin = getAdminClient()
  const { data } = await admin
    .from('profiles').select('full_name, company_name, city').eq('id', user.id).maybeSingle() as { data: any }

  return {
    jmeno: data?.company_name || data?.full_name || 'Propojo',
    mesto: data?.city ?? null,
  }
}