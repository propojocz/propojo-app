'use client'
// components/forms/ServiceForm.tsx – kategorie z DB

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { createService, updateService } from '@/lib/actions/services'
import type { Service } from '@/types/database'
import ImageUpload from '@/components/ui/ImageUpload'

const schema = z.object({
  title: z.string().min(5, 'Název musí mít alespoň 5 znaků').max(100),
  description: z.string().min(20, 'Popis musí mít alespoň 20 znaků').max(2000),
  category: z.string().min(1, 'Vyberte kategorii'),
  subcategory_id: z.string().optional(),
  service_type: z.string().optional(),
  price: z.number({ invalid_type_error: 'Zadejte platnou cenu' }).positive().max(999999),
  price_unit: z.enum(['hod','kus','den','projekt']),
  city: z.string().min(2, 'Zadejte město').max(100),
  image_url: z.string().optional(),
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

export default function ServiceForm({ mode, initialData, onSuccess }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [submitState, setSubmitState] = useState<'idle'|'loading'|'success'|'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const { register: f, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialData ? {
      title: initialData.title,
      description: initialData.description,
      category: initialData.category,
      price: initialData.price,
      price_unit: initialData.price_unit as any,
      city: initialData.city,
      image_url: initialData.image_url ?? '',
    } : { price_unit: 'hod' },
  })

  const selectedCategory = watch('category')
  const selectedSubcategoryId = watch('subcategory_id')

  // Načti kategorie z DB
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => { setCategories(data.categories ?? []); setLoadingCats(false) })
      .catch(() => setLoadingCats(false))
  }, [])

  const activeCat = categories.find(c => c.slug === selectedCategory)
  const activeSub = activeCat?.subcategories.find(s => s.id === selectedSubcategoryId)

  const onSubmit = async (data: FormValues) => {
    setSubmitState('loading'); setErrorMsg('')
    const result = mode === 'create'
      ? await createService(data)
      : await updateService(initialData!.id, data)
    if (result.success) { setSubmitState('success'); onSuccess?.(result.id) }
    else { setSubmitState('error'); setErrorMsg(result.error); setTimeout(() => setSubmitState('idle'), 4000) }
  }

  return (
    <motion.form onSubmit={handleSubmit(onSubmit)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">

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
                      setValue('service_type', '')
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
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
                    <ChevronRight className="h-3 w-3" /> Podkategorie
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeCat.subcategories.map(sub => {
                      const isSelected = selectedSubcategoryId === sub.id
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setValue('subcategory_id', sub.id)
                            setValue('service_type', '')
                          }}
                          className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
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
              {activeSub && (
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
                            // Automaticky předvyplň název pokud je prázdný
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

      {/* Cena + jednotka */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="form-label">Cena (Kč) *</label>
          <input {...f('price', { valueAsNumber: true })} type="number" min={1} placeholder="650" className={`form-input ${errors.price ? 'form-input-error' : ''}`} />
          {errors.price && <p className="form-error">{errors.price.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Jednotka *</label>
          <div className="relative">
            <select {...f('price_unit')} className="form-input appearance-none pr-8">
              {PRICE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

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
