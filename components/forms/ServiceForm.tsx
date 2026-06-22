'use client'
// components/forms/ServiceForm.tsx – kategorie z DB + Model A/B + storno politika

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { createService, updateService } from '@/lib/actions/services'
import type { Service } from '@/types/database'
import ImageUpload from '@/components/ui/ImageUpload'
import CancellationSlider from '@/components/ui/CancellationSlider'
import type { CancellationKey } from '@/lib/cancellation'

const schema = z.object({
  title: z.string().min(5, 'Název musí mít alespoň 5 znaků').max(100),
  description: z.string().min(20, 'Popis musí mít alespoň 20 znaků').max(2000),
  category: z.string().min(1, 'Vyberte kategorii'),
  subcategory_id: z.string().optional(),
  subcategory_ids: z.array(z.string()).optional(),
  service_type: z.string().optional(),
  price: z.number({ invalid_type_error: 'Zadejte platnou cenu' }).min(0).max(999999),
  price_unit: z.enum(['hod','kus','den','projekt']),
  city: z.string().min(2, 'Zadejte město').max(100),
  image_url: z.string().optional(),

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
] as const

// pomocná: number | null z inputu
const numOrNull = (v: string) => (v === '' || v == null ? null : Number(v))

export default function ServiceForm({ mode, initialData, onSuccess }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [submitState, setSubmitState] = useState<'idle'|'loading'|'success'|'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
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
      image_url: initialData.image_url ?? '',
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
      cancellation_policy: (init.cancellation_policy as CancellationKey) ?? 'zadna',
    } : {
      price_unit: 'hod',
      subcategory_ids: [],
      payment_model: 'A',
      price_type: 'fixed',
      deposit_amount: 200,
      price_max: null, duration_minutes: null,
      quote_fee: null, price_per_km: null, free_km: null, quote_days: null,
      cancellation_policy: 'zadna',
    },
  })

  const selectedCategory = watch('category')
  const selectedSubcategoryId = watch('subcategory_id')
  const selectedSubIds: string[] = watch('subcategory_ids') ?? []
  const model = watch('payment_model')
  const priceType = watch('price_type')
  const cancellationPolicy = watch('cancellation_policy')

  // Načti kategorie z DB
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => { setCategories(data.categories ?? []); setLoadingCats(false) })
      .catch(() => setLoadingCats(false))
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

  return (
    <motion.form onSubmit={handleSubmit(onSubmit as any)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">

      {/* Název */}
      <div className="space-y-1.5">
        <label className="form-label">Název služby *</label>
        <input {...f('title')} placeholder="např. Montáž klimatizace" className={`form-input ${errors.title ? 'form-input-error' : ''}`} />
        {errors.title && <p className="form-error">{errors.title.message}</p>}
      </div>

      {/* Popis */}
      <div className="space-y-1.5">
        <label className="form-label">Popis služby *</label>
        <textarea {...f('description')} rows={4} placeholder="Popište co přesně nabízíte, zkušenosti, oblast působení..." className={`form-input resize-none ${errors.description ? 'form-input-error' : ''}`} />
        {errors.description && <p className="form-error">{errors.description.message}</p>}
      </div>

      {/* Kategorie z DB – 3 úrovně */}
      <div className="space-y-3">
        <label className="form-label">Kategorie *</label>

        {loadingCats ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítám kategorie…
          </div>
        ) : (
          <>
            {/* Level 1 – hlavní kategorie */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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

      {/* Bod D – nenašli jste obor? */}
      {selectedCategory && (
        <p className="-mt-2 text-xs text-slate-400">
          Nevidíte svůj obor?{' '}
          <a
            href="mailto:podpora@propojo.cz?subject=Chybejici%20obor"
            className="font-semibold text-emerald-600 hover:underline"
          >
            Napište nám
          </a>{' '}
          a doplníme ho.
        </p>
      )}

      {/* ============ ZPŮSOB PLATBY (Model A/B) ============ */}
      <div className="space-y-3">
        <label className="form-label">Způsob platby *</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Model A */}
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
              <span className="text-sm font-extrabold text-slate-900">Model A</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">Rezervační záloha. Pro služby s předvídatelnou cenou (kadeřnictví, úklid, drobné opravy).</p>
          </button>

          {/* Model B */}
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
              <span className="text-sm font-extrabold text-slate-900">Model B</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">Výjezd + nacenění. Pro stavby a větší práce, kde cenu nelze určit předem.</p>
          </button>
        </div>
      </div>

      {/* ====== MODEL A SEKCE ====== */}
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

            {/* Pevná cena */}
            {priceType === 'fixed' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="form-label">Cena (Kč) *</label>
                  <input {...f('price', { valueAsNumber: true })} type="number" min={0} placeholder="350" className={`form-input ${errors.price ? 'form-input-error' : ''}`} />
                  {errors.price && <p className="form-error">{errors.price.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Délka (minut)</label>
                  <input type="number" min={0} placeholder="120"
                    defaultValue={watch('duration_minutes') ?? ''}
                    onChange={e => setValue('duration_minutes', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
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

            {/* Storno politika */}
            <div className="space-y-1.5">
              <label className="form-label">Storno podmínky</label>
              <p className="text-xs text-slate-400">Nastavte, za jakých podmínek se zákazníkovi vrací záloha při zrušení. Zákazník je uvidí u služby.</p>
              <div className="pt-2">
                <CancellationSlider
                  value={cancellationPolicy}
                  onChange={(key) => setValue('cancellation_policy', key)}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== MODEL B SEKCE ====== */}
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

      {/* Jednotka ceny (platí pro Model A s cenou) */}
      {model === 'A' && priceType !== 'on_agreement' && (
        <div className="space-y-1.5">
          <label className="form-label">Jednotka ceny *</label>
          <div className="relative">
            <select {...f('price_unit')} className="form-input appearance-none pr-8">
              {PRICE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      )}

      {/* Město */}
      <div className="space-y-1.5">
        <label className="form-label">Město působiště *</label>
        <input {...f('city')} placeholder="Praha, Brno, Ostrava…" className={`form-input ${errors.city ? 'form-input-error' : ''}`} />
        {errors.city && <p className="form-error">{errors.city.message}</p>}
      </div>

      {/* Foto */}
      <div className="space-y-1.5">
        <label className="form-label">Fotografie <span className="font-normal text-slate-400">(volitelné)</span></label>
        <ImageUpload value={watch('image_url')} onChange={url => setValue('image_url', url)} folder="services" />
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
  )
}