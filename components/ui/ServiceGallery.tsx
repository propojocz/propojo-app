'use client'
// components/ui/ServiceGallery.tsx
// Prolistovatelná galerie fotek na detailu karty. Velký náhled + pruh miniatur,
// šipky a klávesy ←/→. Titulní foto je první.

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  photos: string[]
  title: string
}

export default function ServiceGallery({ photos, title }: Props) {
  const [index, setIndex] = useState(0)
  const count = photos.length

  const go = useCallback((dir: -1 | 1) => {
    setIndex(prev => (prev + dir + count) % count)
  }, [count])

  useEffect(() => {
    if (count <= 1) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, count])

  if (count === 0) return null

  return (
    <div className="space-y-2">
      {/* Velký náhled */}
      <div className="relative h-64 overflow-hidden rounded-2xl bg-slate-100 sm:h-80">
        <Image
          src={photos[index]}
          alt={`${title} — fotka ${index + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 66vw"
          priority={index === 0}
        />

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Předchozí fotka"
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Další fotka"
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-semibold text-white">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {/* Pruh miniatur */}
      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Zobrazit fotku ${i + 1}`}
              className={`relative h-16 w-20 flex-none overflow-hidden rounded-lg border-2 transition ${
                i === index ? 'border-emerald-500' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={src} alt="" fill className="object-cover" sizes="80px" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}