'use client'
// components/forms/ServiceForm.tsx — model „karta + ceník"
//
// PRVNÍ KROK JE ZÁMĚRNĚ HOLÝ (zjednodušeno 22. 10. 2026, Matej: „nic dvakrát“).
// Poskytovatel napíše, co dělá (jedno pole najde obor i kategorii), vybere jednu
// adresu (předvyplněná z profilu) a jde dál. Název karty se předvyplní jménem
// z profilu – obor se tak nepíše do názvu, oboru i ceníku znovu. Popis, podtitul, telefon
// a fotky jsou schované pod „Doplnit teď", protože nic z toho není potřeba
// k tomu, aby nabídka fungovala. Zbytek si Propojo poskládá samo: tagy
// z podkategorií, cenu z ceníku, nejbližší termín z kalendáře.
//
// Cena/model/délka/záloha/materiál/storno se sem NEPÍŠE — nese je ceník
// (service_items) přes komponentu PriceList.
//
// Dvě fáze ukládání:
//  1) Vyplníte základ → „Pokračovat na služby a ceny" → nabídka dostane id
//  2) Otevře se ceník, přidáte úkony → termíny → zveřejnění
// V režimu edit je nabídka rovnou ve fázi 2 (id už existuje).

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronDown, Store, Home, Eye, ListChecks, CalendarDays, Plus, Sparkles, Search } from 'lucide-react'
import { createService, updateService } from '@/lib/actions/services'
import { matchProfessions } from '@/lib/professions'
import { createOwnSubcategory } from '@/lib/actions/subcategories'
import type { Service, ServiceItem } from '@/types/database'
import { createClient, getBrowserUser } from '@/lib/supabase/client'
import ServiceCard from '@/components/ui/ServiceCard'
import ImageUpload from '@/components/ui/ImageUpload'
import GalleryUpload from '@/components/ui/GalleryUpload'
import AddressInput from '@/components/ui/AddressInput'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import PriceList from '@/components/ui/PriceList'
import ServiceHours from '@/components/forms/ServiceHours'
import InfoTip from '@/components/ui/InfoTip'
import { CategoryIcon } from '@/lib/categoryIcons'
import type { ServiceTypeOption } from '@/components/ui/ServiceItemEditor'

