'use client'
// components/ui/MarketCarousel.tsx
// Marketplace (20. 10. 2026, mockup Mateje): vodorovný pás karet – Bleskové termíny, Dobře hodnocení,
// Naposledy prohlížené. Na mobilu se posouvá prstem (se zarážkami), na počítači šipkami; vpravo „1–4 ze 7“.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function MarketCarousel({ title, icon, subtitle, count, children }: {
  title: string
  icon: ReactNode
  subtitle?: string
  /** Počet karet v pásu (do „1–4 ze 7“) */
  count: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ from: 1, to: Math.min(count, 4), atStart: true, atEnd: count <= 4 })

  const measure = useCallback(() => {
    const el = ref.current
    const first = el?.firstElementChild as HTMLElement | null
    if (!el || !first) return
    const step = first.getBoundingClientRect().width + 16 // šířka karty + mezera (gap-4)
    const from = Math.min(count, Math.round(el.scrollLeft / step) + 1)
    const perView = Math.max(1, Math.floor((el.clientWidth + 16) / step))
    setRange({
      from,
      to: Math.min(count, from + perView - 1),
      atStart: el.scrollLeft <= 4,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    })
  }, [count])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const scroll = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            {icon} {title}
          </h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {count > 1 && <span className="hidden text-sm tabular-nums text-slate-500 sm:inline">{range.from}–{range.to} ze {count}</span>}
          <button type="button" onClick={() => scroll(-1)} disabled={range.atStart} aria-label="Předchozí"
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 disabled:opacity-40 sm:flex">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => scroll(1)} disabled={range.atEnd} aria-label="Další"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 disabled:opacity-40">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div ref={ref} onScroll={measure}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {children}
      </div>
    </section>
  )
}
