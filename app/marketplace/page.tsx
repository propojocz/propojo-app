// app/marketplace/page.tsx
// Model „karta + ceník": výsledkem hledání je KARTA, ale hledání, cena a řazení
// čtou z ceníku (service_items). Karta ukazuje „od X Kč" a počet úkonů — proto
// se ke každé nalezené kartě dotáhnou její zveřejněné úkony a z nich se spočítá
// minimální cena (řazení/filtr ceny běží v kódu, ne v DB — u desítek karet stačí).
//
// PODOBA podle mockupu Mateje (20. 10. 2026): nahoře pásy ⚡ Bleskové termíny, ⭐ Dobře hodnocení
// a 🕒 Naposledy prohlížené (počítané z aktuálních výsledků hledání), pod nimi „Poskytovatelé“ – filtry
// vlevo, velké karty (mobil 1, tablet 2, počítač 3 vedle sebe). Brána předplatného odstraněna (model §18).

import { expandSearch, relevanceScore, searchPlan } from '@/lib/search'
import { accountBlocks } from '@/lib/booking/rules'
import { AUTOREF_CATALOG_VERSION } from '@/lib/booking/texts'
import { tierOf, trustCounts } from '@/lib/booking/trust'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { ServiceWithProvider, ServiceItem } from '@/types/database'
import ServiceCard, { type CardPriceItem } from '@/components/ui/ServiceCard'
import ServiceListSkeleton from '@/components/ui/ServiceListSkeleton'
import FilterBar from '@/components/ui/FilterBar'
import FilterSidebar from '@/components/ui/FilterSidebar'
import Link from 'next/link'
import { PlusCircle, Send, Star, Users, Zap } from 'lucide-react'
import MarketCarousel from '@/components/ui/MarketCarousel'
import MiniServiceCard, { type MiniCard } from '@/components/ui/MiniServiceCard'
import RecentlyViewed from '@/components/ui/RecentlyViewed'
import PageBlobs from '@/components/ui/PageBlobs'
import { cas, denKratce } from '@/lib/format'
import type { Metadata } from 'next'
import { haversineKm } from '@/lib/geo'
import ProviderInvite from '@/components/ui/ProviderInvite'

interface Props {
  searchParams: {
    category?: string
    city?: string
    q?: string
    sort?: string
    priceMin?: string
    priceMax?: string
    minRating?: string
    subcats?: string
    dosah?: string
    volno?: string
  }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'
  const { city, q } = searchParams
  let title = 'Marketplace živnostníků'
  if (city) title = `Živnostníci v ${city} – Propojo`
  if (q) title = `"${q}" – Propojo`
  return {
    title,
    description: 'Najděte ověřeného živnostníka ve vašem okolí.',
    openGraph: { title, description: 'Najděte ověřeného živnostníka ve vašem okolí.', url: `${APP_URL}/marketplace` },
    alternates: { canonical: `${APP_URL}/marketplace` },
  }
}

async function getCategories() {
  const supabase = createClient()
  const { data } = await supabase.from('categories').select('id, slug, name, icon, color').order('sort_order')
  return data ?? []
}

async function getSubcategories(categorySlug?: string) {
  if (!categorySlug) return []
  const supabase = createClient()
  const { data: cat } = await supabase.from('categories').select('id').eq('slug', categorySlug).single()
  if (!cat) return []
  const { data } = await supabase.from('subcategories').select('id, name').eq('category_id', (cat as any).id).eq('is_approved', true).order('name')
  return (data as { id: string; name: string }[]) ?? []
}

// Karty, jejichž podkategorie odpovídají textu (fulltext přes názvy podkategorií).
async function serviceIdsBySubcatText(q: string): Promise<string[]> {
  const supabase = createClient()
  const { data: subs } = await supabase.from('subcategories').select('id').eq('is_approved', true).ilike('name', `%${q}%`)
  const subIds = (subs ?? []).map((s: any) => s.id)
  if (subIds.length === 0) return []
  const { data: links } = await supabase.from('service_subcategories').select('service_id').in('subcategory_id', subIds)
  return Array.from(new Set((links ?? []).map((l: any) => l.service_id)))
}

