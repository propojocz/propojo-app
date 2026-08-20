'use client'
// components/forms/ServiceForm.tsx — model „karta + ceník"
//
// PRVNÍ KROK JE ZÁMĚRNĚ HOLÝ. Poskytovatel vyplní tři věci — jak se má
// zobrazovat, co dělá a kde působí — a jde dál. Popis, podtitul, telefon
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
import { CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronDown, Store, Home, Lightbulb, Eye, ListChecks, CalendarDays, Plus, Sparkles } from 'lucide-react'
import { createService, updateService } from '@/lib/actions/services'
import { createOwnSubcategory } from '@/lib/actions/subcategories'
import type { Service, ServiceItem } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import ServiceCard from '@/components/ui/ServiceCard'
import ImageUpload from '@/components/ui/ImageUpload'
import GalleryUpload from '@/components/ui/GalleryUpload'
import AddressInput from '@/components/ui/AddressInput'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import PriceList from '@/components/ui/PriceList'
import ServiceHours from '@/components/forms/ServiceHours'
import InfoTip from '@/components/ui/InfoTip'
import type { ServiceTypeOption } from '@/components/ui/ServiceItemEditor'
import BrandPicker from '@/components/ui/BrandPicker'

const schema = z.object({
  title: z.string().min(3, 'Napište, jak se chcete zobrazovat (aspoň 3 znaky)').max(100),
  subtitle: z.string().max(80).nullable().optional(),
  // Popis už NENÍ povinný. Kdo ho nevyplní, dostane větu složenou z oboru
  // a města — prázdná karta by na detailu vypadala opuštěně.
  description: z.string().max(2000).nullable().optional(),
  category: z.string().min(1, 'Vyberte kategorii'),
  subcategory_id: z.string().optional(),
  subcategory_ids: z.array(z.string()).optional(),
  service_type: z.string().optional(),
  phone: z.string().max(30).nullable().optional(),
  city: z.string().min(2, 'Zadejte město').max(100),
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
  subcategories: { id: string; slug: string; name: string; service_types: { id: string; name: string }[] }[]
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, company_name, avatar_url, city, ico_verified, rating, review_count')
        .eq('id', user.id)
        .single()
      setProfile(data)

      // Město z profilu předvyplníme, ať člověk nepíše to, co už jednou zadal.
      // Jen když pole ještě prázdné je — v úpravách nabídky nic nepřepisujeme.
      const mesto = (data as any)?.city
      if (mode === 'create' && mesto && !watch('city')) {
        setValue('city', mesto, { shouldValidate: true })
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
  const toggleSub = (id: string) => {
    const exists = selectedSubIds.includes(id)
    const next = exists ? selectedSubIds.filter(x => x !== id) : [...selectedSubIds, id]
    setValue('subcategory_ids', next)
    setValue('subcategory_id', next[0] ?? '')
  }

  // Podkategorie vybrané na kartě → skupiny v ceníku. Systémové i vlastní.
  const subcatsForPriceList = [
    ...(activeCat?.subcategories ?? [])
      .filter(sub => selectedSubIds.includes(sub.id))
      .map(sub => ({ id: sub.id, name: sub.name, isOwn: false })),
    ...ownSubs
      .filter(o => selectedSubIds.includes(o.id))
      .map(o => ({ id: o.id, name: o.name, isOwn: true })),
  ]

  // Typy služeb nabídnuté z vybraných podkategorií — vstup do ceníku (našeptávač názvu).
  const serviceTypesForItems: ServiceTypeOption[] = (activeCat?.subcategories ?? [])
    .filter(sub => selectedSubIds.includes(sub.id))
    .flatMap(sub => sub.service_types ?? [])
    .map(st => ({ id: st.id, name: st.name }))

  // Názvy vybraných podkategorií — používá je náhled, souhrn i doplňování textů.
  const previewSubNames = [
    ...(activeCat?.subcategories ?? [])
      .filter(sub => selectedSubIds.includes(sub.id))
      .map(sub => sub.name),
    ...ownSubs.filter(o => selectedSubIds.includes(o.id)).map(o => o.name),
  ]
  const hlavniObor = previewSubNames[0] ?? activeCat?.name ?? ''

  // Podtitul se skládá z vybraných oborů: „Kadeřnictví · Barber". Poskytovatel
  // nemá vymýšlet marketingovou větu — appka ví, co dělá, z toho, co naklikal.
  const podtitulZOboru = previewSubNames.slice(0, 3).join(' · ')
  // Přepsal si ho ručně? Pak platí jeho verze.
  const vlastniPodtitul = (watch('subtitle') ?? '').trim()
  const [upravaPodtitulu, setUpravaPodtitulu] = useState(false)

  // ── Vlastní podkategorie („Nevidím svou službu") ──
  // Vytvoří se jako NESCHVÁLENÁ: na kartě funguje hned, do zákaznického
  // vyhledávání spadne, až ji projdeme v adminu.
  const saveOwnSub = async () => {
    const cat = activeCat
    if (!cat) { setOwnSubErr('Vyberte nejdřív kategorii.'); return }
    const name = ownSubName.trim()
    if (name.length < 3) { setOwnSubErr('Napište název — aspoň tři znaky.'); return }

    setOwnSubSaving(true); setOwnSubErr('')
    const res = await createOwnSubcategory({ category_id: cat.id, name })
    setOwnSubSaving(false)

    if (!res.success) { setOwnSubErr(res.error); return }

    // Rovnou ji zaškrtneme, ať nemusí klikat dvakrát.
    setOwnSubs(prev => prev.some(o => o.id === res.id) ? prev : [...prev, { id: res.id, name: res.name }])
    const next = selectedSubIds.includes(res.id) ? selectedSubIds : [...selectedSubIds, res.id]
    setValue('subcategory_ids', next)
    setValue('subcategory_id', next[0] ?? '')
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

    const payload = { ...data, description: popis, subtitle: podtitul }

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

  const KROKY = [
    { c: 1, nadpis: 'Co nabízíte', hotovo: krok1Hotovy, pruchozi: krok1Hotovy },
    { c: 2, nadpis: 'Služby a ceny', hotovo: krok2Hotovy, pruchozi: krok2Hotovy },
    { c: 3, nadpis: 'Termíny', hotovo: krok3Navstiven, pruchozi: true },
    { c: 4, nadpis: 'Zveřejnění', hotovo: false, pruchozi: false },
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
          subcatNames={previewSubNames}
          preview
        />
      </div>
      {/* Podtitul si appka skládá sama — kdo ho chce jiný, přepíše si ho tady.
          Schválně nenápadné: 9 z 10 lidí nemá důvod o tom vůbec přemýšlet. */}
      {podtitulZOboru && (
        <div className="mt-2">
          {upravaPodtitulu ? (
            <div className="space-y-1.5">
              <input
                type="text" maxLength={80} autoFocus
                placeholder={podtitulZOboru}
                defaultValue={vlastniPodtitul}
                onChange={e => setValue('subtitle', e.target.value || null)}
                className="form-input text-sm"
              />
              <button
                type="button"
                onClick={() => setUpravaPodtitulu(false)}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Hotovo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setUpravaPodtitulu(true)}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              Upravit řádek pod názvem
            </button>
          )}
        </div>
      )}

      {!wImage && (
        <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          Nabídky s fotkou dostávají výrazně víc kliknutí. Fotku přidáte v části „Doplnit teď" — nebo kdykoli později.
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

        {/* Tip */}
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-xs leading-relaxed text-slate-600">
            <strong className="text-slate-800">Jedna nabídka = jeden hlavní obor.</strong>{' '}
            Jednotlivé služby a jejich ceny přidáte v dalším kroku.
            <span className="mt-0.5 block text-slate-400">Např. Kadeřnictví → pánský střih, barvení, foukaná…</span>
          </p>
        </div>

        {/* 1. JAK SE CHCETE ZOBRAZOVAT */}
        <div className="space-y-1.5">
          <label className="form-label flex items-center justify-between">
            <span>Jak se chcete zákazníkům zobrazovat? *</span>
            <span className="text-xs font-normal text-slate-400">{wTitle.length} / 100</span>
          </label>
          <input {...f('title')} maxLength={100} placeholder="např. Salon Bella" className={`form-input ${errors.title ? 'form-input-error' : ''}`} />
          <p className="text-xs text-slate-400">Může to být název firmy, salonu, nebo prostě vaše jméno.</p>
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>

        {/* 2. CO NABÍZÍTE — kategorie a obory */}
        <div className="space-y-3">
          <label className="form-label">Co nabízíte? *</label>
          {loadingCats ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítám kategorie…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map(cat => {
                  const isSelected = selectedCategory === cat.slug
                  return (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => {
                        setValue('category', cat.slug, { shouldValidate: true })
                        setValue('subcategory_id', '')
                        setValue('subcategory_ids', [])
                        setValue('service_type', '')
                      }}
                      className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                      style={isSelected ? { borderColor: cat.color, backgroundColor: `${cat.color}10`, color: cat.color } : {}}
                    >
                      <span className="text-lg">{cat.icon}</span>
                      <span className="leading-tight">{cat.name}</span>
                    </button>
                  )
                })}
              </div>

              <AnimatePresence>
                {activeCat && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <ChevronRight className="h-3 w-3" /> Obor — vyberte i více
                      <InfoTip align="left">
                        Podle vybraných oborů se vám <strong>v ceníku nabídnou konkrétní
                        úkony</strong> z našeho katalogu — nemusíte je vypisovat ručně.
                        Zákazníkovi se z nich zároveň složí štítky na kartě.
                      </InfoTip>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeCat.subcategories.map(sub => {
                        const isSelected = selectedSubIds.includes(sub.id)
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => toggleSub(sub.id)}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-all ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                              {isSelected && <span className="text-[9px] leading-none">✓</span>}
                            </span>
                            {sub.name}
                          </button>
                        )
                      })}

                      {/* Vlastní podkategorie přidané v tomhle sezení */}
                      {ownSubs.map(o => {
                        const isSelected = selectedSubIds.includes(o.id)
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => toggleSub(o.id)}
                            title="Vaše vlastní — zákazníci ji ve vyhledávání uvidí po schválení"
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-all ${
                              isSelected
                                ? 'border-amber-400 bg-amber-50 font-semibold text-amber-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'}`}>
                              {isSelected && <span className="text-[9px] leading-none">✓</span>}
                            </span>
                            {o.name}
                            <Sparkles className="h-3 w-3 text-amber-500" />
                          </button>
                        )
                      })}

                      {/* Nevidím svou službu */}
                      <button
                        type="button"
                        onClick={() => { setOwnSubOpen(v => !v); setOwnSubErr('') }}
                        className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-all hover:border-emerald-400 hover:text-emerald-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nevidím svou službu
                      </button>
                    </div>

                    {/* Formulář vlastní podkategorie */}
                    <AnimatePresence>
                      {ownSubOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2.5 overflow-hidden"
                        >
                          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                            <p className="text-xs leading-relaxed text-amber-900">
                              <strong>Napište službu odborně</strong> — tak, jak ji zná zákazník.
                              Hned si ji dáte do nabídky a můžete přijímat objednávky. Ve vyhledávání
                              se ukáže, jakmile ji zařadíme mezi ostatní.
                            </p>
                            <div className="mt-2 flex gap-2">
                              <input
                                value={ownSubName}
                                onChange={e => { setOwnSubName(e.target.value); setOwnSubErr('') }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveOwnSub() } }}
                                maxLength={60}
                                placeholder="např. Renovace parket"
                                className="form-input flex-1 bg-white"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={saveOwnSub}
                                disabled={ownSubSaving || ownSubName.trim().length < 3}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                              >
                                {ownSubSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Přidat
                              </button>
                            </div>
                            {ownSubErr && <p className="mt-1.5 text-xs font-semibold text-red-600">{ownSubErr}</p>}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          {errors.category && <p className="form-error">{errors.category.message}</p>}
        </div>

        {/* 3. KDE PŮSOBÍTE */}
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

          {/* Město */}
          <div className="space-y-1.5">
            <SearchAutocomplete
              mode="obce"
              defaultValue={watch('city')}
              placeholder="Město nebo obec — začněte psát a vyberte ze seznamu…"
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
            {errors.city && <p className="form-error">{errors.city.message}</p>}
            <p className="text-xs text-slate-400">
              Podle města vás zákazníci najdou ve vyhledávání.
              {locationType === 'u_zakaznika'
                ? ' Vyberte obec ze seznamu (ne jen napište) — jinak nepůjde spočítat dojezdovou vzdálenost.'
                : ' Máte-li provozovnu, doplní se samo z adresy níže.'}
            </p>
          </div>

          {/* Adresa provozovny */}
          <AnimatePresence>
            {locationType !== 'u_zakaznika' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                <label className="form-label">Přesná adresa provozovny</label>
                <AddressInput
                  defaultValue={watch('address')}
                  onPick={(a: { address: string; lat: number; lng: number; municipality: string }) => {
                    setValue('address', a.address, { shouldValidate: true })
                    setValue('address_lat', a.lat)
                    setValue('address_lng', a.lng)
                    if (!watch('city') && a.municipality) {
                      setValue('city', a.municipality, { shouldValidate: true })
                    }
                  }}
                  onFreeText={(text: string) => {
                    setValue('address', text || null)
                    setValue('address_lat', null)
                    setValue('address_lng', null)
                  }}
                />
                <p className="text-xs text-slate-400">
                  Vyberte adresu ze seznamu — zákazník pak uvidí špendlík na mapě a trefí k vám napoprvé.
                </p>

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
                      Když vypnete, zákazníci uvidí jen město — přesnou adresu dostanou až po objednání.
                      Hodí se, když pracujete z domova.
                    </span>
                  </span>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

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

        {/* ── NEPOVINNÉ: podtitul, popis, telefon, fotky ── */}
        <div className="rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setDetailyOtevrene(v => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">Doplnit teď</span>
              <span className="block text-xs text-slate-500">
                Popis, podtitul, telefon a fotky. Nic z toho není potřeba — dá se doplnit kdykoli později.
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
                  ? 'Teď doplňte služby a ceny.'
                  : <strong>Zveřejní se zákazníkům, jakmile aktivujete předplatné.</strong>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Uložení */}
        <button type="submit" disabled={submitState === 'loading'} className="btn-primary w-full">
          {submitState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
           : serviceId ? 'Uložit změny'
           : <>Pokračovat na služby a ceny <ChevronRight className="h-4 w-4" /></>}
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
                  Podle oborů, které jste vybrali, jsme vám připravili skupiny. Doplňte cenu a délku — a kde nabízíte víc variant, přidejte další úkon.
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
              <CalendarDays className="h-4 w-4 text-emerald-600" /> Kdy máte otevřeno
            </label>
            <p className="text-xs text-slate-400">
              Zákazník uvidí jen termíny, které vám sedí. Kdykoli to změníte — i zablokujete dovolenou.
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

        {/* ══ KROK 4 — ZVEŘEJNĚNÍ ══ */}
        <div className={krok === 4 ? 'space-y-4' : 'hidden'}>
          <div>
            <label className="form-label">Zkontrolujte a zveřejněte</label>
            <p className="text-xs text-slate-400">Takhle vás uvidí zákazník v seznamu nabídek.</p>
          </div>

          <div className="pointer-events-none max-w-sm select-none">
            <ServiceCard
              service={previewService}
              categoryName={activeCat?.name}
              subcatNames={previewSubNames}
              preview
            />
          </div>

          {serviceId && <BrandPicker serviceId={serviceId} />}

          <dl className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
            {[
              ['Název', wTitle.trim() || '—'],
              ['Co děláte', previewSubNames.join(', ') || 'nevybráno'],
              ['Kde', locationType === 'u_poskytovatele'
                ? `U vás — ${wCity || '—'}`
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
            {hasActiveSub ? 'Hotovo — přejít na Moje nabídky' : 'Uložit a přejít k předplatnému'}
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
                  : krok === 3 ? 'Rozvrh' : 'Připraveno'}
              </p>
              <p className="text-xs text-slate-500">
                {krok === 1 ? (krok1Hotovy ? 'Teď služby a ceny — u každé cena a délka.' : 'Doplňte název, obor a město.')
                  : krok === 2 ? (krok2Hotovy ? 'Zbývá říct, kdy máte čas.' : 'Bez ceny si u vás zákazník nemůže objednat.')
                  : krok === 3 ? 'Pak už jen zkontrolovat a zveřejnit.'
                  : 'Zkontrolujte souhrn a nabídku zveřejněte.'}
              </p>
            </div>
            {krok < 4 && (
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