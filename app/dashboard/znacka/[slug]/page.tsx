// app/znacka/[slug]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Building2, MapPin, Users } from 'lucide-react'
import { getBrandBySlug } from '@/lib/actions/brands'

export const dynamic = 'force-dynamic'

export default async function ZnackaVerejnaPage({ params }: { params: { slug: string } }) {
  const brand = await getBrandBySlug(params.slug)
  if (!brand) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Hlavička značky */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-emerald-50">
            {brand.logo_url
              ? <img src={brand.logo_url} alt={brand.name} className="h-full w-full object-cover" />
              : <Building2 className="h-8 w-8 text-emerald-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {brand.name}
            </h1>
            {brand.city && (
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> {brand.city}
              </p>
            )}
            {brand.bio && <p className="mt-3 text-sm leading-relaxed text-slate-600">{brand.bio}</p>}
          </div>
        </div>
      </div>

      {/* Lidé ve značce */}
      {brand.members.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-700">Náš tým ({brand.members.length})</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {brand.members.map(m => (
              <div key={m.provider_id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt={m.name} className="h-full w-full object-cover" />
                    : m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{m.name}</p>
                  {m.role_label && <p className="text-xs text-slate-400">{m.role_label}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nabídky značky */}
      {brand.services.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-700">Nabídky</h2>
          <div className="space-y-2">
            {brand.services.map(s => (
              <Link key={s.id} href={`/sluzby/${s.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5 transition hover:border-emerald-300 hover:bg-emerald-50/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{s.title}</p>
                  {s.city && <p className="text-xs text-slate-400">{s.city}</p>}
                </div>
                <span className="text-xs font-semibold text-emerald-600">Zobrazit →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {brand.services.length === 0 && brand.members.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-400">Tahle značka zatím nemá žádné veřejné nabídky.</p>
      )}
    </div>
  )
}