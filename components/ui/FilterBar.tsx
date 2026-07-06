'use client'
// components/ui/FilterBar.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import SearchAutocomplete from './SearchAutocomplete'

interface FilterBarProps {
  currentCity?: string
  currentSort?: string
  currentQ?: string
}

const SORT_OPTIONS = [
  { value: 'nejnovejsi', label: 'Nejnovější' },
  { value: 'nejlevnejsi', label: 'Nejlevnější' },
  { value: 'nejdrazsi', label: 'Nejdražší' },
  { value: 'hodnoceni', label: '⭐ Hodnocení' },
]

export default function FilterBar({ currentCity, currentSort = 'nejnovejsi', currentQ }: FilterBarProps) {
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
    <div className="sticky top-16 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

          {/* Město s našeptáváním obcí */}
          <SearchAutocomplete
            mode="obce"
            defaultValue={currentCity}
            placeholder="Město…"
            className="w-full sm:w-52"
            onPickObec={(item) => updateParams({ city: item.obec })}
            onFreeText={(text) => updateParams({ city: text || null })}
          />

          {/* Řazení */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="flex rounded-xl border border-slate-200 p-0.5 overflow-x-auto">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateParams({ sort: opt.value })}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    currentSort === opt.value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}