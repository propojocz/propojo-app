'use server'
// lib/actions/brands.ts
// Značky (salon, firma) — víc poskytovatelů pod jedním jménem.
//
// Každý poskytovatel má dál SVOU kartu, SVŮJ ceník i kalendář a platí SVÉ
// předplatné. Značka jen sdílí jméno, adresu a fotky provozovny.
//
// Připojení funguje na SOUHLAS OBOU stran:
//   - majitel POZVE  → člen musí přijmout   (status 'pozvan' → 'clen')
//   - člen POŽÁDÁ    → majitel musí schválit (status 'zadost' → 'clen')
// Bez souhlasu obou nikdo k cizí značce nepatří.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Result = { success: true } | { success: false; error: string }
type CreateResult =
  | { success: true; id: string; slug: string }
  | { success: false; error: string }

// Slug z názvu — bez diakritiky, malá písmena, pomlčky.
function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

const brandSchema = z.object({
  name: z.string().min(2, 'Název značky musí mít aspoň 2 znaky.').max(80, 'Název je moc dlouhý.'),
  bio: z.string().max(1000, 'Popis je moc dlouhý.').optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
})

// ── Založit značku ──────────────────────────────────────────────
export async function createBrand(input: {
  name: string; bio?: string | null; city?: string | null
  address?: string | null; logo_url?: string | null
}): Promise<CreateResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const parsed = brandSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'Zkontrolujte formulář.' }
  }

  const admin = getAdminClient()

  // Unikátní slug — kdyby název kolidoval, přidáme příponu.
  const base = slugify(parsed.data.name) || 'znacka'
  let slug = base
  for (let i = 2; i < 30; i++) {
    const { data: exists } = await admin
      .from('brands').select('id').eq('slug', slug).maybeSingle()
    if (!exists) break
    slug = `${base}-${i}`
  }

  const { data, error } = await (admin.from('brands') as any)
    .insert({
      owner_id: user.id,
      name: parsed.data.name.trim(),
      slug,
      bio: parsed.data.bio?.trim() || null,
      city: parsed.data.city?.trim() || null,
      address: parsed.data.address?.trim() || null,
      logo_url: parsed.data.logo_url || null,
    })
    .select('id, slug')
    .single()

  if (error) {
    console.error('[createBrand]', error)
    return { success: false, error: 'Nepodařilo se založit značku.' }
  }

  // Majitel je automaticky členem (potvrzeným) své značky.
  await (admin.from('brand_members') as any).insert({
    brand_id: (data as any).id,
    provider_id: user.id,
    status: 'clen',
    role_label: 'Majitel',
    invited_by: user.id,
    decided_at: new Date().toISOString(),
  })

  revalidatePath('/dashboard/znacka')
  return { success: true, id: (data as any).id, slug: (data as any).slug }
}

// ── Upravit značku (jen majitel) ────────────────────────────────
export async function updateBrand(brandId: string, input: {
  name?: string; bio?: string | null; city?: string | null
  address?: string | null; logo_url?: string | null; is_active?: boolean
}): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: brand } = await admin
    .from('brands').select('owner_id').eq('id', brandId).maybeSingle() as { data: { owner_id: string } | null }
  if (!brand) return { success: false, error: 'Značka neexistuje.' }
  if (brand.owner_id !== user.id) return { success: false, error: 'Upravit značku může jen její majitel.' }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.bio !== undefined) patch.bio = input.bio?.trim() || null
  if (input.city !== undefined) patch.city = input.city?.trim() || null
  if (input.address !== undefined) patch.address = input.address?.trim() || null
  if (input.logo_url !== undefined) patch.logo_url = input.logo_url || null
  if (input.is_active !== undefined) patch.is_active = input.is_active

  const { error } = await (admin.from('brands') as any).update(patch).eq('id', brandId)
  if (error) {
    console.error('[updateBrand]', error)
    return { success: false, error: 'Nepodařilo se uložit změny.' }
  }
  revalidatePath('/dashboard/znacka')
  revalidatePath(`/znacka/${brandId}`)
  return { success: true }
}

