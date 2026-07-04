'use client'
// components/ui/ProfileGallery.tsx
// Galerie na profilu ve stylu Airbnb: 1 velká fotka + menší, adaptivní dle počtu.
// Kliknutí = lightbox s navigací mezi fotkami.

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Images } from 'lucide-react'

export default function ProfileGallery({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState<number | null>(null)

  const open = (i: number) => setIndex(i)
  const close = useCallback(() => setIndex(null), [])
  const prev = useCallback(() => setIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length)), [photos.length])
  const next = useCallback(() => setIndex((i) => (i === null ? null : (i + 1) % photos.length)), [photos.length])

  // Klávesnice v lightboxu
  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, close, prev, next])

  if (!photos || photos.length === 0) return null

  // ── Jedna fotka: prostě široký banner ──
  if (photos.length === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => open(0)}
          className="block h-56 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 transition hover:opacity-95 sm:h-72"
        >
          <img src={photos[0]} alt="Ukázka práce" className="h-full w-full object-cover" />
        </button>
        <Lightbox {...{ index, photos, close, prev, next }} />
      </>
    )
  }

  // ── Dvě fotky: půl na půl ──
  if (photos.length === 2) {
    return (
      <>
        <div className="grid h-56 grid-cols-2 gap-2 overflow-hidden rounded-2xl sm:h-72">
          {photos.map((url, i) => (
            <button key={url} type="button" onClick={() => open(i)} className="overflow-hidden bg-slate-100 transition hover:opacity-95">
              <img src={url} alt="Ukázka práce" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        <Lightbox {...{ index, photos, close, prev, next }} />
      </>
    )
  }

  // ── Tři a více: 1 velká vlevo + mřížka menších vpravo (Airbnb) ──
  const rest = photos.slice(1, 5)
  const extra = photos.length - 5

  return (
    <>
      <div className="grid h-56 grid-cols-2 gap-2 overflow-hidden rounded-2xl sm:h-80 sm:grid-cols-4 sm:grid-rows-2">
        {/* Velká vlevo */}
        <button
          type="button"
          onClick={() => open(0)}
          className="overflow-hidden bg-slate-100 transition hover:opacity-95 sm:col-span-2 sm:row-span-2"
        >
          <img src={photos[0]} alt="Ukázka práce" className="h-full w-full object-cover" />
        </button>

        {/* Menší vpravo */}
        {rest.map((url, i) => {
          const realIndex = i + 1
          const isLast = i === rest.length - 1 && extra > 0
          return (
            <button
              key={url}
              type="button"
              onClick={() => open(realIndex)}
              className="relative hidden overflow-hidden bg-slate-100 transition hover:opacity-95 sm:block"
            >
              <img src={url} alt="Ukázka práce" className="h-full w-full object-cover" />
              {isLast && (
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 text-sm font-bold text-white">
                  <Images className="h-4 w-4" /> +{extra} fotek
                </span>
              )}
            </button>
          )
        })}

        {/* Mobil: druhá fotka jako pruh vedle velké */}
        <button
          type="button"
          onClick={() => open(1)}
          className="overflow-hidden bg-slate-100 transition hover:opacity-95 sm:hidden"
        >
          <img src={photos[1]} alt="Ukázka práce" className="h-full w-full object-cover" />
        </button>
      </div>
      <Lightbox {...{ index, photos, close, prev, next }} />
    </>
  )
}

function Lightbox({
  index, photos, close, prev, next,
}: {
  index: number | null
  photos: string[]
  close: () => void
  prev: () => void
  next: () => void
}) {
  if (index === null) return null
  return (
    <div onClick={close} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 top-1/2 -translate-y-1/2"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <img
        src={photos[index]}
        alt="Ukázka práce"
        className="max-h-[88vh] max-w-full rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {photos.length > 1 && (
        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
          {index + 1} / {photos.length}
        </span>
      )}
    </div>
  )
}