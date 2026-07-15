'use client'
// app/dashboard/profil/page.tsx
//
// TŘI JMÉNA, TŘI ROLE — pozor na rozdíl:
//   full_name     … osobní jméno (fakturace, Stripe KYC)   → edituje uživatel
//   company_name  … OVĚŘENÁ firma z ARES                    → NEeditovatelné, píše jen server
//   display_name  … marketingový název („Salon Bella")      → edituje uživatel, vidí zákazníci
//
// BEZPEČNOST: dřív se profil ukládal jako `update({ ...values })`, což znamenalo, že
// uživatel mohl z prohlížeče přepsat JAKÝKOLI sloupec — včetně company_name (ověřená
// identita), ico_verified nebo dokonce is_admin. Teď posíláme jen výslovný seznam polí
// a databáze má navíc trigger, který chráněné sloupce vrátí zpět (viz SQL migrace).

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, CheckCircle2, AlertCircle, BadgeCheck, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ImageUpload from '@/components/ui/ImageUpload'
import GalleryUpload from '@/components/ui/GalleryUpload'
import type { Profile } from '@/types/database'
import ChangePasswordSection from '@/components/ui/ChangePasswordSection'

const schema = z.object({
  full_name: z.string().min(2, 'Zadejte celé jméno'),
  display_name: z
    .string()
    .max(50, 'Nejvýše 50 znaků')
    .optional()
    .refine(
      (v) => !v || !/(https?:\/\/|www\.|@|\+?\d[\d\s\-()]{7,})/i.test(v),
      { message: 'Název nesmí obsahovat odkaz, e-mail ani telefonní číslo.' }
    )
    .refine((v) => !v || !/propojo/i.test(v), {
      message: 'Název nesmí obsahovat slovo „Propojo".',
    }),
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
  const [companyName, setCompanyName] = useState<string | null>(null) // z ARES, jen ke čtení
  const [isProvider, setIsProvider] = useState(false)
  const [gallery, setGallery] = useState<string[]>([])
  const [userEmail, setUserEmail] = useState('')

  const { register: f, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? '')
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single() as { data: Profile | null }
      if (data) {
        const d = data as any
        reset({
          full_name: data.full_name,
          display_name: d.display_name ?? '',
          phone: data.phone ?? '',
          city: data.city ?? '',
          bio: data.bio ?? '',
          avatar_url: data.avatar_url ?? '',
        })
        setIco(d.ico ?? null)
        setIcoVerified(d.ico_verified === true)
        setCompanyName(d.company_name ?? null)
        setIsProvider(data.is_provider === true)
        setGallery(d.gallery ?? [])
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

    // Výslovný seznam polí — nikdy neposíláme celý objekt, aby se nedaly propašovat
    // chráněné sloupce (company_name, ico, ico_verified, is_admin…).
    const payload = {
      full_name: values.full_name,
      display_name: values.display_name?.trim() || null,
      phone: values.phone ?? null,
      city: values.city ?? null,
      bio: values.bio ?? null,
      avatar_url: values.avatar_url ?? null,
      gallery,
    }

    const { error: err } = await (supabase.from('profiles') as any).update(payload).eq('id', user.id)
    if (err) { setError('Nepodařilo se uložit profil.') }
    else { setSuccess(true); setTimeout(() => setSuccess(false), 3000) }
    setSaving(false)
  }

  const avatarUrl = watch('avatar_url')
  const displayName = watch('display_name')

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
                    {(displayName || watch('full_name'))?.charAt(0)?.toUpperCase() ?? '?'}
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

          {/* Marketingový název — jen pro poskytovatele */}
          {isProvider && (
            <div className="space-y-1.5">
              <label className="form-label">
                Jak vás mají zákazníci vidět <span className="font-normal text-slate-400">(volitelné)</span>
              </label>
              <input
                {...f('display_name')}
                placeholder="Např. Salon Bella"
                maxLength={50}
                className={`form-input ${errors.display_name ? 'form-input-error' : ''}`}
              />
              {errors.display_name && <p className="form-error">{errors.display_name.message}</p>}
              <p className="text-xs text-slate-400">
                Název, pod kterým vystupujete na kartách a v profilu. Když ho nevyplníte, použije se
                vaše jméno. Vaše ověřená identita a IČO jsou vždy vidět na profilu.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="form-label">Celé jméno *</label>
            <input {...f('full_name')} className={`form-input ${errors.full_name ? 'form-input-error' : ''}`} />
            {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
            {isProvider && (
              <p className="text-xs text-slate-400">Používá se pro fakturaci a ověření totožnosti.</p>
            )}
          </div>

          {/* Ověřená identita z ARES — jen ke čtení */}
          {isProvider && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                Ověřená identita
                {icoVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    <BadgeCheck className="h-3 w-3" /> Ověřeno v ARES
                  </span>
                )}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="form-label text-slate-500">Obchodní firma (z ARES)</label>
                  <input value={companyName ?? '—'} disabled className="form-input bg-white text-slate-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label text-slate-500">IČO</label>
                  <input value={ico ?? '—'} disabled className="form-input bg-white text-slate-500" />
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>
                  Tyto údaje načítáme přímo z veřejného registru ARES a nelze je měnit — právě proto
                  jim zákazníci mohou věřit. Zobrazují se na vašem veřejném profilu.
                </span>
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
              <input {...f('city')} placeholder="Vsetín" className="form-input" />
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

      {/* Zabezpečení — změna hesla */}
      {userEmail && <ChangePasswordSection userEmail={userEmail} />}
    </div>
  )
}