// ── Majitel POZVE poskytovatele ─────────────────────────────────
export async function inviteMember(brandId: string, providerId: string, roleLabel?: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: brand } = await admin
    .from('brands').select('owner_id').eq('id', brandId).maybeSingle() as { data: { owner_id: string } | null }
  if (!brand) return { success: false, error: 'Značka neexistuje.' }
  if (brand.owner_id !== user.id) return { success: false, error: 'Zvát může jen majitel značky.' }
  if (providerId === user.id) return { success: false, error: 'Sebe zvát nemusíte — jste majitel.' }

  // Už nějaký vztah existuje?
  const { data: existing } = await admin
    .from('brand_members').select('id, status')
    .eq('brand_id', brandId).eq('provider_id', providerId).maybeSingle() as { data: { id: string; status: string } | null }

  if (existing) {
    if (existing.status === 'clen') return { success: false, error: 'Tenhle člověk už ve značce je.' }
    if (existing.status === 'pozvan') return { success: false, error: 'Pozvánka už odešla, čeká na přijetí.' }
    if (existing.status === 'zadost') {
      // Sám požádal → pozvánka od majitele = rovnou schválit.
      await (admin.from('brand_members') as any)
        .update({ status: 'clen', decided_at: new Date().toISOString() }).eq('id', existing.id)
      revalidatePath('/dashboard/znacka')
      return { success: true }
    }
    // odmítnuto → obnovíme jako novou pozvánku
    await (admin.from('brand_members') as any)
      .update({ status: 'pozvan', role_label: roleLabel ?? null, invited_by: user.id, decided_at: null })
      .eq('id', existing.id)
    revalidatePath('/dashboard/znacka')
    return { success: true }
  }

  const { error } = await (admin.from('brand_members') as any).insert({
    brand_id: brandId, provider_id: providerId,
    status: 'pozvan', role_label: roleLabel ?? null, invited_by: user.id,
  })
  if (error) {
    console.error('[inviteMember]', error)
    return { success: false, error: 'Nepodařilo se odeslat pozvánku.' }
  }
  revalidatePath('/dashboard/znacka')
  return { success: true }
}

// ── Poskytovatel POŽÁDÁ o připojení ─────────────────────────────
export async function requestJoin(brandId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: existing } = await admin
    .from('brand_members').select('id, status')
    .eq('brand_id', brandId).eq('provider_id', user.id).maybeSingle() as { data: { id: string; status: string } | null }

  if (existing) {
    if (existing.status === 'clen') return { success: false, error: 'Už jste členem téhle značky.' }
    if (existing.status === 'zadost') return { success: false, error: 'Žádost už čeká na schválení.' }
    if (existing.status === 'pozvan') {
      // Značka mě zvala → moje žádost = přijetí pozvánky.
      await (admin.from('brand_members') as any)
        .update({ status: 'clen', decided_at: new Date().toISOString() }).eq('id', existing.id)
      revalidatePath('/dashboard/znacka')
      return { success: true }
    }
    await (admin.from('brand_members') as any)
      .update({ status: 'zadost', decided_at: null }).eq('id', existing.id)
    revalidatePath('/dashboard/znacka')
    return { success: true }
  }

  const { error } = await (admin.from('brand_members') as any).insert({
    brand_id: brandId, provider_id: user.id, status: 'zadost', invited_by: user.id,
  })
  if (error) {
    console.error('[requestJoin]', error)
    return { success: false, error: 'Nepodařilo se odeslat žádost.' }
  }
  revalidatePath('/dashboard/znacka')
  return { success: true }
}

// ── Přijmout / odmítnout (dotčený poskytovatel u pozvánky,
//    majitel u žádosti). Sjednoceno: rozhodne ten, kdo je na řadě. ─
export async function respondMembership(memberId: string, accept: boolean): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: m } = await admin
    .from('brand_members').select('id, brand_id, provider_id, status')
    .eq('id', memberId).maybeSingle() as { data: { id: string; brand_id: string; provider_id: string; status: string } | null }
  if (!m) return { success: false, error: 'Členství neexistuje.' }

  const { data: brand } = await admin
    .from('brands').select('owner_id').eq('id', m.brand_id).maybeSingle() as { data: { owner_id: string } | null }
  const isOwner = brand?.owner_id === user.id
  const isProvider = m.provider_id === user.id

  // pozvánku řeší pozvaný, žádost řeší majitel
  if (m.status === 'pozvan' && !isProvider) return { success: false, error: 'Tohle rozhodnutí není na vás.' }
  if (m.status === 'zadost' && !isOwner) return { success: false, error: 'Tohle rozhodnutí není na vás.' }
  if (m.status === 'clen') return { success: false, error: 'Členství už je potvrzené.' }

  const { error } = await (admin.from('brand_members') as any)
    .update({ status: accept ? 'clen' : 'odmitnuto', decided_at: new Date().toISOString() })
    .eq('id', memberId)
  if (error) {
    console.error('[respondMembership]', error)
    return { success: false, error: 'Nepodařilo se uložit rozhodnutí.' }
  }
  revalidatePath('/dashboard/znacka')
  return { success: true }
}

