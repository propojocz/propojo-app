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
import BillingSettings from '@/components/ui/BillingSettings'
import { getBillingSettings, previewNextInvoiceNumber, type BillingSettings as BillingValues } from '@/lib/actions/billing'
import AddressInput from '@/components/ui/AddressInput'

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
  // Adresa provozovny — nepovinná. Zveřejní se, JEN když si to poskytovatel
  // zapne: u OSVČ bývá sídlo domácí adresa a zveřejnit ji omylem je horší,
  // než ji nemít vůbec.
  address: z.string().max(200).nullable().optional(),
  address_lat: z.number().nullable().optional(),
  address_lng: z.number().nullable().optional(),
  address_public: z.boolean().optional(),
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
  // Fakturační nastavení se načítá zvlášť — stránka je klientská, takže
  // hodnoty tahá server akce až po přihlášení uživatele.
  const [billing, setBilling] = useState<BillingValues | null>(null)
  const [billingNext, setBillingNext] = useState<string | null>(null)
  const [billingLoaded, setBillingLoaded] = useState(false)
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
          address: d.address ?? null,
          address_lat: d.address_lat ?? null,
          address_lng: d.address_lng ?? null,
          address_public: d.address_public === true,
        })
        setIco(d.ico ?? null)
        setIcoVerified(d.ico_verified === true)
        setCompanyName(d.company_name ?? null)
        setIsProvider(data.is_provider === true)
        if (data.is_provider === true) {
          // Fakturace je jen pro poskytovatele — zákazníkovi ji nenačítáme.
          Promise.all([getBillingSettings(), previewNextInvoiceNumber()])
            .then(([nastaveni, dalsiCislo]) => {
              setBilling(nastaveni)
              setBillingNext(dalsiCislo)
              setBillingLoaded(true)
            })
            .catch(() => setBillingLoaded(true))
        }
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
      address: values.address?.trim() || null,
      address_lat: values.address_lat ?? null,
      address_lng: values.address_lng ?? null,
      // Bez adresy nemá co být veřejné.
      address_public: (values.address?.trim() ? values.address_public === true : false),
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

          {/* ── ADRESA PROVOZOVNY ──
              Platí i pro toho, kdo jezdí za zákazníky: kamenná adresa je důkaz,
              že za nabídkou někdo stojí. Proto sedí na profilu, ne na kartě —
              karta řeší, KDE se služba provádí, profil KDO ji dělá. */}
          {isProvider && (
            <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <div>
                <label className="form-label">
                  Adresa provozovny <span className="font-normal text-slate-400">(volitelné)</span>
                </label>
                <p className="mb-2 text-xs leading-relaxed text-slate-400">
                  Máte salon, dílnu nebo kancelář? Zadejte adresu a zákazníkům se ukáže i s mapou.
                  Jezdíte-li jen za zákazníky, nechte prázdné.
                </p>
                <AddressInput
                  defaultValue={watch('address') ?? ''}
                  onPick={(a: { address: string; lat: number; lng: number; municipality: string }) => {
                    setValue('address', a.address)
                    setValue('address_lat', a.lat)
                    setValue('address_lng', a.lng)
                    if (!watch('city') && a.municipality) setValue('city', a.municipality)
                  }}
                  onFreeText={(text: string) => {
                    setValue('address', text || null)
                    setValue('address_lat', null)
                    setValue('address_lng', null)
                  }}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Vyberte adresu ze seznamu — jinak se nepodaří ukázat špendlík na mapě.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={watch('address_public') === true}
                  onChange={(e) => setValue('address_public', e.target.checked)}
                  disabled={!watch('address')}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Zobrazit adresu veřejně</span>
                  <span className="block text-xs leading-relaxed text-slate-500">
                    Adresu uvidí kdokoli na vašem profilu. <strong>Pracujete-li z domova, nechte vypnuté</strong> —
                    zákazníkům se ukáže jen město.
                  </span>
                </span>
              </label>
            </div>
          )}

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

      {/* Fakturace zákazníkům — jen poskytovatel */}
      {isProvider && billingLoaded && (
        <BillingSettings initial={billing} nextNumberPreview={billingNext} />
      )}

      {/* Zabezpečení — změna hesla */}
      {userEmail && <ChangePasswordSection userEmail={userEmail} />}
    </div>
  )
}