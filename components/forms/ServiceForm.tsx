'use client'
// components/forms/ServiceForm.tsx – kategorie z DB + Model A/B + storno politika + místo výkonu
// + dojezdová vzdálenost (radius) + galerie ukázek práce + ŽIVÝ NÁHLED KARTY
// Pořadí: Název → Popis → Kategorie → Kde vykonáváte → Město → Dojezd → Platba (+jednotka)
//         → Storno → Fotky (titulní + galerie)
//
// Náhled karty používá PŘÍMO komponentu ServiceCard z marketplace — takže to,
// co poskytovatel vidí, je přesně to, co uvidí zákazník. Nikdy se nerozejdou.

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, Info, Store, Home, Shuffle, Lightbulb, Eye } from 'lucide-react'
import { createService, updateService } from '@/lib/actions/services'
import type { Service } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import ServiceCard from '@/components/ui/ServiceCard'
import ImageUpload from '@/components/ui/ImageUpload'
import GalleryUpload from '@/components/ui/GalleryUpload'
import CancellationSlider from '@/components/ui/CancellationSlider'
import AddressInput from '@/components/ui/AddressInput'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import type { CancellationKey } from '@/lib/cancellation'

const schema = z.object({
  title: z.string().min(5, 'Název musí mít alespoň 5 znaků').max(100),
  description: z.string().min(20, 'Popis musí mít alespoň 20 znaků').max(2000),
  category: z.string().min(1, 'Vyberte kategorii'),
  subcategory_id: z.string().optional(),
  subcategory_ids: z.array(z.string()).optional(),
  service_type: z.string().optional(),
  price: z.number({ invalid_type_error: 'Zadejte platnou cenu' }).min(0).max(999999),
  price_unit: z.enum(['hod','kus','den','projekt','m2']),
  city: z.string().min(2, 'Zadejte město').max(100),
  city_lat: z.number().nullable().optional(),
  city_lng: z.number().nullable().optional(),
  image_url: z.string().optional(),
  gallery: z.array(z.string()).optional(),

  // Model A/B
  payment_model: z.enum(['A','B']),
  price_type: z.enum(['fixed','range','on_agreement']),
  price_max: z.number().min(0).max(999999).nullable().optional(),
  deposit_amount: z.number().min(0).max(999999).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  quote_fee: z.number().min(0).max(999999).nullable().optional(),
  price_per_km: z.number().min(0).max(99999).nullable().optional(),
  free_km: z.number().int().min(0).max(100000).nullable().optional(),
  quote_days: z.number().int().min(0).max(365).nullable().optional(),

  // Kde se služba vykonává
  location_type: z.enum(['u_poskytovatele','u_zakaznika','oboji']),
  // Dojezdová vzdálenost (relevantní jen když poskytovatel jezdí za zákazníkem)
  radius_km: z.number().int().min(1).max(300).nullable().optional(),

  // Adresa provozovny (jen u_poskytovatele/oboji) — karta = služba NEBO pobočka
  address: z.string().max(200).nullable().optional(),
  address_lat: z.number().nullable().optional(),
  address_lng: z.number().nullable().optional(),
  address_public: z.boolean().optional(),

  // Storno politika
  cancellation_policy: z.enum(['zadna','mirna','standardni','prisna']),
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
}

const PRICE_UNITS = [
  { value: 'hod', label: 'za hodinu' },
  { value: 'den', label: 'za den' },
  { value: 'kus', label: 'za kus' },
  { value: 'projekt', label: 'za projekt' },
  { value: 'm2', label: 'za m²' },
] as const

// Konkrétní příklad, ne jen instrukce — ukazuje strukturu dobrého popisu (zkušenost, co je
// v ceně, spolehlivost), aby poskytovatel věděl, co a jak napsat, i když dělá jiný obor.
const DESCRIPTION_PLACEHOLDER = 'Např.: Této práci se věnuji už 6 let a mám za sebou desítky spokojených zákazníků. Pracuji pečlivě a se vším potřebným vybavením, takže se nemusíte o nic starat. Rád se s vámi předem domluvím na přesném rozsahu i termínu, ať víte, co očekávat.'

// pomocná: number | null z inputu
const numOrNull = (v: string) => (v === '' || v == null ? null : Number(v))

export default function ServiceForm({ mode, initialData, onSuccess }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [submitState, setSubmitState] = useState<'idle'|'loading'|'success'|'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Profil poskytovatele — aby náhled karty ukazoval skutečné jméno, avatar a odznak
  // ověření, ne vymyšlená data.
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()

  const init = initialData as any

  const { register: f, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? {
      title: initialData.title,
      description: initialData.description,
      category: initialData.category,
      price: initialData.price ?? 0,
      price_unit: initialData.price_unit as any,
      city: initialData.city,
      city_lat: init.city_lat ?? null,
      city_lng: init.city_lng ?? null,
      image_url: initialData.image_url ?? '',
      gallery: init.gallery ?? [],
      subcategory_ids: (init.subcategory_id ? [init.subcategory_id] : []),
      payment_model: (init.payment_model as 'A'|'B') ?? 'A',
      price_type: (init.price_type as 'fixed'|'range'|'on_agreement') ?? 'fixed',
      price_max: init.price_max ?? null,
      deposit_amount: init.deposit_amount ?? 200,
      duration_minutes: init.duration_minutes ?? null,
      quote_fee: init.quote_fee ?? null,
      price_per_km: init.price_per_km ?? null,
      free_km: init.free_km ?? null,
      quote_days: init.quote_days ?? null,
      location_type: (init.location_type as 'u_poskytovatele'|'u_zakaznika'|'oboji') ?? 'u_zakaznika',
      radius_km: init.radius_km ?? null,
      address: init.address ?? null,
      address_lat: init.address_lat ?? null,
      address_lng: init.address_lng ?? null,
      address_public: init.address_public ?? true,
      cancellation_policy: (init.cancellation_policy as CancellationKey) ?? 'zadna',
    } : {
      price_unit: 'hod',
      subcategory_ids: [],
      city_lat: null,
      city_lng: null,
      gallery: [],
      payment_model: 'A',
      price_type: 'fixed',
      deposit_amount: 200,
      price_max: null, duration_minutes: null,
      quote_fee: null, price_per_km: null, free_km: null, quote_days: null,
      location_type: 'u_zakaznika',
      radius_km: null,
      address: null,
      address_lat: null,
      address_lng: null,
      address_public: true,
      cancellation_policy: 'zadna',
    },
  })

  const selectedCategory = watch('category')
  const selectedSubcategoryId = watch('subcategory_id')
  const selectedSubIds: string[] = watch('subcategory_ids') ?? []
  const model = watch('payment_model')
  const priceType = watch('price_type')
  const cancellationPolicy = watch('cancellation_policy')
  const locationType = watch('location_type')
  const priceUnit = watch('price_unit')

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

  const activeCat = categories.find(c => c.slug === selectedCategory)
  const lastSubId = selectedSubIds[selectedSubIds.length - 1]
  const activeSub = activeCat?.subcategories.find(s => s.id === lastSubId)
  const toggleSub = (id: string) => {
    const exists = selectedSubIds.includes(id)
    const next = exists ? selectedSubIds.filter(x => x !== id) : [...selectedSubIds, id]
    setValue('subcategory_ids', next)
    setValue('subcategory_id', next[0] ?? '')
  }

  const onSubmit = async (data: FormValues) => {
    setSubmitState('loading'); setErrorMsg('')
    const result = mode === 'create'
      ? await createService(data as any)
      : await updateService(initialData!.id, data as any)
    if (result.success) {
      setSubmitState('success')
      onSuccess?.(result.id)
      if (mode === 'create') {
        router.push('/dashboard/nabidky')
        router.refresh()
      }
    }
    else { setSubmitState('error'); setErrorMsg(result.error); setTimeout(() => setSubmitState('idle'), 4000) }
  }

  // ─────────────────────────────────────────────────────────────
  //  ŽIVÝ NÁHLED KARTY — sestaven z toho, co je právě ve formuláři
  // ─────────────────────────────────────────────────────────────
  const wTitle = watch('title') ?? ''
  const wCity = watch('city') ?? ''
  const wImage = watch('image_url') ?? ''
  const wPrice = watch('price')
  const wQuoteFee = watch('quote_fee')

  const previewSubNames = (activeCat?.subcategories ?? [])
    .filter(sub => selectedSubIds.includes(sub.id))
    .map(sub => sub.name)

  const previewService = {
    id: initialData?.id ?? 'nahled',
    provider_id: profile?.id ?? 'nahled',
    title: wTitle.trim() || 'Název vaší služby',
    category: selectedCategory ?? '',
    city: wCity.trim() || 'Vaše město',
    image_url: wImage || null,
    price: Number(wPrice) || 0,
    price_unit: priceUnit,
    quote_fee: Number(wQuoteFee) || 0,
    payment_model: model,
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

      {/* pointer-events-none: karta je jen k prohlédnutí, odkazy nikam nevedou */}
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
    </div>
  )

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_340px]">

      {/* NÁHLED — na mobilu nahoře, na širokém monitoru vpravo a přilepený */}
      <div className="xl:order-2">{preview}</div>

      {/* FORMULÁŘ */}
      <motion.form
        onSubmit={handleSubmit(onSubmit as any)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 xl:order-1"
      >

        {/* Tip: konkrétní karty se hledají líp */}
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-xs leading-relaxed text-slate-600">
            <strong className="text-slate-800">Konkrétní nabídky se hledají líp.</strong>{' '}
            Zákazníci nehledají „automechanik", ale „výměna oleje". Místo jedné široké nabídky
            vytvořte radši několik konkrétních — každou s vlastní cenou i termínem.
          </p>
        </div>

        {/* ============ 1. NÁZEV ============ */}
        <div className="space-y-1.5">
          <label className="form-label flex items-center justify-between">
            <span>Název služby *</span>
            <span className="text-xs font-normal text-slate-400">{wTitle.length} / 100</span>
          </label>
          <input {...f('title')} maxLength={100} placeholder="např. Výměna oleje a filtrů" className={`form-input ${errors.title ? 'form-input-error' : ''}`} />
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>

        {/* ============ 2. POPIS ============ */}
        <div className="space-y-1.5">
          <label className="form-label">Popis služby *</label>
          <textarea {...f('description')} rows={4} placeholder={DESCRIPTION_PLACEHOLDER} className={`form-input resize-none ${errors.description ? 'form-input-error' : ''}`} />
          {errors.description && <p className="form-error">{errors.description.message}</p>}
        </div>

        {/* ============ 3. KATEGORIE (3 úrovně z DB) ============ */}
        <div className="space-y-3">
          <label className="form-label">Kategorie *</label>

          {loadingCats ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítám kategorie…
            </div>
          ) : (
            <>
              {/* Level 1 – hlavní kategorie */}
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

              {/* Level 2 – podkategorie */}
              <AnimatePresence>
                {activeCat && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <ChevronRight className="h-3 w-3" /> Podkategorie (vyberte i více)
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

              {/* Level 3 – typ služby */}
              <AnimatePresence>
                {activeSub && activeSub.service_types && activeSub.service_types.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" /> Typ služby
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeSub.service_types.map(st => {
                        const isSelected = watch('service_type') === st.name
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              setValue('service_type', st.name)
                              if (!watch('title') || watch('title').length < 5) {
                                setValue('title', st.name)
                              }
                            }}
                            className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {st.name}
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

        {/* ============ 4. KDE VYKONÁVÁTE SLUŽBU? ============ */}
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

        {/* ============ 5. MĚSTO PŮSOBIŠTĚ ============ */}
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
            Vyberte obec ze seznamu (ne jen napište) — jinak nepůjde spočítat dojezdovou vzdálenost pro zákazníky.
          </p>
        </div>

        {/* ============ 5b. ADRESA PROVOZOVNY ============ */}
        {/* Karta = služba NEBO pobočka: nese vlastní přesnou adresu. Vyplňuje se
            jen když zákazník chodí za poskytovatelem (u_poskytovatele / oboji). */}
        <AnimatePresence>
          {locationType !== 'u_zakaznika' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
              <label className="form-label">Přesná adresa provozovny</label>
              <AddressInput
                defaultValue={watch('address')}
                onPick={(a) => {
                  setValue('address', a.address, { shouldValidate: true })
                  setValue('address_lat', a.lat)
                  setValue('address_lng', a.lng)
                }}
                onFreeText={(text) => {
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

        {/* ============ 6. DOJEZDOVÁ VZDÁLENOST ============ */}
        <AnimatePresence>
          {locationType !== 'u_poskytovatele' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
              <label className="form-label">Dojezdová vzdálenost (km)</label>
              <input
                type="number" min={1} max={300} placeholder="20"
                defaultValue={watch('radius_km') ?? ''}
                onChange={e => setValue('radius_km', numOrNull(e.target.value) as any)}
                className="form-input"
              />
              <p className="text-xs text-slate-400">
                Jak daleko od zadaného města jste ochotní dojet. Zákazníci si podle toho budou moct vyfiltrovat,
                jestli je váš dosah pokrývá.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ 7. ZPŮSOB PLATBY (Model A/B) ============ */}
        <div className="space-y-3">
          <label className="form-label">Způsob platby *</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setValue('payment_model', 'A'); setValue('price_type', 'fixed') }}
              className={`rounded-2xl border-2 p-4 text-left transition-all ${
                model === 'A' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${model === 'A' ? 'border-emerald-500' : 'border-slate-300'}`}>
                  {model === 'A' && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </span>
                <span className="text-sm font-extrabold text-slate-900">Rezervace se zálohou</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Rezervační záloha. Pro služby s předvídatelnou cenou (kadeřnictví, úklid, drobné opravy).</p>
            </button>

            <button
              type="button"
              onClick={() => { setValue('payment_model', 'B'); setValue('price', 0); setValue('price_type', 'on_agreement') }}
              className={`rounded-2xl border-2 p-4 text-left transition-all ${
                model === 'B' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${model === 'B' ? 'border-emerald-500' : 'border-slate-300'}`}>
                  {model === 'B' && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </span>
                <span className="text-sm font-extrabold text-slate-900">Výjezd a nacenění</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Výjezd + nacenění. Pro stavby a větší práce, kde cenu nelze určit předem.</p>
            </button>
          </div>
        </div>

        {/* ── Model A: detaily ceny (vč. jednotky ceny hned u typu ceny) ── */}
        <AnimatePresence>
          {model === 'A' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
              {/* Typ ceny – taby */}
              <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1.5">
                {([
                  { value: 'fixed', label: 'Pevná cena' },
                  { value: 'range', label: 'Cenové rozmezí' },
                  { value: 'on_agreement', label: 'Po domluvě' },
                ] as const).map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => { setValue('price_type', t.value); if (t.value === 'on_agreement') setValue('price', 0) }}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
                      priceType === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Jednotka ceny — pilulky místo <select>: na mobilu se nativní select
                  s appearance-none vykresloval nenápadně a šel přehlédnout. Tlačítka
                  jsou vidět vždy a ladí se zbytkem formuláře. */}
              {priceType !== 'on_agreement' && (
                <div className="space-y-1.5">
                  <label className="form-label">Jednotka ceny *</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRICE_UNITS.map(u => (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => setValue('price_unit', u.value as any)}
                        className={`rounded-lg border px-3 py-2 text-sm font-bold transition-all ${
                          priceUnit === u.value
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-slate-700'
                        }`}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pevná cena */}
              {priceType === 'fixed' && (
                <div className={`grid gap-4 ${priceUnit === 'hod' || priceUnit === 'kus' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-1.5">
                    <label className="form-label">Cena (Kč) *</label>
                    <input {...f('price', { valueAsNumber: true })} type="number" min={0} placeholder="350" className={`form-input ${errors.price ? 'form-input-error' : ''}`} />
                    {errors.price && <p className="form-error">{errors.price.message}</p>}
                  </div>
                  {(priceUnit === 'hod' || priceUnit === 'kus') && (
                    <div className="space-y-1.5">
                      <label className="form-label">Délka (minut)</label>
                      <input type="number" min={0} placeholder="120"
                        defaultValue={watch('duration_minutes') ?? ''}
                        onChange={e => setValue('duration_minutes', numOrNull(e.target.value))}
                        className="form-input" />
                    </div>
                  )}
                </div>
              )}

              {/* Cenové rozmezí */}
              {priceType === 'range' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="form-label">Cena od (Kč) *</label>
                    <input {...f('price', { valueAsNumber: true })} type="number" min={0} placeholder="800" className={`form-input ${errors.price ? 'form-input-error' : ''}`} />
                    {errors.price && <p className="form-error">{errors.price.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Cena do (Kč) *</label>
                    <input type="number" min={0} placeholder="1500"
                      defaultValue={watch('price_max') ?? ''}
                      onChange={e => setValue('price_max', numOrNull(e.target.value))}
                      className="form-input" />
                  </div>
                </div>
              )}

              {/* Po domluvě */}
              {priceType === 'on_agreement' && (
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span>Cena bude domluvena se zákazníkem. Na webu se zobrazí „Cena dohodou".</span>
                </div>
              )}

              {/* Rezervační záloha */}
              <div className="space-y-1.5">
                <label className="form-label">Rezervační záloha (Kč)</label>
                <input type="number" min={200} placeholder="200"
                  defaultValue={watch('deposit_amount') ?? 200}
                  onChange={e => setValue('deposit_amount', numOrNull(e.target.value))}
                  className="form-input" />
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span>Minimální záloha je 200 Kč. Záloha se započítá do konečné ceny.</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Model B: detaily výjezdu ── */}
        <AnimatePresence>
          {model === 'B' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
              <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <span>Zákazník zaplatí za výjezd a vystavení cenové nabídky. Pokud nabídku přijme, poplatek se započítá do celkové ceny.</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="form-label">Poplatek za nacenění (Kč)</label>
                  <input type="number" min={0} placeholder="500"
                    defaultValue={watch('quote_fee') ?? ''}
                    onChange={e => setValue('quote_fee', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Cena za km cesty (Kč)</label>
                  <input type="number" min={0} placeholder="12"
                    defaultValue={watch('price_per_km') ?? ''}
                    onChange={e => setValue('price_per_km', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Doprava zdarma do (km)</label>
                  <input type="number" min={0} placeholder="10"
                    defaultValue={watch('free_km') ?? ''}
                    onChange={e => setValue('free_km', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Nabídku dodám do (dnů)</label>
                  <input type="number" min={0} placeholder="3"
                    defaultValue={watch('quote_days') ?? ''}
                    onChange={e => setValue('quote_days', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ 8. STORNO PODMÍNKY (vlastní krok, jen u Modelu A — je záloha) ============ */}
        <AnimatePresence>
          {model === 'A' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
              <label className="form-label">Storno podmínky</label>
              <p className="text-xs text-slate-400">Nastavte, za jakých podmínek se zákazníkovi vrací záloha při zrušení. Zákazník je uvidí u služby.</p>
              <div className="pt-2">
                <CancellationSlider
                  value={cancellationPolicy}
                  onChange={(key) => setValue('cancellation_policy', key)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ 9. FOTKY — titulní + galerie ukázek práce ============ */}
        <div className="space-y-5 border-t border-slate-100 pt-5">
          <div className="space-y-1.5">
            <label className="form-label">
              Titulní fotografie <span className="font-normal text-slate-400">(volitelné)</span>
            </label>
            <p className="text-xs text-slate-400">Hlavní fotka — zobrazí se na kartě v marketplace a nahoře na detailu služby.</p>
            <ImageUpload value={watch('image_url')} onChange={url => setValue('image_url', url)} folder="services" />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">
              Ukázky práce <span className="font-normal text-slate-400">(volitelné)</span>
            </label>
            <p className="text-xs text-slate-400">
              Několik fotek odvedené práce — zobrazí se jako galerie na detailu služby. Zákazníci díky nim líp
              uvidí, na jaké úrovni pracujete, ještě než si vás objednají.
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
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {mode === 'create' ? 'Služba byla úspěšně přidána!' : 'Změny byly uloženy.'}
            </motion.div>
          )}
        </AnimatePresence>

        <button type="submit" disabled={submitState === 'loading' || submitState === 'success'} className="btn-primary w-full">
          {submitState === 'loading' ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
           : submitState === 'success' ? <><CheckCircle2 className="h-4 w-4" /> Uloženo</>
           : mode === 'create' ? 'Zveřejnit službu' : 'Uložit změny'}
        </button>
      </motion.form>
    </div>
  )
}