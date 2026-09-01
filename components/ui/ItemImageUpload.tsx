'use client'
// components/ui/ItemImageUpload.tsx
// Jedna fotka u konkrétní položky nabídky (service_items.image_url) — hlavně
// pro výrobky (zákazník vidí konkrétní dort, ne jen obecnou galerii karty),
// ale dostupné i u služby. Zatím JEDNA fotka na položku, žádná galerie —
// pro víc fotek na kartu jako celek slouží GalleryUpload.
//
// Stejně jako GalleryUpload: upload proběhne hned po výběru souboru (fotka
// se zmenší a překóduje v prohlížeči — viz lib/image-resize.ts), výsledná
// URL se hlásí přes onChange. Skutečné uložení k položce proběhne až
// uložením celého formuláře (stejný vzor jako u galerie na kartě).

import { useState, useRef } from 'react'
import { X, Loader2, ImagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/image-resize'

interface Props {
  value: string | null
  onChange: (url: string | null) => void
  /** Podsložka ve Storage. 'items' = fotka v nabídce, 'orders' = fotka hotové
   *  objednávky. Oddělené, ať se v bucketu dá vyznat. */
  folder?: 'items' | 'orders'
}

// Jen pojistka proti absurdně velkým souborům — skutečnou velikost řeší zmenšení.
const MAX_SOURCE_MB = 25

export default function ItemImageUpload({ value, onChange, folder = 'items' }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')
    if (!file.type.startsWith('image/')) { setError('Vyberte prosím obrázek.'); return }
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) { setError(`Obrázek je větší než ${MAX_SOURCE_MB} MB.`); return }

    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nejste přihlášeni.'); setUploading(false); return }

    // Zmenšení nikdy nevyhodí chybu — když se nepovede, resizeImage tiše
    // vrátí originál beze změny, takže tenhle blok řeší jen skutečné
    // síťové/uploadové selhání.
    try {
      const prepared = await resizeImage(file)
      const fileName = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${prepared.ext}`
      const { data, error: upErr } = await supabase.storage
        .from('images')
        .upload(fileName, prepared.blob, { upsert: false, contentType: prepared.contentType })
      if (upErr) {
        setError('Nahrávání fotky selhalo.')
        setUploading(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(data.path)
      onChange(publicUrl)
    } catch (err) {
      console.error('[ItemImageUpload]', err)
      setError('Něco se pokazilo. Zkuste to prosím znovu.')
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {value ? (
        <div className="group relative aspect-[4/3] w-full max-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <img src={value} alt="" className="h-full w-full object-cover" />
          {/* Klik na fotku = rovnou nahradit; není třeba nejdřív mazat. */}
          <button
            type="button"
            onClick={() => !uploading && inputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition group-hover:bg-black/40 group-hover:text-white"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin text-white" /> : <span className="text-xs font-bold">Změnit fotku</span>}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            title="Odebrat fotku"
            className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-[4/3] w-full max-w-[220px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-semibold">Přidat fotku</span>
            </>
          )}
        </button>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}