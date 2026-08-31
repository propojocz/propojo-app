'use client'
// components/ui/GalleryUpload.tsx
// Galerie ukázek práce: nahrání více fotek (max MAX_PHOTOS) + mazání.
// Hodnota je pole URL adres; změny hlásí přes onChange.

import { useState, useRef } from 'react'
import { X, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/image-resize'

const MAX_PHOTOS = 15
// Zdrojový soubor se před uploadem zmenší, takže tenhle limit je jen pojistka
// proti absurdně velkým souborům (omylem vybrané video, panorama v plném rozlišení).
const MAX_SOURCE_MB = 25

interface GalleryUploadProps {
  value: string[]
  onChange: (urls: string[]) => void
}

export default function GalleryUpload({ value, onChange }: GalleryUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const photos = value ?? []
  const full = photos.length >= MAX_PHOTOS

  const handleFiles = async (files: FileList) => {
    setError('')

    // Kolik ještě smíme přidat
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      setError(`Maximum je ${MAX_PHOTOS} fotek.`)
      return
    }
    const toUpload = Array.from(files).slice(0, room)

    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nejste přihlášeni.'); setUploading(false); return }

    const newUrls: string[] = []
    for (const file of toUpload) {
      if (!file.type.startsWith('image/')) { setError('Vyberte jen obrázky.'); continue }
      if (file.size > MAX_SOURCE_MB * 1024 * 1024) { setError(`Některý obrázek je větší než ${MAX_SOURCE_MB} MB.`); continue }

      // Zmenšení a překódování V PROHLÍŽEČI před odesláním — fotka z mobilu
      // klidně váží 10 MB ve 4000px šířce, na kartu se z ní zobrazí pár set px.
      // Když se zmenšení z libovolného důvodu nepovede, resizeImage tiše
      // vrátí originál beze změny — upload tím nikdy neblokuje.
      const prepared = await resizeImage(file, 1600, 0.85)

      const fileName = `${user.id}/gallery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${prepared.ext}`
      const { data, error: upErr } = await supabase.storage
        .from('images')
        .upload(fileName, prepared.blob, { upsert: false, contentType: prepared.contentType })
      if (upErr) { setError('Nahrávání některé fotky selhalo.'); continue }

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(data.path)
      newUrls.push(publicUrl)
    }

    if (newUrls.length > 0) onChange([...photos, ...newUrls])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleRemove = (url: string) => {
    onChange(photos.filter((p) => p !== url))
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((url) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(url)}
              title="Odebrat fotku"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Dlaždice pro přidání */}
        {!full && (
          <button
            type="button"
            onClick={() => !uploading && inputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Plus className="h-6 w-6" />
                <span className="text-xs font-semibold">Přidat fotku</span>
              </>
            )}
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400">{photos.length} / {MAX_PHOTOS} fotek · JPG, PNG, WebP · zmenšíme a optimalizujeme automaticky</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }}
      />
    </div>
  )
}