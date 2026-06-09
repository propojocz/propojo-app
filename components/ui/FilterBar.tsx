'use client'
// components/ui/FilterBar.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Search, SlidersHorizontal, Loader2 } from 'lucide-react'

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

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) { params.set(key, value) } else { params.delete(key) }
      startTransition(() => { router.push(`${pathname}?${params.toString()}`) })
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="sticky top-16 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Hledání */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {isPending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
            <input
              type="search"
              defaultValue={currentQ}
              placeholder="Hledat službu nebo dovednost…"
              className="form-input pl-9 pr-9"
              onChange={(e) => {
                const v = e.target.value
                const timeout = setTimeout(() => updateParam('q', v), 400)
                return () => clearTimeout(timeout)
              }}
            />
          </div>

          {/* Město */}
          <input
            type="text"
            defaultValue={currentCity}
            placeholder="Město…"
            className="form-input w-full sm:w-36"
            onChange={(e) => {
              const v = e.target.value
              const timeout = setTimeout(() => updateParam('city', v), 400)
              return () => clearTimeout(timeout)
            }}
          />

          {/* Řazení včetně hodnocení */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="flex rounded-xl border border-slate-200 p-0.5 overflow-x-auto">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateParam('sort', opt.value)}
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