// ── Odejít / odebrat člena ──────────────────────────────────────
// Odejít může sám člen; odebrat může majitel. Majitel sám sebe neodebere
// (musel by nejdřív značku smazat/předat) — pojistka proti osiřelé značce.
export async function removeMember(memberId: string): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: m } = await admin
    .from('brand_members').select('id, brand_id, provider_id')
    .eq('id', memberId).maybeSingle() as { data: { id: string; brand_id: string; provider_id: string } | null }
  if (!m) return { success: false, error: 'Členství neexistuje.' }

  const { data: brand } = await admin
    .from('brands').select('owner_id').eq('id', m.brand_id).maybeSingle() as { data: { owner_id: string } | null }
  const isOwner = brand?.owner_id === user.id
  const isSelf = m.provider_id === user.id

  if (!isOwner && !isSelf) return { success: false, error: 'Na tuhle akci nemáte právo.' }
  if (m.provider_id === brand?.owner_id) return { success: false, error: 'Majitel nemůže odejít — nejdřív značku smažte nebo předejte.' }

  // Karty tohoto člena odpojíme od značky (kartu samotnou nemažeme).
  await (admin.from('services') as any).update({ brand_id: null })
    .eq('provider_id', m.provider_id).eq('brand_id', m.brand_id)

  const { error } = await (admin.from('brand_members') as any).delete().eq('id', memberId)
  if (error) {
    console.error('[removeMember]', error)
    return { success: false, error: 'Nepodařilo se odebrat člena.' }
  }
  revalidatePath('/dashboard/znacka')
  return { success: true }
}

// ── Připnout / odepnout kartu ke značce ─────────────────────────
// Kartu smí pod značku dát jen její vlastník, a jen ke značce, kde je členem.
export async function setServiceBrand(serviceId: string, brandId: string | null): Promise<Result> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nejste přihlášený.' }

  const admin = getAdminClient()
  const { data: svc } = await admin
    .from('services').select('provider_id').eq('id', serviceId).maybeSingle() as { data: { provider_id: string } | null }
  if (!svc) return { success: false, error: 'Karta neexistuje.' }
  if (svc.provider_id !== user.id) return { success: false, error: 'Tohle není vaše karta.' }

  if (brandId) {
    // Musí být potvrzený člen značky.
    const { data: mem } = await admin
      .from('brand_members').select('status')
      .eq('brand_id', brandId).eq('provider_id', user.id).maybeSingle() as { data: { status: string } | null }
    if (mem?.status !== 'clen') return { success: false, error: 'Nejdřív se musíte ke značce připojit.' }
  }

  const { error } = await (admin.from('services') as any)
    .update({ brand_id: brandId }).eq('id', serviceId)
  if (error) {
    console.error('[setServiceBrand]', error)
    return { success: false, error: 'Nepodařilo se změnit značku karty.' }
  }
  revalidatePath('/dashboard/nabidky')
  revalidatePath('/dashboard/znacka')
  return { success: true }
}

// ═══════════════════════════════════════════════════════════════
// ČTECÍ FUNKCE
// ═══════════════════════════════════════════════════════════════

export type BrandMember = {
  member_id: string
  provider_id: string
  status: string
  role_label: string | null
  full_name: string | null
  company_name: string | null
  avatar_url: string | null
}

export type BrandDetail = {
  id: string; name: string; slug: string; bio: string | null
  logo_url: string | null; city: string | null; address: string | null
  is_active: boolean; owner_id: string
  members: BrandMember[]
}

// Detail značky + její členové (pro stránku značky a správu).
export async function getBrand(brandId: string): Promise<BrandDetail | null> {
  const admin = getAdminClient()
  const { data: brand } = await admin
    .from('brands').select('*').eq('id', brandId).maybeSingle() as { data: any }
  if (!brand) return null

  const { data: rawMembers } = await admin
    .from('brand_members')
    .select('id, provider_id, status, role_label')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: true }) as { data: any[] | null }

  const ids = (rawMembers ?? []).map(m => m.provider_id)
  const profiles: Record<string, any> = {}
  if (ids.length) {
    const { data: profs } = await admin
      .from('profiles').select('id, full_name, company_name, avatar_url').in('id', ids) as { data: any[] | null }
    for (const p of profs ?? []) profiles[p.id] = p
  }

  const members: BrandMember[] = (rawMembers ?? []).map(m => ({
    member_id: m.id,
    provider_id: m.provider_id,
    status: m.status,
    role_label: m.role_label,
    full_name: profiles[m.provider_id]?.full_name ?? null,
    company_name: profiles[m.provider_id]?.company_name ?? null,
    avatar_url: profiles[m.provider_id]?.avatar_url ?? null,
  }))

  return {
    id: brand.id, name: brand.name, slug: brand.slug, bio: brand.bio,
    logo_url: brand.logo_url, city: brand.city, address: brand.address,
    is_active: brand.is_active, owner_id: brand.owner_id, members,
  }
}

