'use client'
// components/ui/FilterSidebar.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Star,
  X,
  Check,
  Zap,
  SlidersHorizontal,
  ChevronDown,
  MapPin,
  Banknote,
} from 'lucide-react'

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
  subcategories?: Subcategory[]
  activeCategory?: string
  currentPriceMin?: string
  currentPriceMax?: string
  currentMinRating?: string
  currentSubcats?: string
  currentCity?: string
  currentDosah?: string
  /** 'dnes' | 'tyden' — filtr podle vypsaného volna */
  currentVolno?: string
}

type MobileSection = 'availability' | 'category' | 'price' | 'rating' | 'range'

export default function FilterSidebar({
  categories,
  subcategories = [],
  activeCategory,
  currentPriceMin,
  currentPriceMax,
  currentMinRating,
  currentSubcats,
  currentCity,
  currentDosah,
  currentVolno,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [min, setMin] = useState(currentPriceMin ?? '')
  const [max, setMax] = useState(currentPriceMax ?? '')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSection, setOpenSection] = useState<MobileSection | null>(null)
  const [showAllMobileCategories, setShowAllMobileCategories] = useState(!!activeCategory)

  useEffect(() => setMin(currentPriceMin ?? ''), [currentPriceMin])
  useEffect(() => setMax(currentPriceMax ?? ''), [currentPriceMax])
  useEffect(() => setShowAllMobileCategories(!!activeCategory), [activeCategory])

  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  const selectedSubs = (currentSubcats ?? '').split(',').filter(Boolean)

  const setParam = (key: string, value?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

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
    ;['category', 'subcats', 'priceMin', 'priceMax', 'minRating', 'dosah', 'volno'].forEach((k) => params.delete(k))
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  const ratingOpts = [
    { value: '', label: 'Vše' },
    { value: '4', label: '4,0 a více' },
    { value: '4.5', label: '4,5 a více' },
  ]

  // Dostupnost je první filtr — je to hlavní důvod, proč sem zákazník chodí.
  // „Kdykoli" nic nefiltruje, aby zůstali vidět i ti, co jedou z poptávek.
  const volnoOpts = [
    { value: '', label: 'Kdykoli' },
    { value: 'dnes', label: 'Volno dnes' },
    { value: 'tyden', label: 'Volno do týdne' },
  ]

  const hasFilters =
    !!activeCategory || !!currentSubcats || !!currentPriceMin || !!currentPriceMax ||
    !!currentMinRating || !!currentDosah || !!currentVolno

  const activeFilterCount = [
    activeCategory,
    currentSubcats,
    currentPriceMin || currentPriceMax,
    currentMinRating,
    currentDosah,
    currentVolno,
  ].filter(Boolean).length

  const activeCategoryName = categories.find((cat) => cat.slug === activeCategory)?.name
  const availabilityLabel = volnoOpts.find((opt) => opt.value === (currentVolno ?? ''))?.label ?? 'Kdykoli'
  const ratingLabel = ratingOpts.find((opt) => opt.value === (currentMinRating ?? ''))?.label ?? 'Vše'
  const priceLabel = currentPriceMin && currentPriceMax
    ? `${currentPriceMin}–${currentPriceMax} Kč`
    : currentPriceMin
      ? `od ${currentPriceMin} Kč`
      : currentPriceMax
        ? `do ${currentPriceMax} Kč`
        : 'Libovolná'

  const toggleSection = (section: MobileSection) => {
    setOpenSection((current) => current === section ? null : section)
  }

  const renderAvailability = () => (
    <div className="space-y-1">
      {volnoOpts.map((opt) => {
        const active = (currentVolno ?? '') === opt.value
        return (
          <button
            key={opt.label}
            onClick={() => setParam('volno', opt.value || undefined)}
            className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
              active
                ? 'bg-emerald-50 font-semibold text-emerald-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
      {currentVolno && (
        <p className="px-3 pt-1 text-xs leading-relaxed text-slate-400">
          Ukazujeme jen karty s vypsaným volným termínem. Ostatní se domlouvají přes poptávku.
        </p>
      )}
    </div>
  )

  const renderCategories = (mobile = false) => {
    const shownCategories = mobile && !showAllMobileCategories && !activeCategory
      ? categories.slice(0, 6)
      : categories

    return (
      <div className="space-y-1">
        <button
          onClick={() => selectCategory(undefined)}
          className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
            !activeCategory
              ? 'bg-emerald-50 font-semibold text-emerald-700'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Vše
        </button>

        {shownCategories.map((cat) => {
          const active = activeCategory === cat.slug
          return (
            <div key={cat.slug}>
              <button
                onClick={() => selectCategory(cat.slug)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? 'bg-emerald-50 font-semibold text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="shrink-0">{cat.icon}</span>
                <span className="min-w-0 flex-1">{cat.name}</span>
              </button>

              {active && subcategories.length > 0 && (
                <div className="mt-1 space-y-0.5 border-l-2 border-emerald-100 pl-3">
                  {subcategories.map((sub) => {
                    const checked = selectedSubs.includes(sub.id)
                    return (
                      <button
                        key={sub.id}
                        onClick={() => toggleSub(sub.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
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

        {mobile && !activeCategory && categories.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllMobileCategories((value) => !value)}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            {showAllMobileCategories ? 'Zobrazit méně' : `Zobrazit dalších ${categories.length - 6}`}
            <ChevronDown className={`h-4 w-4 transition-transform ${showAllMobileCategories ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    )
  }

  const renderPrice = () => (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        onBlur={applyPrice}
        onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
        placeholder="od"
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
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
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
      />
    </div>
  )

  const renderRating = () => (
    <div className="space-y-1">
      {ratingOpts.map((opt) => {
        const active = (currentMinRating ?? '') === opt.value
        return (
          <button
            key={opt.label}
            onClick={() => setParam('minRating', opt.value || undefined)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
              active
                ? 'bg-emerald-50 font-semibold text-emerald-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {opt.value && <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )

  const renderRange = () => currentCity ? (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={currentDosah === '1'}
        onChange={(e) => setParam('dosah', e.target.checked ? '1' : undefined)}
        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      Jen v mém dosahu
    </label>
  ) : (
    <p className="px-3 py-2 text-xs leading-relaxed text-slate-400">
      Nejdřív zadejte město ve vyhledávání nahoře.
    </p>
  )

  const mobileRows: Array<{
    id: MobileSection
    label: string
    value: string
    icon: typeof Zap
    content: ReactNode
  }> = [
    { id: 'availability', label: 'Dostupnost', value: availabilityLabel, icon: Zap, content: renderAvailability() },
    { id: 'category', label: 'Kategorie', value: activeCategoryName ?? 'Všechny', icon: SlidersHorizontal, content: renderCategories(true) },
    { id: 'price', label: 'Cena', value: priceLabel, icon: Banknote, content: renderPrice() },
    { id: 'rating', label: 'Hodnocení', value: ratingLabel, icon: Star, content: renderRating() },
    { id: 'range', label: 'Dojezd', value: currentDosah === '1' ? 'Jen v mém dosahu' : 'Kdekoli', icon: MapPin, content: renderRange() },
  ]

  return (
    <>
      {/* MOBIL: na stránce jen kompaktní vstup do filtrů. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className={`flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition ${
            isPending ? 'opacity-60' : 'hover:border-emerald-200'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-bold text-slate-900">Filtry</span>
              <span className="block text-xs text-slate-500">
                {activeFilterCount > 0 ? `${activeFilterCount} aktivní` : 'Kategorie, cena, hodnocení…'}
              </span>
            </span>
          </span>

          <span className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className="h-5 w-5 -rotate-90 text-slate-400" />
          </span>
        </button>
      </div>

      {/* MOBILNÍ BOTTOM SHEET */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[9990] lg:hidden">
          <button
            type="button"
            aria-label="Zavřít filtry"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/40"
          />

          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-4 pb-3 pt-2">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-slate-500"
                >
                  Zavřít
                </button>
                <h2 className="text-base font-bold text-slate-900">Filtry</h2>
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                  className={`text-sm font-semibold ${hasFilters ? 'text-emerald-700' : 'text-slate-300'}`}
                >
                  Vymazat vše
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto px-4 py-2 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
              {mobileRows.map((row) => {
                const Icon = row.icon
                const opened = openSection === row.id
                return (
                  <div key={row.id} className="border-b border-slate-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(row.id)}
                      className="flex w-full items-center gap-3 py-4 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-900">{row.label}</span>
                        <span className="block truncate text-xs text-slate-500">{row.value}</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${opened ? 'rotate-180' : ''}`} />
                    </button>

                    {opened && (
                      <div className="pb-4 pl-12">
                        {row.content}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Zobrazit nabídky
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP: původní sidebar zůstává celý a stále na stejném místě. */}
      <div
        className={`hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-opacity lg:block ${
          isPending ? 'opacity-60' : ''
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Filtry</h2>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" /> Vymazat
            </button>
          )}
        </div>

        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Zap className="h-3.5 w-3.5 text-emerald-500" /> Dostupnost
          </h3>
          {renderAvailability()}
        </div>

        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Kategorie</h3>
          {renderCategories(false)}
        </div>

        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Cena (Kč)</h3>
          {renderPrice()}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Hodnocení</h3>
          {renderRating()}
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Dojezd</h3>
          {renderRange()}
        </div>
      </div>
    </>
  )
}