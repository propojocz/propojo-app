'use client'
// components/forms/ServiceForm.tsx — model „karta + ceník"
//
// Karta = identita provozovny (název, podtitul, foto, galerie, kategorie,
// podkategorie, kde pracujete, město, adresa, dojezd, telefon, popis).
// Cena/model/délka/záloha/materiál/storno se sem UŽ NEPÍŠE — nese je ceník
// (service_items) přes komponentu PriceList níže.
//
// Dvě fáze ukládání:
//  1) Vyplníte kartu → „Uložit kartu a pokračovat k ceníku“ → karta dostane id
//  2) Pod formulářem se otevře ceník, přidáte úkony → „Hotovo“
// V režimu edit je karta rovnou ve fázi 2 (id už existuje).

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, ChevronRight, Store, Home, Shuffle, Lightbulb, Eye, ListChecks, Truck, Info } from 'lucide-react'
import { createService, updateService } from '@/lib/actions/services'
import type { Service, ServiceItem } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import ServiceCard from '@/components/ui/ServiceCard'
import ImageUpload from '@/components/ui/ImageUpload'
import GalleryUpload from '@/components/ui/GalleryUpload'
import AddressInput from '@/components/ui/AddressInput'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import PriceList from '@/components/ui/PriceList'
import type { ServiceTypeOption } from '@/components/ui/ServiceItemEditor'

