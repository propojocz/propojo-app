'use client'
// components/ui/ImageUpload.tsx

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  folder?: string // 'services' | 'profiles'
}

export default function ImageUpload({ value, onChange, folder = 'services' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string>(value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    // Validace
    if (!file.type.startsWith('image/')) {
      setError('Vyberte obrázek (JPG, PNG, WebP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Obrázek je příliš velký. Maximum je 5 MB.')
      return
    }

    setUploading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nejste přihlášeni.'); setUploading(false); return }

    // Unikátní název souboru: userId/folder/timestamp.ext
    const ext = file.name.split('.').pop()
    const fileName = `${user.id}/${folder}/${Date.now()}.${ext}`

    const { data, error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, file, { upsert: false, contentType: file.type })

    if (uploadError) {
      setError('Nahrávání selhalo. Zkuste to znovu.')
      setUploading(false)
      return
    }

    // Získej veřejnou URL
    const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(data.path)

    setPreview(publicUrl)
    onChange(publicUrl)
    setUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleRemove = () => {
    setPreview('')
    onChange('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {preview ? (
        // Náhled nahraného obrázku
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <div className="relative h-48 w-full">
            <Image src={preview} alt="Náhled" fill className="object-cover" sizes="600px" />
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2">
            <p className="truncate text-xs text-slate-500">Obrázek nahrán ✅</p>
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5" /> Odebrat
            </button>
          </div>
        </div>
      ) : (
        // Drop zone
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all ${
            uploading
              ? 'border-indigo-300 bg-indigo-50'
              : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm font-medium text-indigo-600">Nahrávám…</p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200">
                <ImageIcon className="h-6 w-6 text-slate-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Přetáhněte obrázek nebo <span className="text-indigo-600">klikněte pro výběr</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">JPG, PNG, WebP · max. 5 MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}
