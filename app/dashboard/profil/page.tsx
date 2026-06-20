'use client'
// app/dashboard/profil/page.tsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, CheckCircle2, AlertCircle, BadgeCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ImageUpload from '@/components/ui/ImageUpload'
import GalleryUpload from '@/components/ui/GalleryUpload'
import type { Profile } from '@/types/database'

const schema = z.object({
  full_name: z.string().min(2, 'Zadejte celé jméno'),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  bio: z.string().max(600, 'Bio je příliš dlouhé').optional(),
  avatar_url: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function ProfilPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [ico, setIco] = useState<string | null>(null)
  const [icoVerified, setIcoVerified] = useState(false)
  const [isProvider, setIsProvider] = useState(false)
  const [gallery, setGallery] = useState<string[]>([])

  const { register: f, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single() as { data: Profile | null }
      if (data) {
        reset({
          full_name: data.full_name,
          company_name: (data as any).company_name ?? '',
          phone: data.phone ?? '',
          city: data.city ?? '',
          bio: data.bio ?? '',
          avatar_url: data.avatar_url ?? '',
        })
        setIco((data as any).ico ?? null)
        setIcoVerified((data as any).ico_verified === true)
        setIsProvider(data.is_provider === true)
        setGallery((data as any).gallery ?? [])
      }
      setLoading(false)
    }
    load()
  }, [reset])

  const onSubmit = async (values: FormValues) => {
    setSaving(true); setError(''); setSuccess(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nejste přihlášeni.'); setSaving(false); return }
    // Uložíme i galerii spolu s ostatními poli
    const { error: err } = await (supabase.from('profiles') as any).update({ ...values, gallery }).eq('id', user.id)
    if (err) { setError('Nepodařilo se uložit profil.') }
    else { setSuccess(true); setTimeout(() => setSuccess(false), 3000) }
    setSaving(false)
  }

  const avatarUrl = watch('avatar_url')

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Můj profil</h1>
        <p className="mt-0.5 text-sm text-slate-500">Tyto informace uvidí zákazníci na vašem profilu</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Profilová fotka */}
          <div className="space-y-1.5">
            <label className="form-label">Profilová fotka</label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-emerald-700">
                    {watch('full_name')?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <ImageUpload
                  value={avatarUrl}
                  onChange={(url) => setValue('avatar_url', url)}
                  folder="profiles"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Celé jméno *</label>
            <input {...f('full_name')} className={`form-input ${errors.full_name ? 'form-input-error' : ''}`} />
            {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
          </div>

          {/* Název firmy + IČO – jen pro poskytovatele */}
          {isProvider && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="form-label">Název firmy <span className="font-normal text-slate-400">(volitelné)</span></label>
                <input {...f('company_name')} placeholder="Např. Úklidové služby Jana" className="form-input" />
              </div>
              <div className="space-y-1.5">
                <label className="form-label flex items-center gap-2">
                  IČO
                  {icoVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      <BadgeCheck className="h-3 w-3" /> Ověřeno ARES
                    </span>
                  )}
                </label>
                <input value={ico ?? '—'} disabled className="form-input bg-slate-100 text-slate-500" />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="form-label">Telefon</label>
              <input {...f('phone')} type="tel" placeholder="+420 777 123 456" className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Město</label>
              <input {...f('city')} placeholder="Praha" className="form-input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">
              O mně <span className="font-normal text-slate-400">(volitelné)</span>
            </label>
            <textarea
              {...f('bio')}
              rows={4}
              placeholder="Napište něco o sobě, svých zkušenostech a službách..."
              className={`form-input resize-none ${errors.bio ? 'form-input-error' : ''}`}
            />
            {errors.bio && <p className="form-error">{errors.bio.message}</p>}
          </div>

          {/* Fotogalerie – jen pro poskytovatele */}
          {isProvider && (
            <div className="space-y-1.5">
              <label className="form-label">
                Fotogalerie <span className="font-normal text-slate-400">(ukázky vaší práce)</span>
              </label>
              <p className="text-xs text-slate-400">Profily s fotkami získávají víc poptávek. Zobrazí se na vašem veřejném profilu.</p>
              <div className="pt-2">
                <GalleryUpload value={gallery} onChange={setGallery} />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />Profil byl úspěšně uložen
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : 'Uložit profil'}
          </button>
        </form>
      </div>
    </div>
  )
}