const schema = z.object({
  title: z.string().min(5, 'Název musí mít alespoň 5 znaků').max(100),
  subtitle: z.string().max(80).nullable().optional(),
  description: z.string().min(20, 'Popis musí mít alespoň 20 znaků').max(2000),
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
  location_type: z.enum(['u_poskytovatele', 'u_zakaznika', 'oboji']),
  radius_km: z.number().int().min(1).max(300).nullable().optional(),

  // Výjezd a nacenění (model B) — patří ke KARTĚ, ne k úkonu: poskytovatel má
  // jednu sazbu za cestu, ať jede nacenit cokoli. Váže se na radius_km výše.
  quote_fee: z.number().min(0).max(999999).nullable().optional(),
  price_per_km: z.number().min(0).max(99999).nullable().optional(),
  free_km: z.number().int().min(0).max(100000).nullable().optional(),
  quote_days: z.number().int().min(0).max(365).nullable().optional(),

  // Adresa provozovny (jen u_poskytovatele/oboji)
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
  /** Má poskytovatel aktivní předplatné? Bez něj se karta po uložení nezveřejní. */
  hasActiveSub?: boolean
}

export default function ServiceForm({ mode, initialData, onSuccess, hasActiveSub = true }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [profile, setProfile] = useState<any>(null)

  // ID uložené karty — řídí fázi. V edit režimu je hned, v create až po uložení.
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
      description: initialData.description,
      category: initialData.category,
      phone: init.phone ?? null,
      city: initialData.city,
      city_lat: init.city_lat ?? null,
      city_lng: init.city_lng ?? null,
      image_url: initialData.image_url ?? '',
      gallery: init.gallery ?? [],
      subcategory_ids: (init.subcategory_ids ?? (init.subcategory_id ? [init.subcategory_id] : [])),
      location_type: (init.location_type as 'u_poskytovatele' | 'u_zakaznika' | 'oboji') ?? 'u_zakaznika',
      radius_km: init.radius_km ?? null,
      quote_fee: init.quote_fee ?? null,
      price_per_km: init.price_per_km ?? null,
      free_km: init.free_km ?? null,
      quote_days: init.quote_days ?? null,
      address: init.address ?? null,
      address_lat: init.address_lat ?? null,
      address_lng: init.address_lng ?? null,
      address_public: init.address_public ?? true,
    } : {
      subtitle: null,
      phone: null,
      subcategory_ids: [],
      city_lat: null,
      city_lng: null,
      gallery: [],
      location_type: 'u_zakaznika',
      radius_km: null,
      quote_fee: null,
      price_per_km: null,
      free_km: null,
      quote_days: null,
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

  // Typy služeb nabídnuté z vybraných podkategorií — vstup do ceníku (našeptávač názvu).
  const serviceTypesForItems: ServiceTypeOption[] = (activeCat?.subcategories ?? [])
    .filter(sub => selectedSubIds.includes(sub.id))
    .flatMap(sub => sub.service_types ?? [])
    .map(st => ({ id: st.id, name: st.name }))

  // ── Uložení KARTY ──
  const onSubmit = async (data: FormValues) => {
    setSubmitState('loading'); setErrorMsg('')
    const result = serviceId
      ? await updateService(serviceId, data as any)
      : await createService(data as any)

    if (result.success) {
      setSubmitState('success')
      setServiceId(result.id)       // fáze 2 se otevře, ceník se načte
      onSuccess?.(result.id)
      setTimeout(() => setSubmitState('idle'), 2500)
      // Po prvním uložení sroluj k ceníku
      if (mode === 'create') {
        setTimeout(() => {
          document.getElementById('cenik')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 200)
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

  const previewSubNames = (activeCat?.subcategories ?? [])
    .filter(sub => selectedSubIds.includes(sub.id))
    .map(sub => sub.name)

  // Cena v náhledu se bere z nejlevnějšího zveřejněného úkonu ceníku (fallback: bez ceny).
  const activeItems = items.filter(i => i.is_active)
  const cheapest = activeItems
    .filter(i => i.payment_model !== 'B' && i.price != null && i.price > 0)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0]

  const previewService = {
    id: serviceId ?? 'nahled',
    provider_id: profile?.id ?? 'nahled',
    title: wTitle.trim() || 'Název vaší karty',
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

  const preview = (
    <div className="xl:sticky xl:top-20">
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
      {!wImage && (
        <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          Karty s fotkou dostávají výrazně víc kliknutí než ty bez. Přidejte titulní fotku níže.
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
    <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
      <div className="xl:order-2">{preview}</div>

      <motion.form
        onSubmit={handleSubmit(onSubmit as any)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 xl:order-1"
      >
        {/* Tip */}
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-xs leading-relaxed text-slate-600">
            <strong className="text-slate-800">Karta = jedna provozovna nebo obor.</strong>{' '}
            Kadeřnictví je jedna karta — jednotlivé úkony (střih, barvení, obočí) přidáte níže do ceníku,
            každý s vlastní cenou a délkou. Autoservis patří na samostatnou kartu.
          </p>
        </div>

        {/* 1. NÁZEV */}
        <div className="space-y-1.5">
          <label className="form-label flex items-center justify-between">
            <span>Název karty *</span>
            <span className="text-xs font-normal text-slate-400">{wTitle.length} / 100</span>
          </label>
          <input {...f('title')} maxLength={100} placeholder="např. Salon Bella / Jan Novák – malířství" className={`form-input ${errors.title ? 'form-input-error' : ''}`} />
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>

        {/* 2. PODTITUL */}
        <div className="space-y-1.5">
          <label className="form-label">Podtitul <span className="font-normal text-slate-400">(volitelné)</span></label>
          <input
            type="text" maxLength={80} placeholder="např. Kadeřnictví a barbershop"
            defaultValue={watch('subtitle') ?? ''}
            onChange={e => setValue('subtitle', e.target.value || null)}
            className="form-input"
          />
          <p className="text-xs text-slate-400">Krátké upřesnění pod názvem — pomáhá zákazníkovi hned poznat, co děláte.</p>
        </div>

        {/* 3. POPIS */}
        <div className="space-y-1.5">
          <label className="form-label">Popis *</label>
          <textarea
            {...f('description')} rows={4}
            placeholder="Např.: Salon v centru Vsetína. Stříháme dámy i pány, děláme permanentní make-up. Ceny jednotlivých úkonů najdete v ceníku níže."
            className={`form-input resize-none ${errors.description ? 'form-input-error' : ''}`}
          />
          <p className="text-xs text-slate-400">Ceny sem nepište — patří do ceníku, kde se dají rovnou objednat.</p>
          {errors.description && <p className="form-error">{errors.description.message}</p>}
        </div>

        {/* 4. KATEGORIE */}
        <div className="space-y-3">
          <label className="form-label">Hlavní kategorie *</label>
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
                      <ChevronRight className="h-3 w-3" /> Podkategorie (vyberte i více — podle nich se v ceníku nabídnou úkony)
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
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          {errors.category && <p className="form-error">{errors.category.message}</p>}
        </div>

        {selectedCategory && (
          <p className="-mt-2 text-xs text-slate-400">
            Nevidíte svůj obor?{' '}
            <a href="mailto:podpora@propojo.cz?subject=Chybejici%20obor" className="font-semibold text-emerald-600 hover:underline">
              Napište nám
            </a>{' '}
            a doplníme ho.
          </p>
        )}

        {/* 5. KDE VYKONÁVÁTE */}
        <div className="space-y-3">
          <label className="form-label">Kde vykonáváte svou službu? *</label>
          <p className="-mt-1 text-xs text-slate-400">Podle toho poznáme, jestli po zákazníkovi chtít adresu.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              { value: 'u_poskytovatele', icon: Store, title: 'Zákazník přijde za mnou', desc: 'Mám provozovnu (salon, dílna)' },
              { value: 'u_zakaznika', icon: Home, title: 'Jezdím za zákazníkem', desc: 'Dorazím na jeho adresu' },
              { value: 'oboji', icon: Shuffle, title: 'Obojí', desc: 'Podle domluvy se zákazníkem' },
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
        </div>

        {/* 6. MĚSTO */}
        <div className="space-y-1.5">
          <label className="form-label">Město působiště *</label>
          <SearchAutocomplete
            mode="obce"
            defaultValue={watch('city')}
            placeholder="Začněte psát a vyberte obec ze seznamu…"
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
            Podle města vás zákazníci najdou ve vyhledávání a zobrazí se na kartě.
            {locationType !== 'u_zakaznika'
              ? ' Máte-li provozovnu, doplní se samo z adresy níže.'
              : ' Vyberte obec ze seznamu (ne jen napište) — jinak nepůjde spočítat dojezdovou vzdálenost.'}
          </p>
        </div>

        {/* 6b. ADRESA PROVOZOVNY */}
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

        {/* 7. DOJEZD */}
        <AnimatePresence>
          {locationType !== 'u_poskytovatele' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
              <label className="form-label">Dojezdová vzdálenost (km)</label>
              <input
                type="number" min={1} max={300} placeholder="20"
                defaultValue={watch('radius_km') ?? ''}
                onChange={e => setValue('radius_km', (e.target.value === '' ? null : Number(e.target.value)) as any)}
                className="form-input"
              />
              <p className="text-xs text-slate-400">
                Jak daleko od zadaného města jste ochotní dojet. Zákazníci si podle toho vyfiltrují, jestli je váš dosah pokrývá.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 7b. VÝJEZD A NACENĚNÍ — navazuje na dojezd výše (kam jezdím → kolik za to).
             Volitelné: týká se jen poskytovatelů, kteří nabízejí úkony typu
             „přijedu, prohlédnu, nacením" (model B v ceníku). */}
        <AnimatePresence>
          {locationType !== 'u_poskytovatele' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-extrabold text-slate-800">
                    Výjezd a nacenění <span className="font-normal text-slate-400">(volitelné)</span>
                  </p>
                </div>
                <p className="mb-4 text-xs leading-relaxed text-slate-500">
                  Vyplňte, jen pokud budete mít v ceníku úkon typu <strong>„přijedu a nacením na místě"</strong> —
                  třeba zaměření nebo prohlídku před rekonstrukcí. Necháte-li prázdné, máte výjezd zdarma.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="form-label">Poplatek za nacenění (Kč)</label>
                    <input
                      type="number" min={0} placeholder="500"
                      defaultValue={watch('quote_fee') ?? ''}
                      onChange={e => setValue('quote_fee', (e.target.value === '' ? null : Number(e.target.value)) as any)}
                      className="form-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Nabídku dodám do (dnů)</label>
                    <input
                      type="number" min={0} max={365} placeholder="3"
                      defaultValue={watch('quote_days') ?? ''}
                      onChange={e => setValue('quote_days', (e.target.value === '' ? null : Number(e.target.value)) as any)}
                      className="form-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Doprava zdarma do (km)</label>
                    <input
                      type="number" min={0} placeholder="10"
                      defaultValue={watch('free_km') ?? ''}
                      onChange={e => setValue('free_km', (e.target.value === '' ? null : Number(e.target.value)) as any)}
                      className="form-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Nad rámec (Kč/km)</label>
                    <input
                      type="number" min={0} placeholder="12"
                      defaultValue={watch('price_per_km') ?? ''}
                      onChange={e => setValue('price_per_km', (e.target.value === '' ? null : Number(e.target.value)) as any)}
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Živý přepočet — ať poskytovatel hned vidí, co jeho čísla znamenají
                    pro zákazníka na hranici dojezdu. Bez toho se sazba za km špatně odhaduje. */}
                {Number(watch('price_per_km')) > 0 && Number(watch('radius_km')) > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      Zákazník na hranici vašeho dojezdu ({Number(watch('radius_km'))} km) zaplatí za cestu{' '}
                      <strong className="text-slate-900">
                        {Math.max(0, Number(watch('radius_km')) - Number(watch('free_km') ?? 0)) * Number(watch('price_per_km')) > 0
                          ? `${(Math.max(0, Number(watch('radius_km')) - Number(watch('free_km') ?? 0)) * Number(watch('price_per_km'))).toLocaleString('cs-CZ')} Kč`
                          : 'nic'}
                      </strong>
                      {Number(watch('quote_fee')) > 0 && (
                        <> a k tomu <strong className="text-slate-900">{Number(watch('quote_fee')).toLocaleString('cs-CZ')} Kč</strong> za nacenění</>
                      )}
                      . Přijme-li nabídku, započítá se to do celkové ceny.
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 8. TELEFON */}
        <div className="space-y-1.5">
          <label className="form-label">Telefon na tuto kartu <span className="font-normal text-slate-400">(volitelné)</span></label>
          <input
            type="text" maxLength={30} placeholder="+420 777 123 456"
            defaultValue={watch('phone') ?? ''}
            onChange={e => setValue('phone', e.target.value || null)}
            className="form-input"
          />
          <p className="text-xs text-slate-400">Když má pobočka vlastní číslo, uveďte ho tady. Jinak platí telefon z profilu.</p>
        </div>

        {/* 9. FOTKY */}
        <div className="space-y-5 border-t border-slate-100 pt-5">
          <div className="space-y-1.5">
            <label className="form-label">Titulní fotografie <span className="font-normal text-slate-400">(volitelné)</span></label>
            <p className="text-xs text-slate-400">Hlavní fotka — zobrazí se na kartě v marketplace a nahoře na detailu.</p>
            <ImageUpload value={watch('image_url')} onChange={url => setValue('image_url', url)} folder="services" />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Ukázky práce <span className="font-normal text-slate-400">(volitelné)</span></label>
            <p className="text-xs text-slate-400">
              Prvních 5 fotek si zákazník prolistuje přímo na kartě v marketplace, zbytek uvidí po otevření profilu.
            </p>
            <GalleryUpload value={watch('gallery') ?? []} onChange={(urls) => setValue('gallery', urls)} />
          </div>
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
                Karta byla uložena.{' '}
                {hasActiveSub
                  ? 'Teď doplňte ceník úkonů níže.'
                  : <strong>Zveřejní se zákazníkům, jakmile aktivujete předplatné.</strong>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Uložení karty */}
        <button type="submit" disabled={submitState === 'loading'} className="btn-primary w-full">
          {submitState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
           : serviceId ? 'Uložit změny karty'
           : 'Uložit kartu a pokračovat k ceníku'}
        </button>

        {/* ── CENÍK (fáze 2) ── */}
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
                  <ListChecks className="h-4 w-4 text-emerald-600" /> Ceník úkonů
                </label>
                <p className="text-xs text-slate-400">
                  Každý úkon má vlastní cenu, délku i zálohu. Zákazník si objedná konkrétní úkon, ne celou kartu.
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
                  onChanged={loadItems}
                />
              )}

              {mode === 'create' && (
                <button
                  type="button"
                  onClick={finish}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <CheckCircle2 className="h-4 w-4" /> Hotovo — přejít na Moje nabídky
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.form>
    </div>
  )
}