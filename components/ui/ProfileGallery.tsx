'use client'
// components/ui/ProfileGallery.tsx
// Zobrazení galerie na veřejném profilu: mřížka fotek + zvětšení po kliknutí.

import { useState } from 'react'
import { X } from 'lucide-react'

export default function ProfileGallery({ photos }: { photos: string[] }) {
  const [active, setActive] = useState<string | null>(null)

  if (!photos || photos.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => setActive(url)}
            className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:opacity-90"
          >
            <img src={url} alt="Ukázka práce" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {active && (
        <div
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={active}
            alt="Ukázka práce"
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}