const schema = z.object({
  title: z.string().min(3, 'Napište název nabídky (aspoň 3 znaky)').max(100),
  subtitle: z.string().max(80).nullable().optional(),
  // Popis už NENÍ povinný. Kdo ho nevyplní, dostane větu složenou z oboru
  // a města — prázdná karta by na detailu vypadala opuštěně.
  description: z.string().max(2000).nullable().optional(),
  category: z.string().min(1, 'Vyberte kategorii'),
  subcategory_id: z.string().optional(),
  subcategory_ids: z.array(z.string()).optional(),
  service_type: z.string().optional(),
  phone: z.string().max(30).nullable().optional(),
  city: z.string().min(2, 'Vyberte adresu ze seznamu (nebo aspoň obec)').max(100),
  city_lat: z.number().nullable().optional(),
  city_lng: z.number().nullable().optional(),
  image_url: z.string().optional(),
  gallery: z.array(z.string()).optional(),

  // Kde se služba vykonává
  location_type: z.enum(['u_poskytovatele', 'u_zakaznika']),
  radius_km: z.number().int().min(1).max(300).nullable().optional(),

  // Adresa provozovny (jen u_poskytovatele)
  address: z.string().max(200).nullable().optional(),
  address_lat: z.number().nullable().optional(),
  address_lng: z.number().nullable().optional(),
  address_public: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

interface Category {
  id: string; slug: string; name: string; icon: string; color: string
  subcategories: { id: string; slug: string; name: string; synonyms?: string[] | null; service_types: { id: string; name: string }[] }[]
}

interface Props {
  mode: 'create' | 'edit'
  initialData?: Service
  onSuccess?: (id: string) => void
  /** Má poskytovatel aktivní předplatné? Bez něj se nabídka po uložení nezveřejní. */
  hasActiveSub?: boolean
}

export default function ServiceForm({ mode, initialData, onSuccess, hasActiveSub = true }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [radiusExpanded, setRadiusExpanded] = useState(false)
  // Krokovaný průchod: 1 Co nabízíte → 2 Služby a ceny → 3 Termíny → 4 Zveřejnění.
  const [krok, setKrok] = useState(1)
  // Nepovinná část prvního kroku (podtitul, popis, telefon, fotky).
  const [detailyOtevrene, setDetailyOtevrene] = useState(mode === 'edit')
  // Karta bez adresy dědí adresu z profilu. Tenhle přepínač otevře pole,
  // když má nabídka adresu vlastní (druhá pobočka).
  const [vlastniAdresa, setVlastniAdresa] = useState(false)
  // Bez přesné adresy (nový dům, nechci ji zadávat) → jen obec
  const [jenObec, setJenObec] = useState(false)
  // Hledání oboru jedním polem („stavba pergol“ → obor i kategorie)
  const [oborQ, setOborQ] = useState('')
  // Celá mřížka kategorií (volná ruka) – po výběru oboru se sbalí
  const [vsechnyKategorie, setVsechnyKategorie] = useState(false)
  // Vlastní podkategorie („Nevidím svou službu")
  const [ownSubOpen, setOwnSubOpen] = useState(false)
  const [ownSubName, setOwnSubName] = useState('')
  const [ownSubSaving, setOwnSubSaving] = useState(false)
  const [ownSubErr, setOwnSubErr] = useState('')
  // Vlastní podkategorie přidané v tomhle sezení — ať je vidět hned,
  // než se překreslí seznam z databáze.
  const [ownSubs, setOwnSubs] = useState<{ id: string; name: string }[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [profile, setProfile] = useState<any>(null)

  // ID uložené nabídky — řídí fázi. V edit režimu je hned, v create až po uložení.
  const [serviceId, setServiceId] = useState<string | null>(initialData?.id ?? null)
  // Položky ceníku (fáze 2)
  const [items, setItems] = useState<ServiceItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  const router = useRouter()
  const init = initialData as any

  const { register: f, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? {
      title: initialData.title,
      subtitle: init.subtitle ?? null,
      description: initialData.description ?? '',
      category: initialData.category,
      phone: init.phone ?? null,
      city: initialData.city,
      city_lat: init.city_lat ?? null,
      city_lng: init.city_lng ?? null,
      image_url: initialData.image_url ?? '',
      gallery: init.gallery ?? [],
      subcategory_ids: (init.subcategory_ids ?? (init.subcategory_id ? [init.subcategory_id] : [])),
      // Karty se starym 'oboji' preklapime na vyjezd: poskytovatel bez adresy
      // je horsi chyba nez adresa navic.
      location_type: (init.location_type === 'u_poskytovatele' ? 'u_poskytovatele' : 'u_zakaznika') as 'u_poskytovatele' | 'u_zakaznika',
      radius_km: init.radius_km ?? null,
      address: init.address ?? null,
      address_lat: init.address_lat ?? null,
      address_lng: init.address_lng ?? null,
      address_public: init.address_public ?? true,
    } : {
      subtitle: null,
      description: '',
      phone: null,
      subcategory_ids: [],
      city_lat: null,
      city_lng: null,
      gallery: [],
      location_type: 'u_zakaznika',
      radius_km: null,
      address: null,
      address_lat: null,
      address_lng: null,
      address_public: true,
    },
  })

  const selectedCategory = watch('category')
  const selectedSubIds: string[] = watch('subcategory_ids') ?? []
  const locationType = watch('location_type')

  // Načti kategorie z DB
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => { setCategories(data.categories ?? []); setLoadingCats(false) })
      .catch(() => setLoadingCats(false))
  }, [])

  // Načti vlastní profil (pro živý náhled karty)
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const user = await getBrowserUser(supabase)
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, company_name, avatar_url, city, ico_verified, rating, review_count, address, address_lat, address_lng, address_public')
        .eq('id', user.id)
        .single()
      setProfile(data)

      // Město z profilu předvyplníme, ať člověk nepíše to, co už jednou zadal.
      // Jen když pole ještě prázdné je — v úpravách nabídky nic nepřepisujeme.
      const mesto = (data as any)?.city
      if (mode === 'create' && mesto && !watch('city')) {
        setValue('city', mesto, { shouldValidate: true })
        // Souřadnice z adresy profilu (vzdálenost a dojezd i bez další adresy na kartě)
        if ((data as any)?.address_lat != null && (data as any)?.address_lng != null) {
          setValue('city_lat', Number((data as any).address_lat))
          setValue('city_lng', Number((data as any).address_lng))
        }
      }

    }
    load()
  }, [])

  // Načti položky ceníku, kdykoli máme serviceId (fáze 2)
  const loadItems = useCallback(async () => {
    if (!serviceId) return
    setLoadingItems(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('service_items')
      .select('*')
      .eq('service_id', serviceId)
      .order('sort_order', { ascending: true })
    setItems((data as ServiceItem[]) ?? [])
    setLoadingItems(false)
  }, [serviceId])

  useEffect(() => { loadItems() }, [loadItems])

  const activeCat = categories.find(c => c.slug === selectedCategory)

  // ── PROFESE (23. 10. 2026, Matej: lidé hledají „malíř“, „barber“, „advokát“) ──
  // Podkategorie = profese. Nabídka má 1 hlavní profesi (určuje kategorii karty) a nejvýš 2 další,
  // klidně z jiné kategorie (hodinový manžel + malíř). Vybírá se jedním polem s našeptávačem.
  const MAX_PROFESI = 3
  const allProfs = categories.flatMap(c => c.subcategories.map(sub => ({ ...sub, catSlug: c.slug, catName: c.name })))
  const profById = (id: string) => allProfs.find(p => p.id === id)
  const oborHits = matchProfessions(oborQ, allProfs, 8)
  const setProfese = (ids: string[]) => {
    setValue('subcategory_ids', ids)
    setValue('subcategory_id', ids[0] ?? '')
    // Kategorie karty = kategorie hlavní profese
    const main = ids[0] ? (profById(ids[0])?.catSlug ?? (ownSubs.find(o => o.id === ids[0]) ? selectedCategory : '')) : ''
    if ((main ?? '') !== (selectedCategory ?? '')) {
      setValue('category', main ?? '', { shouldValidate: true })
      setValue('service_type', '')
    }
  }
  const pickObor = (_catSlug: string, subId: string) => {
    if (!selectedSubIds.includes(subId) && selectedSubIds.length < MAX_PROFESI) setProfese([...selectedSubIds, subId])
    setOborQ('')
  }
  const toggleSub = (id: string) => {
    if (selectedSubIds.includes(id)) setProfese(selectedSubIds.filter(x => x !== id))
    else if (selectedSubIds.length < MAX_PROFESI) setProfese([...selectedSubIds, id])
  }
  // Procházení seznamu (volná ruka) – kategorie, ve které se právě listuje
  const [browseCat, setBrowseCat] = useState<string | null>(null)
  const browseCategory = categories.find(c => c.slug === (browseCat ?? selectedCategory))

  // Ceník: jeden seznam, úkony se přiřadí hlavní profesi (kvůli hledání)
  const subcatsForPriceList = selectedSubIds[0]
    ? [{ id: selectedSubIds[0], name: profById(selectedSubIds[0])?.name ?? ownSubs.find(o => o.id === selectedSubIds[0])?.name ?? '', isOwn: !profById(selectedSubIds[0]) }]
    : []

  // Běžné úkony vybraných profesí – nabídnou se v ceníku jedním klepnutím
  const serviceTypesForItems: ServiceTypeOption[] = selectedSubIds
    .flatMap(id => profById(id)?.service_types ?? [])
    .map(st => ({ id: st.id, name: st.name }))

  // Názvy vybraných profesí — náhled, souhrn a řádek pod názvem
  const previewSubNames = selectedSubIds
    .map(id => profById(id)?.name ?? ownSubs.find(o => o.id === id)?.name ?? '')
    .filter(Boolean)
  const hlavniObor = previewSubNames[0] ?? activeCat?.name ?? ''

  // Řádek pod názvem = profese: „Malíř a natěrač · Hodinový manžel“. Poskytovatel
  // nemá vymýšlet marketingovou větu — appka ví, co dělá, z toho, co vybral.
  const podtitulZOboru = previewSubNames.slice(0, 3).join(' · ')
  // Přepsal si ho ručně? Pak platí jeho verze.
  const vlastniPodtitul = (watch('subtitle') ?? '').trim()

  // ── Vlastní podkategorie („Nevidím svou službu") ──
  // Vytvoří se jako NESCHVÁLENÁ: na kartě funguje hned, do zákaznického
  // vyhledávání spadne, až ji projdeme v adminu.
  const saveOwnSub = async () => {
    const cat = browseCategory
    if (!cat) { setOwnSubErr('Vyberte nejdřív kategorii.'); return }
    const name = ownSubName.trim()
    if (name.length < 3) { setOwnSubErr('Napište název — aspoň tři znaky.'); return }

    setOwnSubSaving(true); setOwnSubErr('')
    const res = await createOwnSubcategory({ category_id: cat.id, name })
    setOwnSubSaving(false)

    if (!res.success) { setOwnSubErr(res.error); return }

    // Rovnou ji zaškrtneme, ať nemusí klikat dvakrát.
    setOwnSubs(prev => prev.some(o => o.id === res.id) ? prev : [...prev, { id: res.id, name: res.name }])
    if (!selectedSubIds.includes(res.id) && selectedSubIds.length < MAX_PROFESI) {
      const next = [...selectedSubIds, res.id]
      setValue('subcategory_ids', next)
      setValue('subcategory_id', next[0] ?? '')
      // Vlastní profese jako první → kategorie karty = kategorie, ve které vznikla
      if (next.length === 1) setValue('category', cat.slug, { shouldValidate: true })
    }
    setOwnSubName(''); setOwnSubOpen(false)
  }

  // ── Uložení NABÍDKY ──
  const onSubmit = async (data: FormValues) => {
    setSubmitState('loading'); setErrorMsg('')

    // Popis je volitelný a NEDOPLŇUJEME ho automaticky. Generovaná věta typu
    // „Kadeřnictví ve Vsetíně nabízí kvalitní služby" vypadá uměle a na dvaceti
    // profilech vedle sebe je vidět, že ji psal stroj. Bez popisu se blok
    // „O nabídce" na detailu prostě nezobrazí.
    const popis = (data.description ?? '').trim()

    // Podtitul si Propojo skládá samo z vybraných oborů — poskytovatel ho
    // nevyplňuje. Kdo si ho přepsal ručně, má přednost.
    const podtitul = (data.subtitle ?? '').trim() || podtitulZOboru || null

    // Výjezd: přesná adresa slouží jen k výpočtům, veřejně jen obec (Matej 22. 10. 2026)
    const payload = {
      ...data, description: popis, subtitle: podtitul,
      ...(data.location_type === 'u_zakaznika' ? { address_public: false } : {}),
    }

    const result = serviceId
      ? await updateService(serviceId, payload as any)
      : await createService(payload as any)

    if (result.success) {
      setSubmitState('success')
      setServiceId(result.id)
      onSuccess?.(result.id)
      setTimeout(() => setSubmitState('idle'), 2500)
      // Nabídka má id → posuneme se rovnou na ceník. Bez tohohle kroku
      // řemeslník uložil a nevěděl, že má pokračovat.
      if (mode === 'create') {
        setKrok(2)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } else {
      setSubmitState('error'); setErrorMsg(result.error); setTimeout(() => setSubmitState('idle'), 4000)
    }
  }

  const finish = () => {
    router.push('/dashboard/nabidky')
    router.refresh()
  }

  // ── Živý náhled karty ──
  const wTitle = watch('title') ?? ''
  const wCity = watch('city') ?? ''
  const wImage = watch('image_url') ?? ''

  // Cena v náhledu se bere z nejlevnějšího zveřejněného úkonu ceníku (fallback: bez ceny).
  const activeItems = items.filter(i => i.is_active)
  const cheapest = activeItems
    .filter(i => i.payment_model !== 'B' && i.price != null && i.price > 0)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0]

  const previewService = {
    id: serviceId ?? 'nahled',
    provider_id: profile?.id ?? 'nahled',
    title: wTitle.trim() || 'Název vaší nabídky',
    // Podtitul skládá appka z oborů; ruční verze má přednost.
    subtitle: vlastniPodtitul || podtitulZOboru || null,
    category: selectedCategory ?? '',
    city: wCity.trim() || 'Vaše město',
    image_url: wImage || null,
    price: cheapest?.price ?? 0,
    price_unit: cheapest?.price_unit ?? 'ukon',
    quote_fee: 0,
    payment_model: cheapest ? 'A' : (activeItems.some(i => i.payment_model === 'B') ? 'B' : 'A'),
    profiles: {
      id: profile?.id,
      full_name: profile?.full_name,
      display_name: profile?.display_name,
      company_name: profile?.company_name,
      avatar_url: profile?.avatar_url ?? null,
      rating: Number(profile?.rating ?? 0),
      review_count: Number(profile?.review_count ?? 0),
      city: profile?.city,
      ico_verified: profile?.ico_verified === true,
    },
  } as any

  // ── Kdy je krok hotový ────────────────────────────────────────
  // Popis mezi podmínky nepatří — je volitelný.
  const krok1Hotovy =
    (watch('title') ?? '').trim().length >= 3 &&
    !!selectedCategory &&
    selectedSubIds.length > 0 &&
    (watch('city') ?? '').trim().length >= 2
  const krok2Hotovy = items.length > 0 && items.some(i => i.is_active)

  // Krok 3 (termíny) navštívil? Pak dostane fajfku. ServiceHours si dny řídí sám,
  // takže neblokujeme — bez rozvrhu chodí jen poptávky, karta funguje dál.
  const [krok3Navstiven, setKrok3Navstiven] = useState(mode === 'edit')

  // 3 kroky (22. 10. 2026): Co a kde → Ceny → Termíny a zveřejnění
  const KROKY = [
    { c: 1, nadpis: 'Co a kde', hotovo: krok1Hotovy, pruchozi: krok1Hotovy },
    { c: 2, nadpis: 'Ceny', hotovo: krok2Hotovy, pruchozi: krok2Hotovy },
    { c: 3, nadpis: 'Termíny a zveřejnění', hotovo: krok3Navstiven, pruchozi: true },
  ]
  // Dopředu jen přes průchozí kroky; v režimu úprav je vše odemčené.
  const lzeNaKrok = (c: number) =>
    mode === 'edit' || c === 1 || KROKY.slice(0, c - 1).every(k => k.pruchozi)

  const naKrok = (c: number) => {
    if (!lzeNaKrok(c)) return
    if (c === 3) setKrok3Navstiven(true)
    setKrok(c)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const rail = (
    <div className="mb-6 flex gap-1.5">
      {KROKY.map(k => {
        const now = krok === k.c
        const lze = lzeNaKrok(k.c)
        return (
          <button
            key={k.c}
            type="button"
            onClick={() => naKrok(k.c)}
            disabled={!lze}
            className={`flex-1 border-t-[3px] pt-2 text-left text-xs transition ${
              now ? 'border-slate-900 font-bold text-slate-900'
                : k.hotovo ? 'border-emerald-500 font-semibold text-emerald-700'
                : 'border-slate-200 font-semibold text-slate-400'
            } ${lze ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}
          >
            <span className={`block text-[10px] font-bold uppercase tracking-wider ${now ? 'text-slate-500' : 'text-slate-300'}`}>
              Krok {k.c}
            </span>
            {k.nadpis}{k.hotovo && ' ✓'}
          </button>
        )
      })}
    </div>
  )

  const preview = (
    <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pb-2">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
        <Eye className="h-3.5 w-3.5" /> Náhled — takhle vás uvidí zákazníci
      </p>
      <div className="pointer-events-none select-none">
        <ServiceCard
          service={previewService}
          categoryName={activeCat?.name}
          subcatNames={activeItems.slice(0, 3).map(i => i.name)}
          preview
        />
      </div>
      {!wImage && (
        <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          Nabídky s fotkou dostávají výrazně víc kliknutí. Fotku přidáte v části „Doplnit teď“ – nebo kdykoli později.
        </p>
      )}
      {serviceId && cheapest == null && activeItems.length === 0 && (
        <p className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          Cena se v náhledu objeví, jakmile přidáte první úkon do ceníku.
        </p>
      )}
    </div>
  )

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 xl:order-2">{preview}</div>

      <motion.form
        onSubmit={handleSubmit(onSubmit as any)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="min-w-0 space-y-6 xl:order-1"
      >
        {rail}

        {/* ══ KROK 1 — CO NABÍZÍTE ══ */}
        <div className={krok === 1 ? 'space-y-6' : 'hidden'}>

        {/* 1. VAŠE PROFESE — jedno pole s našeptávačem (i podle příbuzných slov), seznam jako volná ruka */}
        <div className="space-y-2.5">
          <label className="form-label" htmlFor="profese-hledani">Vaše profese *</label>

          {/* Vybrané profese */}
          {selectedSubIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedSubIds.map((id, i) => {
                const p = profById(id)
                const own = !p ? ownSubs.find(o => o.id === id) : null
                return (
                  <span key={id} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${i === 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                    {p ? <CategoryIcon slug={p.catSlug} className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                    {p?.name ?? own?.name ?? 'Profese'}
                    {i === 0 && selectedSubIds.length > 1 && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">hlavní</span>}
                    <button type="button" onClick={() => toggleSub(id)} aria-label="Odebrat" className="ml-0.5 text-slate-400 hover:text-red-500">×</button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Hledání */}
          {selectedSubIds.length < MAX_PROFESI && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="profese-hledani"
                type="text" value={oborQ} onChange={e => setOborQ(e.target.value)}
                placeholder={selectedSubIds.length > 0 ? 'Děláte i něco dalšího? Přidejte (nepovinné)…' : 'Napište, co děláte – např. kosmetička, malíř, advokát, barber…'}
                className="form-input pl-9"
                autoComplete="off"
              />
              {oborQ.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {oborHits.length > 0 ? oborHits.map(p => (
                    <button key={p.id} type="button" onClick={() => pickObor(p.catSlug, p.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-emerald-50">
                      <CategoryIcon slug={p.catSlug} boxed className="h-3.5 w-3.5" boxClassName="h-7 w-7 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-800">{p.name}</span>
                        <span className="block truncate text-xs text-slate-400">{p.catName}</span>
                      </span>
                      {selectedSubIds.includes(p.id) && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                    </button>
                  )) : (
                    <button type="button" onClick={() => { setBrowseCat(selectedCategory || null); setVsechnyKategorie(true); setOborQ('') }}
                      className="block w-full px-3 py-2.5 text-left text-xs leading-relaxed text-slate-500 hover:bg-slate-50">
                      Tuhle profesi v seznamu nemáme. <strong className="text-emerald-700">Vyberte kategorii a přidejte vlastní →</strong>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400">
            {selectedSubIds.length === 0
              ? 'Podle profese vás zákazníci najdou. Co přesně děláte a za kolik, napíšete v dalším kroku do ceníku.'
              : selectedSubIds.length < MAX_PROFESI
                ? 'Hotovo – můžete pokračovat. Další profese je nepovinná (nejvýš tři).'
                : 'Máte tři profese, víc jich nabídka mít nemůže.'}
          </p>

          {/* Volná ruka: procházet seznam profesí */}
          {!vsechnyKategorie ? (
            <button type="button" onClick={() => { setBrowseCat(selectedCategory || null); setVsechnyKategorie(true) }}
              className="text-xs font-semibold text-emerald-700 underline hover:text-emerald-800">
              Procházet seznam profesí
            </button>
          ) : loadingCats ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500">Vyberte kategorii a v ní svou profesi</p>
                <button type="button" onClick={() => setVsechnyKategorie(false)} className="text-xs text-slate-400 underline hover:text-slate-600">Zavřít</button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1.5">
                {categories.map(cat => {
                  const on = browseCategory?.slug === cat.slug
                  return (
                    <button key={cat.slug} type="button" onClick={() => setBrowseCat(cat.slug)}
                      className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition ${on ? 'border-emerald-500 bg-white font-semibold text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                      <CategoryIcon slug={cat.slug} boxed className="h-3.5 w-3.5" boxClassName="h-7 w-7 shrink-0 rounded-lg" />
                      <span className="min-w-0 break-words leading-snug">{cat.name}</span>
                    </button>
                  )
                })}
              </div>
              {browseCategory && (
                <div className="flex flex-wrap gap-2">
                  {browseCategory.subcategories.map(sub => {
                    const isSelected = selectedSubIds.includes(sub.id)
                    return (
                      <button key={sub.id} type="button" onClick={() => toggleSub(sub.id)}
                        disabled={!isSelected && selectedSubIds.length >= MAX_PROFESI}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition disabled:opacity-40 ${isSelected ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                          {isSelected && <span className="text-[9px] leading-none">✓</span>}
                        </span>
                        {sub.name}
                      </button>
                    )
                  })}
                  <button type="button" onClick={() => { setOwnSubOpen(v => !v); setOwnSubErr('') }}
                    className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition hover:border-emerald-400 hover:text-emerald-700">
                    <Plus className="h-3.5 w-3.5" /> Nevidím svou profesi
                  </button>
                </div>
              )}
              {ownSubOpen && browseCategory && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-xs leading-relaxed text-amber-900">
                    Napište profesi tak, jak ji zná zákazník (např. „Hodinář“). Hned ji můžete používat,
                    ve vyhledávání se ukáže po schválení.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={ownSubName}
                      onChange={e => { setOwnSubName(e.target.value); setOwnSubErr('') }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveOwnSub() } }}
                      maxLength={60}
                      placeholder={`Profese v kategorii ${browseCategory.name}`}
                      className="form-input min-w-0 flex-1 bg-white"
                      autoFocus
                    />
                    <button type="button" onClick={saveOwnSub} disabled={ownSubSaving || ownSubName.trim().length < 3}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50">
                      {ownSubSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Přidat
                    </button>
                  </div>
                  {ownSubErr && <p className="mt-1.5 text-xs font-semibold text-red-600">{ownSubErr}</p>}
                </div>
              )}
            </div>
          )}
          {errors.category && <p className="form-error">Vyberte prosím svou profesi.</p>}
        </div>

        {/* 2. KDE PŮSOBÍTE */}
        <div className="space-y-3">
          <label className="form-label flex items-center justify-between gap-1">
            <span>Kde působíte? *</span>
            <InfoTip>
              Platí pro celou nabídku. Děláte obojí, tedy máte salon a zároveň jezdíte za zákazníky?
              <strong> Založte si dvě nabídky</strong>, každou s vlastním ceníkem. Zákazník pak hned
              ví, co si objednává, a vy nemusíte u každé objednávky řešit, kam se jede.
            </InfoTip>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              { value: 'u_poskytovatele', icon: Store, title: 'Zákazník přijde za mnou', desc: 'Mám provozovnu (salon, dílna)' },
              { value: 'u_zakaznika', icon: Home, title: 'Jezdím za zákazníkem', desc: 'Dorazím na jeho adresu' },
            ] as const).map(opt => {
              const Icon = opt.icon
              const isSel = locationType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('location_type', opt.value)}
                  className={`rounded-2xl border-2 p-4 text-left transition-all ${
                    isSel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <Icon className={`mb-1.5 h-5 w-5 ${isSel ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <p className="text-sm font-extrabold text-slate-900">{opt.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{opt.desc}</p>
                </button>
              )
            })}
          </div>

          {/* Adresa – jedno pole (Matej 22. 10. 2026): obec se doplní z adresy, z adresy se počítá
              vzdálenost, dojezd i doprava. Předvyplní se z profilu, dokud ji poskytovatel nezmění. */}
          <div className="space-y-2">
            <label className="form-label">
              {locationType === 'u_poskytovatele' ? 'Adresa provozovny *' : 'Adresa, odkud vyjíždíte *'}
            </label>

            {!vlastniAdresa && !jenObec && !watch('address') && profile?.address ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Z vašeho profilu</p>
                  <p className="truncate text-sm font-semibold text-slate-800">{profile.address}</p>
                </div>
                <button type="button" onClick={() => setVlastniAdresa(true)}
                  className="shrink-0 text-xs font-bold text-emerald-600 underline hover:text-emerald-700">
                  Změnit
                </button>
              </div>
            ) : jenObec ? (
              <SearchAutocomplete
                mode="obce"
                defaultValue={watch('city')}
                placeholder="Obec – začněte psát a vyberte ze seznamu…"
                onPickObec={(item) => {
                  setValue('city', item.obec, { shouldValidate: true })
                  setValue('city_lat', item.latitude)
                  setValue('city_lng', item.longitude)
                }}
                onFreeText={(text) => {
                  setValue('city', text, { shouldValidate: true })
                  setValue('city_lat', null)
                  setValue('city_lng', null)
                }}
              />
            ) : (
              <AddressInput
                defaultValue={watch('address')}
                onPick={(a: { address: string; lat: number; lng: number; municipality: string }) => {
                  setValue('address', a.address, { shouldValidate: true })
                  setValue('address_lat', a.lat)
                  setValue('address_lng', a.lng)
                  // Obec karty = obec adresy (podle ní vás najdou ve vyhledávání)
                  if (a.municipality) setValue('city', a.municipality, { shouldValidate: true })
                  setValue('city_lat', a.lat)
                  setValue('city_lng', a.lng)
                }}
                onFreeText={(text: string) => {
                  setValue('address', text || null)
                  setValue('address_lat', null)
                  setValue('address_lng', null)
                }}
              />
            )}
            {errors.city && <p className="form-error">{errors.city.message}</p>}

            <p className="text-xs leading-relaxed text-slate-400">
              {locationType === 'u_zakaznika'
                ? <>Zákazníci uvidí jen obec{watch('city') ? <> (<strong className="text-slate-600">{watch('city')}</strong>)</> : null}. Z adresy počítáme vzdálenost k zákazníkům a dopravu.</>
                : <>Zákazník uvidí adresu i s mapou a trefí k vám napoprvé{watch('city') ? <> · obec <strong className="text-slate-600">{watch('city')}</strong></> : null}.</>}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(vlastniAdresa || jenObec) && profile?.address && (
                <button type="button"
                  onClick={() => {
                    setVlastniAdresa(false); setJenObec(false)
                    setValue('address', null); setValue('address_lat', null); setValue('address_lng', null)
                    if (profile?.city) setValue('city', profile.city, { shouldValidate: true })
                    setValue('city_lat', profile?.address_lat != null ? Number(profile.address_lat) : null)
                    setValue('city_lng', profile?.address_lng != null ? Number(profile.address_lng) : null)
                  }}
                  className="text-xs text-slate-400 underline hover:text-slate-600">
                  Zpět na adresu z profilu
                </button>
              )}
              {!jenObec && (vlastniAdresa || !profile?.address || !!watch('address')) && (
                <button type="button"
                  onClick={() => { setJenObec(true); setValue('address', null); setValue('address_lat', null); setValue('address_lng', null) }}
                  className="text-xs text-slate-400 underline hover:text-slate-600">
                  Nemám přesnou adresu – zadám jen obec
                </button>
              )}
              {jenObec && (
                <button type="button" onClick={() => setJenObec(false)} className="text-xs text-slate-400 underline hover:text-slate-600">
                  Zadat přesnou adresu
                </button>
              )}
            </div>

            {locationType === 'u_poskytovatele' && (watch('address') || (!vlastniAdresa && profile?.address)) && !jenObec && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={watch('address_public') ?? true}
                  onChange={(e) => setValue('address_public', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Zobrazit adresu veřejně</span>
                  <span className="block text-xs leading-relaxed text-slate-500">
                    Když vypnete, zákazníci uvidí jen obec – přesnou adresu dostanou až po potvrzení rezervace.
                  </span>
                </span>
              </label>
            )}
          </div>

          {/* Dojezd */}
          <AnimatePresence>
            {locationType !== 'u_poskytovatele' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                // overflow-hidden ořezával bublinu InfoTipu. Během animace ho držíme
                // skrytý (kvůli plynulému rozbalení výšky), po dokončení uvolníme.
                onAnimationComplete={() => setRadiusExpanded(true)}
                className={`space-y-1.5 ${radiusExpanded ? 'overflow-visible' : 'overflow-hidden'}`}>
                <label className="form-label flex items-center justify-between gap-1">
                  <span>Kam ještě dojedete (km)</span>
                  <InfoTip>
                    Jak daleko od svého města ještě dojedete. Zákazník si podle toho vyfiltruje,
                    jestli je jeho adresa ve vašem dosahu. <strong>Cenu za cestu</strong> nastavíte
                    u konkrétního úkonu s naceněním.
                  </InfoTip>
                </label>
                <input
                  type="number" min={1} max={300} placeholder="20"
                  defaultValue={watch('radius_km') ?? ''}
                  onChange={e => setValue('radius_km', (e.target.value === '' ? null : Number(e.target.value)) as any)}
                  className="form-input"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3. NÁZEV NABÍDKY – píše poskytovatel jednou; návrhy na jedno klepnutí (23. 10. 2026) */}
        <div className="space-y-1.5">
          <label className="form-label flex items-center justify-between" htmlFor="nazev-nabidky">
            <span>Název nabídky *</span>
            <span className="text-xs font-normal text-slate-400">{wTitle.length} / 100</span>
          </label>
          <input id="nazev-nabidky" {...f('title')} maxLength={100}
            placeholder={hlavniObor ? `např. ${hlavniObor} ${profile?.full_name ?? 'Jan Novák'}` : 'např. Malířství Novák, Salon Bella'}
            className={`form-input ${errors.title ? 'form-input-error' : ''}`} />
          {(() => {
            const navrhy = [
              profile?.company_name,
              hlavniObor && (profile?.display_name || profile?.full_name) ? `${hlavniObor.split(' / ')[0]} ${profile?.display_name || profile?.full_name}` : null,
            ].filter((x, i, a): x is string => !!x && a.indexOf(x) === i && x !== wTitle.trim())
            return navrhy.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">Použít:</span>
                {navrhy.map(n => (
                  <button key={n} type="button" onClick={() => setValue('title', n.slice(0, 100), { shouldValidate: true })}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
                    {n}
                  </button>
                ))}
              </div>
            ) : null
          })()}
          <p className="text-xs text-slate-400">Takhle se karta jmenuje v seznamu. Pod názvem se automaticky ukáže vaše profese.</p>
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>

        {/* ── NEPOVINNÉ: podtitul, popis, telefon, fotky ── */}
        <div className="rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setDetailyOtevrene(v => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">Doplnit teď (nepovinné)</span>
              <span className="block text-xs text-slate-500">
                Fotky, popis, telefon a řádek pod názvem. Nic z toho není potřeba – dá se doplnit kdykoli později.
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${detailyOtevrene ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {detailyOtevrene && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-5 border-t border-slate-100 p-4">

                  {/* Řádek pod názvem – appka ho skládá z oborů, přepsat jde tady */}
                  <div className="space-y-1.5">
                    <label className="form-label">Řádek pod názvem <span className="font-normal text-slate-400">(volitelné)</span></label>
                    <input
                      type="text" maxLength={80}
                      placeholder={podtitulZOboru || 'Složí se z vybraných oborů'}
                      defaultValue={vlastniPodtitul}
                      onChange={e => setValue('subtitle', e.target.value || null)}
                      className="form-input"
                    />
                    <p className="text-xs text-slate-400">Když necháte prázdné, ukáže se „{podtitulZOboru || 'obory'}“.</p>
                  </div>

                  {/* Popis */}
                  <div className="space-y-1.5">
                    <label className="form-label">Něco o vás <span className="font-normal text-slate-400">(volitelné)</span></label>
                    <textarea
                      {...f('description')} rows={4}
                      placeholder="Např.: Jsme malé kadeřnictví v centru Vsetína. Zaměřujeme se na dámské a pánské střihy, barvení a individuální přístup."
                      className={`form-input resize-none ${errors.description ? 'form-input-error' : ''}`}
                    />
                    <p className="text-xs text-slate-400">
                      Krátce zákazníkům řekněte, proč si vybrat právě vás. Ceny sem nepište — patří do ceníku,
                      kde se dají rovnou objednat.
                    </p>
                    {errors.description && <p className="form-error">{errors.description.message}</p>}
                  </div>

                  {/* Telefon */}
                  <div className="space-y-1.5">
                    <label className="form-label">Telefon na tuhle nabídku <span className="font-normal text-slate-400">(volitelné)</span></label>
                    <input
                      type="text" maxLength={30} placeholder="+420 777 123 456"
                      defaultValue={watch('phone') ?? ''}
                      onChange={e => setValue('phone', e.target.value || null)}
                      className="form-input"
                    />
                    <p className="text-xs text-slate-400">Když má pobočka vlastní číslo, uveďte ho tady. Jinak platí telefon z profilu.</p>
                  </div>

                  {/* Fotky */}
                  <div className="space-y-5 border-t border-slate-100 pt-5">
                    <div className="space-y-1.5">
                      <label className="form-label">Titulní fotografie <span className="font-normal text-slate-400">(volitelné)</span></label>
                      <p className="text-xs text-slate-400">Hlavní fotka — zobrazí se v marketplace a nahoře na detailu.</p>
                      <ImageUpload value={watch('image_url')} onChange={url => setValue('image_url', url)} folder="services" />
                    </div>

                    <div className="space-y-1.5">
                      <label className="form-label flex items-center justify-between gap-1">
                        <span>Ukázky práce <span className="font-normal text-slate-400">(volitelné)</span></span>
                        <InfoTip>
                          Prvních pět fotek si zákazník <strong>prolistuje přímo v marketplace</strong>,
                          aniž by nabídku otevřel. Dejte na začátek ty nejlepší — rozhodují o tom,
                          jestli klikne dál.
                        </InfoTip>
                      </label>
                      <GalleryUpload value={watch('gallery') ?? []} onChange={(urls) => setValue('gallery', urls)} />
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Feedback */}
        <AnimatePresence>
          {submitState === 'error' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}
            </motion.div>
          )}
          {submitState === 'success' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${hasActiveSub ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nabídka byla uložena.{' '}
                {hasActiveSub
                  ? 'Teď doplňte ceny.'
                  : <strong>Zveřejní se zákazníkům, jakmile aktivujete předplatné.</strong>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Uložení */}
        <button type="submit" disabled={submitState === 'loading'} className="btn-primary w-full">
          {submitState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
           : serviceId ? 'Uložit změny'
           : <>Pokračovat na ceny <ChevronRight className="h-4 w-4" /></>}
        </button>

        </div>{/* konec kroku 1 */}

        {/* ══ KROK 2 — SLUŽBY A CENY ══ */}
        <div className={krok === 2 ? 'space-y-6' : 'hidden'}>
        <AnimatePresence>
          {serviceId && (
            <motion.div
              id="cenik"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 border-t border-slate-100 pt-6"
            >
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4 text-emerald-600" /> Služby a ceny
                </label>
                <p className="text-xs text-slate-400">
                  Napište, co přesně děláte a za kolik. Běžné služby vaší profese stačí vybrat klepnutím.
                </p>
              </div>

              {loadingItems ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Načítám ceník…
                </div>
              ) : (
                <PriceList
                  serviceId={serviceId}
                  items={items}
                  serviceTypes={serviceTypesForItems}
                  subcategories={subcatsForPriceList}
                  onChanged={loadItems}
                  flat
                />
              )}

            </motion.div>
          )}
        </AnimatePresence>
        </div>{/* konec kroku 2 */}

        {/* ══ KROK 3 — TERMÍNY ══ */}
        {/* Dostupnost byla na vlastní stránce a řemeslníci ji přeskakovali.
            Teď je součástí formuláře — bez ní chodí jen poptávky bez času. */}
        <div className={krok === 3 ? 'space-y-4' : 'hidden'}>
          <div>
            <label className="form-label flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-emerald-600" /> Kdy máte otevřeno <span className="font-normal text-slate-400">(nepovinné)</span>
            </label>
            <p className="text-xs text-slate-400">
              Zákazník uvidí jen termíny, které vám sedí. Můžete nastavit hned, nebo kdykoli později – nabídku jde zveřejnit i bez toho.
            </p>
          </div>

          {serviceId && krok === 3 && (
            <ServiceHours
              serviceId={serviceId}
              isTravelCard={locationType === 'u_zakaznika'}
            />
          )}

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-sm font-bold text-slate-900">Tohle je jen rámec</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              Konkrétní volné termíny vypíšete jedním klepnutím po zveřejnění. Právě u nich
              si zákazník klikne a rovnou se objedná — nemusí čekat, až se ozvete.
            </p>
          </div>
        </div>

        {/* ══ ZVEŘEJNĚNÍ – součást kroku 3 (dřív samostatný krok 4) ══ */}
        <div className={krok === 3 ? 'space-y-4 border-t border-slate-100 pt-6' : 'hidden'}>
          <div>
            <label className="form-label">Zkontrolujte a zveřejněte</label>
            <p className="text-xs text-slate-400">Náhled karty vidíte vpravo (na mobilu nahoře). Všechno jde později upravit.</p>
          </div>

          {/* Značka (salon, firma) se tady dřív připínala — vyhozeno.
              Kdo zakládá první nabídku, žádnou značku nemá a prázdný výběr
              jen mate; kdo ji má, připne kartu později v Moje nabídky nebo
              na stránce Značka. Poslední krok patří kontrole a zveřejnění. */}

          <dl className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
            {[
              ['Název', wTitle.trim() || '—'],
              ['Co děláte', previewSubNames.join(', ') || 'nevybráno'],
              ['Kde', locationType === 'u_poskytovatele'
                ? `U vás – ${watch('address') || (!vlastniAdresa && profile?.address) || wCity || '—'}`
                : `Výjezd do ${watch('radius_km') ?? '—'} km od ${wCity || '—'}`],
              ['Ceník', activeItems.length > 0
                ? `${activeItems.length} ${activeItems.length === 1 ? 'úkon' : activeItems.length < 5 ? 'úkony' : 'úkonů'}`
                : 'chybí ceny'],
            ].map(([dt, dd]) => (
              <div key={dt} className="flex gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
                <dt className="w-28 shrink-0 text-slate-500">{dt}</dt>
                <dd className="flex-1 font-semibold text-slate-800">{dd}</dd>
              </div>
            ))}
          </dl>

          {!hasActiveSub && (
            <div className="flex gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <span>💳</span>
              <p className="text-xs leading-relaxed text-blue-900">
                <strong>Nabídku máme uloženou, zveřejní se po zaplacení předplatného.</strong>{' '}
                Zákazníci ji uvidí, jakmile bude aktivní. Do té doby si ji můžete v klidu dopilovat.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={finish}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <CheckCircle2 className="h-4 w-4" />
            {hasActiveSub ? 'Hotovo – přejít na Moje nabídky' : 'Uložit a přejít k předplatnému'}
          </button>
        </div>

        {/* ══ SPODNÍ NAVIGACE ══ */}
        {serviceId && (
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            {krok > 1 && (
              <button type="button" onClick={() => naKrok(krok - 1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                Zpět
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">
                {krok === 1 ? (krok1Hotovy ? 'Základ je hotový' : 'Rozpracováno')
                  : krok === 2 ? (krok2Hotovy ? 'Ceník hotový' : 'Chybí ceny')
                  : 'Připraveno'}
              </p>
              <p className="text-xs text-slate-500">
                {krok === 1 ? (krok1Hotovy ? 'Teď ceny – u každého oboru jedna.' : 'Vyberte obor a adresu.')
                  : krok === 2 ? (krok2Hotovy ? 'Zbývá zveřejnit (otevírací doba je nepovinná).' : 'Bez ceny si u vás zákazník nemůže objednat.')
                  : 'Zkontrolujte souhrn a nabídku zveřejněte.'}
              </p>
            </div>
            {krok < 3 && (
              <button type="button" onClick={() => naKrok(krok + 1)}
                disabled={!lzeNaKrok(krok + 1)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                Pokračovat
              </button>
            )}
          </div>
        )}

      </motion.form>
    </div>
  )
}