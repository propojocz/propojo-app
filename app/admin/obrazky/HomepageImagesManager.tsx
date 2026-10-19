'use client'
// app/admin/obrazky/HomepageImagesManager.tsx
// Nahrání obrázku (ImageUpload do úložiště „images“), popis, volitelně odkaz a období; seznam se zapnutím
// a smazáním. Server (lib/actions/homepage-images.ts) znovu ověří, že jde o admina.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import ImageUpload from '@/components/ui/ImageUpload'
import { addHomepageImage, deleteHomepageImage, setHomepageImageActive, type HomepageImage } from '@/lib/actions/homepage-images'
import { datum } from '@/lib/format'

export default function HomepageImagesManager({ images }: { images: HomepageImage[] }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [link, setLink] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Po uložení nový ImageUpload (prázdný náhled)
  const [uploadKey, setUploadKey] = useState(0)

  const add = async () => {
    setError('')
    setSaving(true)
    const res = await addHomepageImage({ image_url: url, alt, link_url: link || null, starts_on: from || null, ends_on: to || null })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setUrl(''); setAlt(''); setLink(''); setFrom(''); setTo('')
    setUploadKey((k) => k + 1)
    router.refresh()
  }

  const toggle = async (img: HomepageImage) => {
    setBusyId(img.id)
    const res = await setHomepageImageActive(img.id, !img.is_active)
    setBusyId(null)
    if (!res.success) { alert(res.error); return }
    router.refresh()
  }

  const remove = async (img: HomepageImage) => {
    if (!confirm('Smazat obrázek z úvodní stránky?')) return
    setBusyId(img.id)
    const res = await deleteHomepageImage(img.id)
    setBusyId(null)
    if (!res.success) { alert(res.error); return }
    router.refresh()
  }

  const nowIso = new Date().toISOString()
  const stateOf = (img: HomepageImage) =>
    !img.is_active ? { text: 'Vypnuto', cls: 'bg-slate-100 text-slate-500' }
      : img.starts_at && img.starts_at > nowIso ? { text: `Od ${datum(img.starts_at)}`, cls: 'bg-sky-100 text-sky-800' }
      : img.ends_at && img.ends_at <= nowIso ? { text: 'Skončilo', cls: 'bg-slate-100 text-slate-500' }
      : { text: 'Na webu', cls: 'bg-emerald-100 text-emerald-700' }

  return (
    <div className="space-y-6">
      {/* Nový obrázek */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-black text-slate-900">Přidat obrázek</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Na šířku, ideálně kolem 1600 × 1000 px, do 5 MB. Nahrávejte jen fotky, ke kterým máte práva (vlastní, zakoupené, se souhlasem autora).
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div key={uploadKey}>
            <ImageUpload value={url} onChange={setUrl} folder="homepage" />
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">
              Popis obrázku *
              <input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200}
                placeholder="Např. Kadeřnice stříhá zákaznici v salonu"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              <span className="mt-0.5 block font-normal text-slate-400">Pro nevidomé a vyhledávače – co je na obrázku.</span>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Odkaz po kliknutí (nepovinné)
              <input value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="/marketplace?q=Kadeřnictví"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-slate-600">
                Od (nepovinné)
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Do (nepovinné)
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" onClick={add} disabled={saving || !url}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Přidat na úvodní stránku
            </button>
          </div>
        </div>
      </div>

      {/* Seznam */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-black text-slate-900">Obrázky ({images.length})</p>
        {images.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Zatím žádný obrázek – na úvodní stránce je barevné pozadí.</p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => {
              const st = stateOf(img)
              return (
                <li key={img.id} className={`overflow-hidden rounded-2xl border border-slate-200 ${img.is_active ? '' : 'opacity-60'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.image_url} alt={img.alt} className="aspect-[16/10] w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm text-slate-700">{img.alt || '—'}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span>
                    </div>
                    {img.link_url && <p className="truncate text-xs text-slate-500">Odkaz: {img.link_url}</p>}
                    {img.ends_at && <p className="text-xs text-slate-500">Do {datum(new Date(new Date(img.ends_at).getTime() - 1))}</p>}
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => toggle(img)} disabled={busyId === img.id}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                        {img.is_active ? 'Vypnout' : 'Zapnout'}
                      </button>
                      <button type="button" onClick={() => remove(img)} disabled={busyId === img.id}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                        {busyId === img.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Smazat
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
