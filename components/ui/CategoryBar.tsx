'use client'
// components/ui/CategoryBar.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition, useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Category {
  id: string; slug: string; name: string; icon: string; color: string
}

export default function CategoryBar({ categories, activeCategory }: { categories: Category[]; activeCategory?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const updateArrows = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 8)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }

  useEffect(() => {
    updateArrows()
    const el = scrollRef.current
    el?.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el?.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [categories])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' })
  }

  const handleSelect = (slug?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (slug) { params.set('category', slug) } else { params.delete('category') }
    startTransition(() => { router.push(`${pathname}?${params.toString()}`, { scroll: false }) })
  }

  return (
    <div className={`border-b border-slate-200 bg-white transition-opacity duration-150 ${isPending ? 'opacity-50' : ''}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center">

          {/* Šipka doleva */}
          <button
            onClick={() => scroll('left')}
            className={`absolute left-0 z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow border border-slate-200 text-slate-500 hover:text-slate-900 transition-all ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Fade doleva */}
          <div className={`absolute left-0 z-10 h-full w-12 bg-gradient-to-r from-white to-transparent pointer-events-none transition-opacity ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`} />

          {/* Scrollovatelný list */}
          <div
            ref={scrollRef}
            className="flex gap-1.5 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              onClick={() => handleSelect(undefined)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${!activeCategory ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
            >
              Vše
            </button>
            {categories.map(cat => {
              const isActive = activeCategory === cat.slug
              return (
                <button
                  key={cat.slug}
                  onClick={() => handleSelect(cat.slug)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap ${isActive ? 'text-white font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                  style={isActive ? { backgroundColor: cat.color } : {}}
                >
                  <span className="text-sm leading-none">{cat.icon}</span>
                  {cat.name}
                </button>
              )
            })}
          </div>

          {/* Fade doprava */}
          <div className={`absolute right-0 z-10 h-full w-12 bg-gradient-to-l from-white to-transparent pointer-events-none transition-opacity ${canScrollRight ? 'opacity-100' : 'opacity-0'}`} />

          {/* Šipka doprava */}
          <button
            onClick={() => scroll('right')}
            className={`absolute right-0 z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow border border-slate-200 text-slate-500 hover:text-slate-900 transition-all ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

        </div>
      </div>
    </div>
  )
}