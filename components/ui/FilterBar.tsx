'use client'
// components/ui/FilterBar.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { SlidersHorizontal, Star, Zap } from 'lucide-react'
import SearchAutocomplete from './SearchAutocomplete'

interface FilterBarProps {
  currentCity?: string
  currentSort?: string
  currentQ?: string
}

// „Nejdřív volno" je první a výchozí — zákazník se rozhoduje podle toho,
// kdo ho vezme nejdřív, ne podle toho, kdo se přidal naposled.
const SORT_OPTIONS = [
  { value: 'volno', label: 'Nejdřív volno', icon: 'zap' },
  { value: 'nejnovejsi', label: 'Nejnovější' },
  { value: 'nejlevnejsi', label: 'Nejlevnější' },
  { value: 'nejdrazsi', label: 'Nejdražší' },
  { value: 'hodnoceni', label: 'Hodnocení', icon: 'star' },
]

export default function FilterBar({ currentCity, currentSort = 'volno', currentQ }: FilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      startTransition(() => { router.push(`${pathname}?${params.toString()}`) })
    },
    [router, pathname, searchParams]
  )

  return (
    // Karta s hledáním podle mockupu (20. 10. 2026): hledání, obec, Filtry (jen mobil – na počítači jsou
    // filtry vlevo u nabídek), řazení jako pilulky (na mobilu posuvné)
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className={`rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm transition ${isPending ? 'opacity-70' : ''}`}>
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          {/* Hledání služby/oboru s našeptáváním */}
          <SearchAutocomplete
            mode="obory"
            defaultValue={currentQ}
            placeholder="Hledat službu nebo obor…"
            className="flex-1"
            onPickObor={(item) => {
              // Kategorie → ?category=slug (zruší q i subcats), podkategorie → ?subcats=id
              if (item.type === 'category') {
                updateParams({ category: item.value, subcats: null, q: null })
              } else {
                updateParams({ subcats: item.value, q: null })
              }
            }}
            onFreeText={(text) => updateParams({ q: text || null })}
          />

          {/* Město s našeptáváním obcí + Filtry (mobil) */}
          <div className="flex gap-2.5 lg:w-72">
            <SearchAutocomplete
              mode="obce"
              defaultValue={currentCity}
              placeholder="Město…"
              className="min-w-0 flex-1"
              onPickObec={(item) => updateParams({ city: item.obec })}
              onFreeText={(text) => updateParams({ city: text || null })}
            />
            <button type="button" onClick={() => window.dispatchEvent(new Event('propojo:open-filters'))}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-emerald-300 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filtry
            </button>
          </div>

          {/* Řazení */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 lg:mx-0 lg:px-0" style={{ scrollbarWidth: 'none' }}>
            {SORT_OPTIONS.map((opt) => {
              const on = currentSort === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => updateParams({ sort: opt.value })}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all ${
                    on ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  {opt.icon === 'zap' && <Zap className={`h-4 w-4 ${on ? 'fill-white' : 'fill-orange-400 text-orange-500'}`} />}
                  {opt.icon === 'star' && <Star className={`h-4 w-4 ${on ? 'fill-white' : 'fill-amber-400 text-amber-400'}`} />}
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}