// Značky, kde je přihlášený uživatel majitelem nebo členem.
export async function getMyBrands(): Promise<Array<{ id: string; name: string; slug: string; role: string; status: string }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getAdminClient()
  const { data: mems } = await admin
    .from('brand_members').select('brand_id, status, role_label')
    .eq('provider_id', user.id) as { data: any[] | null }
  if (!mems?.length) return []

  const brandIds = mems.map(m => m.brand_id)
  const { data: brands } = await admin
    .from('brands').select('id, name, slug, owner_id').in('id', brandIds) as { data: any[] | null }

  return (brands ?? []).map(b => {
    const mem = mems.find(m => m.brand_id === b.id)
    return {
      id: b.id, name: b.name, slug: b.slug,
      role: b.owner_id === user.id ? 'majitel' : (mem?.role_label ?? 'člen'),
      status: mem?.status ?? 'clen',
    }
  })
}

// ── Vyhledat poskytovatele k pozvání (podle jména/firmy) ────────
// Vrací jen poskytovatele; hledá majitel značky, když chce někoho pozvat.
export async function searchProviders(query: string): Promise<Array<{ id: string; name: string; city: string | null }>> {
  const q = query.trim()
  if (q.length < 2) return []

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, company_name, city, is_provider')
    .eq('is_provider', true)
    .or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%`)
    .limit(8) as { data: any[] | null }

  return (data ?? [])
    .filter(p => p.id !== user.id)
    .map(p => ({ id: p.id, name: p.company_name || p.full_name || 'Poskytovatel', city: p.city ?? null }))
}

// ── Veřejná stránka značky (podle slugu) ────────────────────────
export type BrandPublic = {
  id: string; name: string; slug: string; bio: string | null
  logo_url: string | null; city: string | null; address: string | null
  members: Array<{ provider_id: string; name: string; avatar_url: string | null; role_label: string | null }>
  services: Array<{ id: string; title: string; category: string; city: string | null }>
}

export async function getBrandBySlug(slug: string): Promise<BrandPublic | null> {
  const admin = getAdminClient()
  const { data: brand } = await admin
    .from('brands').select('*').eq('slug', slug).eq('is_active', true).maybeSingle() as { data: any }
  if (!brand) return null

  // Potvrzení členové
  const { data: mems } = await admin
    .from('brand_members').select('provider_id, role_label')
    .eq('brand_id', brand.id).eq('status', 'clen') as { data: any[] | null }
  const providerIds = (mems ?? []).map(m => m.provider_id)

  const profiles: Record<string, any> = {}
  if (providerIds.length) {
    const { data: profs } = await admin
      .from('profiles').select('id, full_name, company_name, avatar_url').in('id', providerIds) as { data: any[] | null }
    for (const p of profs ?? []) profiles[p.id] = p
  }

  const members = (mems ?? []).map(m => ({
    provider_id: m.provider_id,
    name: profiles[m.provider_id]?.company_name || profiles[m.provider_id]?.full_name || 'Poskytovatel',
    avatar_url: profiles[m.provider_id]?.avatar_url ?? null,
    role_label: m.role_label,
  }))

  // Karty patřící pod značku (aktivní)
  const { data: svcs } = await admin
    .from('services').select('id, title, category, city, is_active')
    .eq('brand_id', brand.id).eq('is_active', true) as { data: any[] | null }
  const services = (svcs ?? []).map(s => ({ id: s.id, title: s.title, category: s.category, city: s.city ?? null }))

  return {
    id: brand.id, name: brand.name, slug: brand.slug, bio: brand.bio,
    logo_url: brand.logo_url, city: brand.city, address: brand.address,
    members, services,
  }
}

// ── Data pro BrandPicker: aktuální značka karty + moje značky ───
export async function getBrandPickerData(serviceId: string): Promise<{
  currentBrandId: string | null
  myBrands: Array<{ id: string; name: string }>
}> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { currentBrandId: null, myBrands: [] }

  const admin = getAdminClient()
  const { data: svc } = await admin
    .from('services').select('brand_id').eq('id', serviceId).maybeSingle() as { data: { brand_id: string | null } | null }

  // Značky, kde jsem POTVRZENÝ člen — jen do těch smím kartu dát.
  const { data: mems } = await admin
    .from('brand_members').select('brand_id').eq('provider_id', user.id).eq('status', 'clen') as { data: any[] | null }
  const ids = (mems ?? []).map(m => m.brand_id)
  let myBrands: Array<{ id: string; name: string }> = []
  if (ids.length) {
    const { data: brands } = await admin
      .from('brands').select('id, name').in('id', ids) as { data: any[] | null }
    myBrands = (brands ?? []).map(b => ({ id: b.id, name: b.name }))
  }

  return { currentBrandId: svc?.brand_id ?? null, myBrands }
}