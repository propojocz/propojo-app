'use client'
// components/ui/InfoTip.tsx
// Malá nápověda u popisku pole: ikona (i), po najetí myší (desktop) nebo
// klepnutí (mobil) vyjede bublina s vysvětlením.
//
// Proč vlastní komponenta a ne title="": nativní tooltip se na mobilu vůbec
// nezobrazí a na desktopu vypadá jako systémová hláška. Tohle funguje všude
// a dá se v něm zvýraznit text.

import { useState, useEffect, useRef } from 'react'
import { Info } from 'lucide-react'

interface Props {
  /** Text nápovědy. Klidně s <strong> — vykreslí se jako HTML. */
  children: React.ReactNode
  /** Kam bublinu otevřít, když by vpravo přetekla. Default vpravo. */
  align?: 'left' | 'right'
}

export default function InfoTip({ children, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)

  // Klik mimo bublinu ji zavře (na mobilu jiná cesta ven není).
  useEffect(() => {
    if (!open) return
    const close = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Nápověda"
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
          open ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'
        }`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute bottom-full z-30 mb-1.5 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-relaxed text-slate-600 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  )
}