// Karty, které mají ZVEŘEJNĚNÝ úkon odpovídající textu (zákazník hledá „střih",
// což je název úkonu v ceníku, ne název karty).
async function serviceIdsByItemText(q: string): Promise<string[]> {
  const supabase = createClient()
  const { data: hits } = await supabase
    .from('service_items').select('service_id').eq('is_active', true).ilike('name', `%${q}%`)
  return Array.from(new Set((hits ?? []).map((r: any) => r.service_id)))
}

// „Dobře hodnocení“ (Matej 20. 10. 2026): 4 poslední hodnocení od různých zákazníků s průměrem aspoň 4,8
const GOOD_LAST_REVIEWS = 4
const GOOD_MIN_AVG = 4.8
const CAROUSEL_MAX = 12

/** Štítek nejbližšího volna: „Dnes 14:00“ / „Zítra 9:00“ / „st 22. 10. 9:00“ (pražsky) */
function slotLabel(iso: string): string {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(d)
  const d = day(new Date(iso))
  if (d === day(new Date())) return `Dnes ${cas(iso)}`
  if (d === day(new Date(Date.now() + 86_400_000))) return `Zítra ${cas(iso)}`
  return `${denKratce(iso)} ${cas(iso)}`
}

async function ServiceList({
  category, city, q, sort, priceMin, priceMax, minRating, subcats, dosah, volno, sidebar,
}: {
  category?: string; city?: string; q?: string; sort?: string
  priceMin?: string; priceMax?: string; minRating?: string; subcats?: string; dosah?: string
  /** Filtr volného termínu: 'dnes' / 'tyden' */
  volno?: string
  /** Boční filtry (vykreslí se vlevo u nabídek) */
  sidebar: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const subIds = (subcats ?? '').split(',').filter(Boolean)

  let serviceIdsBySubcat: string[] | null = null
  if (subIds.length > 0) {
    const { data: links } = await supabase.from('service_subcategories').select('service_id').in('subcategory_id', subIds)
    serviceIdsBySubcat = Array.from(new Set((links ?? []).map((l: any) => l.service_id)))
    if (serviceIdsBySubcat.length === 0) serviceIdsBySubcat = ['00000000-0000-0000-0000-000000000000']
  }

  let query = supabase
    .from('services')
    .select(`*, profiles (id, full_name, display_name, company_name, avatar_url, rating, review_count, city, is_suspended, ico_verified, stripe_onboarding_done)`)
    .eq('is_active', true)

  if (serviceIdsBySubcat) {
    query = query.in('id', serviceIdsBySubcat)
  } else if (category) {
    const { data: cat } = await supabase.from('categories').select('id').eq('slug', category).single()
    if (cat) {
      const { data: subs } = await supabase.from('subcategories').select('id').eq('category_id', (cat as any).id).eq('is_approved', true)
      if (subs && subs.length > 0) {
        query = query.in('subcategory_id', subs.map((s: any) => s.id))
      } else {
        query = query.eq('category', category)
      }
    }
  }

  if (city) {
    const { data: provRows } = await supabase.from('profiles').select('id').ilike('city', `%${city}%`)
    const provIds = (provRows ?? []).map((p: any) => p.id)
    if (provIds.length > 0) {
      const idList = provIds.map((id: string) => `"${id}"`).join(',')
      query = query.or(`city.ilike.%${city}%,provider_id.in.(${idList})`)
    } else {
      query = query.ilike('city', `%${city}%`)
    }
  }

  // Chytřejší hledání (část B): bez diakritiky, kořen slova a příbuzná slova (lib/search.ts +
  // DB funkce search_service_ids). Když funkce v DB ještě není (SQL nespuštěné), hledá se postaru.
  let smartIds: string[] | null = null
  if (q) {
    const patterns = expandSearch(q)
    const { data: ids, error: rpcErr } = await supabase.rpc('search_service_ids' as any, { patterns } as any)
    if (!rpcErr && Array.isArray(ids)) {
      smartIds = (ids as any[]).map((x) => (typeof x === 'string' ? x : (x?.search_service_ids ?? x?.id))).filter(Boolean)
    }
  }

  if (q && smartIds) {
    query = query.in('id', smartIds.length > 0 ? smartIds : ['00000000-0000-0000-0000-000000000000'])
  } else if (q) {
    // Hledáme kartu podle: názvu karty, popisu, názvu podkategorie A názvu ÚKONU.
    const [subcatServiceIds, itemServiceIds] = await Promise.all([
      serviceIdsBySubcatText(q),
      serviceIdsByItemText(q),
    ])
    const extraIds = Array.from(new Set([...subcatServiceIds, ...itemServiceIds]))
    if (extraIds.length > 0) {
      const idList = extraIds.map((id) => `"${id}"`).join(',')
      query = query.or(`title.ilike.%${q}%,subtitle.ilike.%${q}%,description.ilike.%${q}%,id.in.(${idList})`)
    } else {
      query = query.or(`title.ilike.%${q}%,subtitle.ilike.%${q}%,description.ilike.%${q}%`)
    }
  }

  // Cenu už NEfiltrujeme/neřadíme v SQL (services.price je legacy). Řešíme níž v kódu
  // nad minimální cenou z úkonů. V SQL řadíme jen podle data, cenu doženeme po dotažení úkonů.
  query = query.order('created_at', { ascending: false })

  const { data: services } = await query.limit(60)

  // ── Poskytovatelé ve výsledcích (brána předplatného zrušena 20. 10. 2026, model §18) ──
  const candidateProviderIds = Array.from(
    new Set(((services as ServiceWithProvider[]) ?? []).map((s) => (s.profiles as any)?.id ?? s.provider_id))
  )

  const acceptsOnline = new Set<string>()
  // Štítky: „Nový na Propoju“ (žádná dokončená rezervace), „Důvěryhodný“ (20 dokončených bez problémů)
  const trustBadgeOf = new Map<string, 'new' | 'trusted'>()
  if (candidateProviderIds.length > 0) {
    // Stripe účty, pokyny a IČO se čtou přes service role (RLS „každý vidí jen svoje“)
    const adminDb = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Model v2: rezervovat s platbou jde jen u poskytovatele s funkčním Standard účtem.
    const { data: accs } = await adminDb
      .from('stripe_accounts')
      .select('provider_id, stripe_account_id, account_type, charges_enabled, card_payments, deauthorized_at')
      .in('provider_id', candidateProviderIds)
    // Vrstva 4: i pokyn k automatickým refundům a ověřené IČO
    const { data: consents } = await adminDb
      .from('booking_consents')
      .select('user_id')
      .in('user_id', candidateProviderIds)
      .eq('kind', 'provider_auto_refund_instruction')
      .eq('catalog_version', AUTOREF_CATALOG_VERSION)
    const withInstruction = new Set(((consents ?? []) as Array<{ user_id: string }>).map((c) => c.user_id))
    const { data: icoRows } = await adminDb.from('profiles').select('id, ico_verified').in('id', candidateProviderIds)
    const icoOk = new Set(((icoRows ?? []) as Array<{ id: string; ico_verified: boolean | null }>).filter((p) => p.ico_verified).map((p) => p.id))
    for (const a of (accs ?? []) as any[]) {
      const blocks = accountBlocks({
        accountId: a.stripe_account_id ?? null,
        accountType: a.account_type ?? null,
        deauthorizedAt: a.deauthorized_at ? new Date(a.deauthorized_at) : null,
        chargesEnabled: a.charges_enabled === true,
        cardPayments: a.card_payments ?? null,
        hasRefundInstruction: withInstruction.has(a.provider_id),
        icoVerified: icoOk.has(a.provider_id),
      })
      if (blocks.length === 0) acceptsOnline.add(a.provider_id)
    }
    const counts = await trustCounts(adminDb as any, candidateProviderIds)
    for (const [pid, c] of Array.from(counts.entries())) {
      if (tierOf(c.completed, c.problems) === 'trusted') trustBadgeOf.set(pid, 'trusted')
      else if (c.completed === 0) trustBadgeOf.set(pid, 'new')
    }
  }

  // ── HODNOCENÍ POČÍTÁME ŽIVĚ Z RECENZÍ ─────────────────────────────────
  // profiles.rating / review_count jsou uložené souhrny, které se nikdy
  // nedopočítávaly — poskytovatel s pěti recenzemi vypadal jako nehodnocený
  // a filtr podle hodnocení ho vyhodil úplně. Tady se čte pravda z tabulky
  // reviews jedním dotazem pro všechny karty naráz.
  const ratingOf = new Map<string, { avg: number; count: number }>()
  const goodProviders = new Set<string>()
  if (candidateProviderIds.length > 0) {
    const { data: revRows } = await supabase
      .from('reviews')
      .select('provider_id, rating, reviewer_id, created_at')
      .in('provider_id', candidateProviderIds) as { data: Array<{ provider_id: string; rating: number | null; reviewer_id: string | null; created_at: string }> | null }

    const soucet = new Map<string, { sum: number; count: number }>()
    for (const r of revRows ?? []) {
      const hodnota = Number(r.rating ?? 0)
      if (!r.provider_id || hodnota <= 0) continue
      const cur = soucet.get(r.provider_id) ?? { sum: 0, count: 0 }
      cur.sum += hodnota
      cur.count += 1
      soucet.set(r.provider_id, cur)
    }
    for (const [pid, v] of soucet) {
      ratingOf.set(pid, { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count })
    }

    // „Dobře hodnocení“: posledních 4 hodnocení od různých zákazníků, průměr aspoň 4,8
    const byProvider = new Map<string, Array<{ rating: number; reviewer: string; at: string }>>()
    for (const r of revRows ?? []) {
      if (!r.provider_id || !r.reviewer_id || Number(r.rating ?? 0) <= 0) continue
      ;(byProvider.get(r.provider_id) ?? byProvider.set(r.provider_id, []).get(r.provider_id)!).push({ rating: Number(r.rating), reviewer: r.reviewer_id, at: r.created_at })
    }
    for (const [pid, list] of byProvider) {
      const seen = new Set<string>()
      const last: number[] = []
      for (const r of list.sort((a, b) => b.at.localeCompare(a.at))) {
        if (seen.has(r.reviewer)) continue
        seen.add(r.reviewer)
        last.push(r.rating)
        if (last.length === GOOD_LAST_REVIEWS) break
      }
      if (last.length === GOOD_LAST_REVIEWS && last.reduce((a, b) => a + b, 0) / last.length >= GOOD_MIN_AVG) goodProviders.add(pid)
    }
  }

  /** Hodnocení poskytovatele — vždy živé, nikdy z profilu. */
  const hodnoceni = (s: any) => {
    const pid = (s.profiles as any)?.id ?? s.provider_id
    return ratingOf.get(pid) ?? { avg: 0, count: 0 }
  }

  let sorted = ((services as ServiceWithProvider[]) ?? []).filter((s) => {
    const pid = (s.profiles as any)?.id ?? s.provider_id
    return !!pid && (s.profiles as any)?.is_suspended !== true
  })

  if (minRating) {
    const min = Number(minRating)
    sorted = sorted.filter((s) => hodnoceni(s).avg >= min)
  }

  // ── Filtr "Jen v mém dosahu" ──
  if (dosah === '1' && city) {
    const { data: cityRow } = await supabase
      .from('obce').select('latitude, longitude').ilike('obec', city).limit(1).maybeSingle() as
      { data: { latitude: number; longitude: number } | null }

    if (cityRow) {
      sorted = sorted.filter((s: any) => {
        if (s.location_type === 'u_poskytovatele') return false
        if (!s.radius_km || s.city_lat == null || s.city_lng == null) return false
        const dist = haversineKm(cityRow.latitude, cityRow.longitude, s.city_lat, s.city_lng)
        return dist <= s.radius_km
      })
    }
  }

  // ── CENÍK: ke každé kartě dotáhneme zveřejněné úkony a spočítáme min cenu + počet ──
  const idsForItems = sorted.map((s) => s.id)
  const itemsByService: Record<string, ServiceItem[]> = {}
  if (idsForItems.length > 0) {
    const { data: itemRows } = await supabase
      .from('service_items')
      .select('*')
      .in('service_id', idsForItems)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    for (const it of (itemRows ?? []) as ServiceItem[]) {
      ;(itemsByService[it.service_id] ??= []).push(it)
    }
  }

  // Min cena z úkonů (jen model A s kladnou cenou). Karty bez ceněného úkonu → null (dohodou/nacenění).
  const minPriceOf = (sid: string): number | null => {
    const list = (itemsByService[sid] ?? []).filter(
      (i) => i.payment_model !== 'B' && i.price != null && i.price > 0
    )
    if (list.length === 0) return null
    return Math.min(...list.map((i) => Number(i.price)))
  }
  const itemCountOf = (sid: string): number => (itemsByService[sid] ?? []).length

  // Jednotka nejlevnějšího úkonu — do „od 500 Kč/m²" na kartě.
  const minUnitOf = (sid: string): string | null => {
    const list = (itemsByService[sid] ?? []).filter(
      (i) => i.payment_model !== 'B' && i.price != null && i.price > 0
    )
    if (list.length === 0) return null
    const nej = list.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b))
    return nej.price_unit ?? null
  }

  // Pár úkonů do náhledu ceníku — karta je ukáže MÍSTO fotky, když poskytovatel
  // žádnou nemá. Prázdná plocha v mřížce vypadá jako chyba; ceník nese informaci.
  const priceItemsOf = (sid: string): CardPriceItem[] =>
    (itemsByService[sid] ?? [])
      .filter((i) => i.payment_model !== 'B')
      .slice(0, 3)
      .map((i) => ({ name: i.name, price: i.price ?? null, unit: i.price_unit ?? null }))

  // Filtr ceny podle min ceny úkonů. Karty bez ceny (dohodou/nacenění) projdou,
  // jen když uživatel cenový filtr nepoužil — jinak by zmizely neprávem.
  const hasPriceFilter = !!priceMin || !!priceMax
  if (hasPriceFilter) {
    const lo = priceMin ? Number(priceMin) : 0
    const hi = priceMax ? Number(priceMax) : Infinity
    sorted = sorted.filter((s) => {
      const mp = minPriceOf(s.id)
      if (mp == null) return false
      return mp >= lo && mp <= hi
    })
  }

  // Volné termíny karet (budoucí okna) – potřeba už pro řazení „Nejdřív volno“ a filtr volna.
  // Okno ↔ karta je přes slot_services; časy vzestupně, první = nejbližší volný termín karty.
  const freeSlotServices = new Set<string>()
  const slotTimesOf: Record<string, string[]> = {}
  {
    // Jen karty, které berou online rezervace – jinak by termín řadil kartu dopředu, i když na ní není vidět
    const ids = sorted.filter((s) => acceptsOnline.has((s.profiles as any)?.id ?? s.provider_id)).map((s) => s.id)
    if (ids.length > 0) {
      const { data: slotRows } = await supabase
        .from('availability_slots')
        .select('id, starts_at, slot_services!inner(service_id)')
        .eq('status', 'volno')
        .eq('pending_confirm', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .in('slot_services.service_id', ids) as { data: any[] | null }
      for (const r of (slotRows ?? [])) {
        for (const l of (r.slot_services ?? [])) {
          if (!l.service_id) continue
          freeSlotServices.add(l.service_id)
          ;(slotTimesOf[l.service_id] ??= []).push(r.starts_at)
        }
      }
    }
  }
  const earliestOf = (id: string): number => {
    const t = slotTimesOf[id]?.[0]
    return t ? new Date(t).getTime() : Number.POSITIVE_INFINITY
  }

  // Filtr volného termínu: dnes (pražský den) / do týdne
  if (volno === 'dnes' || volno === 'tyden') {
    const pragueDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(d)
    const today = pragueDay(new Date())
    const weekEnd = Date.now() + 7 * 24 * 3600_000
    sorted = sorted.filter((s) => (slotTimesOf[s.id] ?? []).some((t) =>
      volno === 'dnes' ? pragueDay(new Date(t)) === today : new Date(t).getTime() <= weekEnd))
  }

  // Výchozí řazení „⚡ Nejdřív volno“: karta s nejbližším volným termínem první, bez termínu na konec.
  // Při hledání nejdřív podle shody s dotazem, při stejné shodě podle nejbližšího termínu.
  const relevance = new Map<string, number>()
  if (q && smartIds && (!sort || sort === 'volno')) {
    const plan = searchPlan(q)
    for (const s of sorted) {
      const items = (itemsByService[s.id] ?? []).map((i) => i.name).join(' ')
      relevance.set(s.id, relevanceScore(plan, {
        strong: [s.title, (s as any).subtitle, s.category, items].filter(Boolean).join(' '),
        weak: (s as any).description ?? '',
        category: s.category ?? null,
      }))
    }
  }
  if (!sort || sort === 'volno') {
    sorted = [...sorted].sort((a, b) =>
      ((relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0)) || (earliestOf(a.id) - earliestOf(b.id)))
  }

  // Řazení
  if (sort === 'nejlevnejsi' || sort === 'nejdrazsi') {
    const dir = sort === 'nejlevnejsi' ? 1 : -1
    sorted = [...sorted].sort((a, b) => {
      const pa = minPriceOf(a.id)
      const pb = minPriceOf(b.id)
      // Karty bez ceny řadíme vždy na konec, ať nemíchají žebříček.
      if (pa == null && pb == null) return 0
      if (pa == null) return 1
      if (pb == null) return -1
      return (pa - pb) * dir
    })
  } else if (sort === 'hodnoceni') {
    sorted = [...sorted].sort((a, b) => hodnoceni(b).avg - hodnoceni(a).avg)
  }

  // ── ROZMANITOST VÝSLEDKŮ ──────────────────────────────────────
  // Salon s pěti lidmi (nebo jeden poskytovatel s pěti kartami) by jinak
  // obsadil celou první obrazovku a menší živnostníci by se neukázali.
  // Prostřídáme karty tak, aby po sobě nešly víc než DVĚ od stejného
  // poskytovatele/značky. Pořadí uvnitř skupiny zůstává — kdo byl lepší,
  // je pořád první; jen se to prokládá.
  const MAX_ZA_SEBOU = 2
  {
    const klic = (s: any) => s.brand_id ?? (s.profiles as any)?.id ?? s.provider_id ?? s.id
    // Rozdělíme do front podle poskytovatele, pořadí zachováme.
    const fronty = new Map<string, any[]>()
    const poradi = new Map<any, number>(sorted.map((s, i) => [s, i]))
    for (const s of sorted) {
      const k = String(klic(s))
      if (!fronty.has(k)) fronty.set(k, [])
      fronty.get(k)!.push(s)
    }
    // Když je jen jeden poskytovatel, není co střídat.
    if (fronty.size > 1) {
      const vysledek: any[] = []
      let poslednKlic: string | null = null
      let poRade = 0
      while (vysledek.length < sorted.length) {
        // Fronty podle pořadí jejich první karty – zvolené řazení (nejdřív volno, cena…) musí
        // zůstat platit; dřív se bralo „nejdelší fronta první“ a řazení se tím rozbilo.
        const kandidati = [...fronty.entries()]
          .filter(([, v]) => v.length > 0)
          .sort((a, b) => (poradi.get(a[1][0]) ?? 0) - (poradi.get(b[1][0]) ?? 0))
        if (kandidati.length === 0) break

        // Přednost má fronta, která neporušuje limit za sebou.
        let vybrany = kandidati.find(([k]) => !(k === poslednKlic && poRade >= MAX_ZA_SEBOU))
        if (!vybrany) vybrany = kandidati[0]   // nezbylo nic jiného

        const [k, fronta] = vybrany
        vysledek.push(fronta.shift())
        poRade = k === poslednKlic ? poRade + 1 : 1
        poslednKlic = k
      }
      sorted = vysledek
    }
  }

  if (sorted.length === 0) {
    const params = new URLSearchParams()
    const hledane = q || category
    if (hledane) params.set('category', hledane)
    if (city) params.set('city', city)
    const poptavkaHref = `/poptavky/nova${params.toString() ? `?${params.toString()}` : ''}`
    const categorySlug = params.get('category')
    let hledanyObor: string | undefined
    if (categorySlug) {
      const { data: cat } = await supabase
        .from('categories')
        .select('name')
        .eq('slug', categorySlug)
        .maybeSingle() as { data: { name: string } | null }
      hledanyObor = cat?.name ?? undefined
    }
    const hledaneMesto = params.get('city') ?? undefined

    return (
      <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">{sidebar}</aside>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-14 text-center">
          <h3 className="mb-2 text-xl font-bold text-slate-800">Zatím tu nikoho nemáme</h3>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-500">
            Pro zadaná kritéria jsme nenašli žádnou nabídku. Zanechte nám poptávku — uvidí ji
            ověření řemeslníci a mohou se vám ozvat sami.
          </p>
          <Link
            href={poptavkaHref}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-bold text-white transition hover:bg-emerald-600"
          >
            <Send className="h-4 w-4" /> Zanechat poptávku
          </Link>
        </div>

        <ProviderInvite category={hledanyObor} city={hledaneMesto} />
      </div>
      </div>
    )
  }

  const serviceIds = sorted.map((s) => s.id)
  const providerIds = Array.from(new Set(sorted.map((s) => (s.profiles as any)?.id ?? s.provider_id)))
  const catSlugs = Array.from(new Set(sorted.map((s) => s.category).filter(Boolean)))

  const { data: catRows } = catSlugs.length > 0
    ? await supabase.from('categories').select('slug, name').in('slug', catSlugs)
    : { data: [] as any[] }
  const catName: Record<string, string> = Object.fromEntries((catRows ?? []).map((c: any) => [c.slug, c.name]))

  const { data: subLinks } = serviceIds.length > 0
    ? await supabase.from('service_subcategories').select('service_id, subcategories(name)').in('service_id', serviceIds)
    : { data: [] as any[] }
  const subsByService: Record<string, string[]> = {}
  for (const l of (subLinks ?? []) as any[]) {
    const nm = l.subcategories?.name
    if (!nm) continue
    ;(subsByService[l.service_id] ??= []).push(nm)
  }

  // Volné termíny karet (freeSlotServices, slotTimesOf) jsou načtené výš – před řazením.

  const favSet = new Set<string>()
  if (user && providerIds.length > 0) {
    const { data: favRows } = await supabase
      .from('favorites').select('provider_id').eq('user_id', user.id).in('provider_id', providerIds)
    for (const r of (favRows ?? []) as any[]) favSet.add(r.provider_id)
  }

  // ── Pásy nahoře (z aktuálních výsledků, takže respektují hledání i obec) ──
  const imageOf = (s: any): string | null => ((s.gallery ?? [])[0] ?? s.image_url ?? null)
  const priceTextOf = (s: any): string => {
    const mp = minPriceOf(s.id)
    if (mp != null) return `od ${Number(mp).toLocaleString('cs-CZ')} Kč`
    const its = itemsByService[s.id] ?? []
    return its.length > 0 && its.every((i: any) => i.payment_model === 'B' || i.offer_kind === 'B') ? 'Výjezd a nacenění' : 'Cena dohodou'
  }
  const miniOf = (s: any, withSlot: boolean): MiniCard => {
    const pid = (s.profiles as any)?.id ?? s.provider_id
    const r = hodnoceni(s)
    const slots = acceptsOnline.has(pid) ? (slotTimesOf[s.id] ?? []) : []
    return {
      id: s.id,
      title: s.title,
      image: imageOf(s),
      place: s.city ?? null,
      priceText: priceTextOf(s),
      slotLabel: withSlot && slots[0] ? slotLabel(slots[0]) : null,
      rating: withSlot ? null : (r.count > 0 ? r : null),
      hasSlots: slots.length > 0,
    }
  }
  // ⚡ nejbližší volné termíny, jedna karta = jeden řádek
  const flash = sorted
    .filter((s: any) => acceptsOnline.has((s.profiles as any)?.id ?? s.provider_id) && (slotTimesOf[s.id] ?? []).length > 0)
    .sort((a: any, b: any) => earliestOf(a.id) - earliestOf(b.id))
    .slice(0, CAROUSEL_MAX)
    .map((s: any) => miniOf(s, true))
  // ⭐ náhodně poskytovatelé z výsledků s dobrým posledním hodnocením (jedna karta na poskytovatele)
  const ratedPick = new Map<string, any>()
  for (const s of sorted as any[]) {
    const pid = (s.profiles as any)?.id ?? s.provider_id
    if (goodProviders.has(pid) && !ratedPick.has(pid)) ratedPick.set(pid, s)
  }
  const rated = Array.from(ratedPick.values())
    .map((s) => ({ s, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, CAROUSEL_MAX)
    .map(({ s }) => miniOf(s, false))

  return (
    <div className="space-y-9">
      {flash.length >= 2 && (
        <MarketCarousel title="Bleskové termíny" icon={<Zap className="h-6 w-6 fill-orange-400 text-orange-500" />}
          subtitle={city ? 'Volné termíny ve vašem okolí' : 'Nejbližší volné termíny'} count={flash.length}>
          {flash.map((c) => <MiniServiceCard key={c.id} card={c} />)}
        </MarketCarousel>
      )}
      {rated.length >= 2 && (
        <MarketCarousel title="Dobře hodnocení" icon={<Star className="h-6 w-6 fill-amber-400 text-amber-400" />}
          subtitle="Poslední hodnocení 4,8 a víc" count={rated.length}>
          {rated.map((c) => <MiniServiceCard key={c.id} card={c} />)}
        </MarketCarousel>
      )}
      <RecentlyViewed />

      <section>
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            <Users className="h-6 w-6 text-sky-500" /> {city ? 'Poskytovatelé ve vašem okolí' : 'Poskytovatelé'}
          </h2>
          <p className="text-sm text-slate-500">
            Nalezeno <strong className="text-slate-800">{sorted.length}</strong> {sorted.length === 1 ? 'nabídka' : sorted.length < 5 ? 'nabídky' : 'nabídek'}
          </p>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-64 lg:shrink-0">{sidebar}</aside>
          {/* Velké karty: mobil 1, tablet 2, počítač 3 vedle sebe */}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((service, i) => {
              const pid = (service.profiles as any)?.id ?? service.provider_id
              // Kartě předáváme profil s ŽIVÝM hodnocením — uložené profiles.rating
              // je nespolehlivé (viz výpočet výše), takže ho tady přebijeme.
              const r = hodnoceni(service)
              const serviceSHodnocenim = {
                ...service,
                profiles: service.profiles
                  ? { ...(service.profiles as any), rating: r.avg, review_count: r.count }
                  : service.profiles,
              }
              return (
                <ServiceCard
                  key={service.id}
                  service={serviceSHodnocenim as typeof service}
                  index={i}
                  variant="large"
                  hideBadges
                  categoryName={catName[service.category]}
                  subcatNames={subsByService[service.id] ?? []}
                  hasFreeSlot={freeSlotServices.has(service.id)}
                  freeSlots={slotTimesOf[service.id] ?? []}
                  isFavorited={favSet.has(pid)}
                  isLoggedIn={!!user}
                  minItemPrice={minPriceOf(service.id)}
                  minItemUnit={minUnitOf(service.id)}
                  itemCount={itemCountOf(service.id)}
                  gallery={(service as any).gallery ?? []}
                  priceItems={priceItemsOf(service.id)}
                  acceptsOnline={acceptsOnline.has(pid)}
                  trustBadge={trustBadgeOf.get(pid) ?? null}
                />
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

export default async function MarketplacePage({ searchParams }: Props) {
  const { category, city, q, sort, priceMin, priceMax, minRating, subcats, dosah, volno } = searchParams
  const categories = await getCategories()
  const subcategories = await getSubcategories(category)

  const sidebar = (
    <FilterSidebar
      categories={categories}
      subcategories={subcategories}
      activeCategory={category}
      currentPriceMin={priceMin}
      currentPriceMax={priceMax}
      currentMinRating={minRating}
      currentSubcats={subcats}
      currentCity={city}
      currentDosah={dosah}
      currentVolno={volno}
      hideMobileTrigger
    />
  )

  return (
    <main className="relative isolate min-h-screen bg-slate-50">
      {/* Barevné kruhy v pozadí jako na úvodní stránce (mockup) */}
      <PageBlobs />
      <div className="mx-auto max-w-7xl px-4 pb-5 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Najděte zkušeného <span className="text-emerald-600">řemeslníka</span>
            </h1>
            <p className="mt-1.5 text-slate-500">Ověřené IČO, volné termíny a platba kartou.</p>
          </div>
          <Link href="/pridat-sluzbu" className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-600 sm:self-auto">
            <PlusCircle className="h-5 w-5" /> Nabídnout službu
          </Link>
        </div>
      </div>

      <FilterBar currentCity={city} currentSort={sort} currentQ={q} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Suspense
          key={`${category}-${city}-${q}-${sort}-${priceMin}-${priceMax}-${minRating}-${subcats}-${dosah}-${volno}`}
          fallback={<ServiceListSkeleton />}
        >
          <ServiceList category={category} city={city} q={q} sort={sort} priceMin={priceMin} priceMax={priceMax} minRating={minRating} subcats={subcats} dosah={dosah} volno={volno} sidebar={sidebar} />
        </Suspense>
      </div>
    </main>
  )
}