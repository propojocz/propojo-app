'use client'
// components/ui/FilterSidebar.tsx
 
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import { Star, X, Check } from 'lucide-react'
 
interface Subcategory {
  id: string
  name: string
}
 
interface Category {
  id: string
  slug: string
  name: string
  icon: string
  color: string
}
 
interface Props {
  categories: Category[]
  subcategories?: Subcategory[]   // podkategorie aktivní kategorie (z page.tsx)
  activeCategory?: string
  currentPriceMin?: string
  currentPriceMax?: string
  currentMinRating?: string
  currentSubcats?: string         // "id1,id2"
}
 
export default function FilterSidebar({
  categories,
  subcategories = [],
  activeCategory,
  currentPriceMin,
  currentPriceMax,
  currentMinRating,
  currentSubcats,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
 
  const [min, setMin] = useState(currentPriceMin ?? '')
  const [max, setMax] = useState(currentPriceMax ?? '')
  useEffect(() => setMin(currentPriceMin ?? ''), [currentPriceMin])
  useEffect(() => setMax(currentPriceMax ?? ''), [currentPriceMax])
 
  const selectedSubs = (currentSubcats ?? '').split(',').filter(Boolean)
 
  const setParam = (key: string, value?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }
 
  // Při změně kategorie vyčisti i vybrané podkategorie
  const selectCategory = (slug?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (slug) params.set('category', slug)
    else params.delete('category')
    params.delete('subcats')
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }
 
  const toggleSub = (id: string) => {
    const next = selectedSubs.includes(id)
      ? selectedSubs.filter((x) => x !== id)
      : [...selectedSubs, id]
    setParam('subcats', next.length ? next.join(',') : undefined)
  }
 
  const applyPrice = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (min) params.set('priceMin', min)
    else params.delete('priceMin')
    if (max) params.set('priceMax', max)
    else params.delete('priceMax')
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }
 
  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString())
    ;['category', 'subcats', 'priceMin', 'priceMax', 'minRating'].forEach((k) => params.delete(k))
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }
 
  const ratingOpts = [
    { value: '', label: 'Vše' },
    { value: '4', label: '4,0 a více' },
    { value: '4.5', label: '4,5 a více' },
  ]
 
  const hasFilters =
    !!activeCategory || !!currentSubcats || !!currentPriceMin || !!currentPriceMax || !!currentMinRating
 
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-opacity ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-slate-900">Filtry</h2>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" /> Vymazat
          </button>
        )}
      </div>
 
      {/* Kategorie */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Kategorie</h3>
        <div className="space-y-1">
          <button
            onClick={() => selectCategory(undefined)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              !activeCategory
                ? 'bg-emerald-50 font-bold text-emerald-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Vše
          </button>
          {categories.map((cat) => {
            const active = activeCategory === cat.slug
            return (
              <div key={cat.slug}>
                <button
                  onClick={() => selectCategory(cat.slug)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'bg-emerald-50 font-bold text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{cat.icon}</span> {cat.name}
                </button>
 
                {/* Podkategorie – jen pod aktivní kategorií */}
                {active && subcategories.length > 0 && (
                  <div className="mt-1 space-y-0.5 border-l-2 border-emerald-100 pl-3">
                    {subcategories.map((sub) => {
                      const checked = selectedSubs.includes(sub.id)
                      return (
                        <button
                          key={sub.id}
                          onClick={() => toggleSub(sub.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                            checked ? 'font-semibold text-emerald-700' : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          {sub.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
 
      {/* Cena */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Cena (Kč)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
            placeholder="od"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <span className="text-slate-300">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
            placeholder="do"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </div>
 
      {/* Hodnocení */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-800">Hodnocení</h3>
        <div className="space-y-1">
          {ratingOpts.map((opt) => {
            const active = (currentMinRating ?? '') === opt.value
            return (
              <button
                key={opt.label}
                onClick={() => setParam('minRating', opt.value || undefined)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-emerald-50 font-bold text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {opt.value && <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />}
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}