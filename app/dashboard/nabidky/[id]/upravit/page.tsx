// app/dashboard/nabidky/[id]/upravit/page.tsx
// Úprava existující služby – jen vlastník (poskytovatel).

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceForm from '@/components/forms/ServiceForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Upravit službu | Propojo',
}

interface Props { params: { id: string } }

export default async function UpravitSluzbuPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/prihlasit?next=/dashboard/nabidky/${params.id}/upravit`)

  // Načti službu – musí patřit přihlášenému poskytovateli
  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('id', params.id)
    .eq('provider_id', user.id)
    .single() as { data: any }

  if (!service) notFound()

  // Načti vybrané podkategorie (pro předvyplnění)
  const { data: subLinks } = await supabase
    .from('service_subcategories')
    .select('subcategory_id')
    .eq('service_id', params.id)
  const subcategoryIds = (subLinks ?? []).map((r: any) => r.subcategory_id)

  // Připrav data pro formulář (ServiceForm čte initialData)
  const initialData = { ...service, subcategory_id: subcategoryIds[0] ?? null, subcategory_ids: subcategoryIds }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Link
          href="/dashboard/nabidky"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na Moje nabídky
        </Link>

        <div className="mb-8">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-600">
            Úprava nabídky
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            {service.title}
          </h1>
          <p className="mt-2 text-slate-500">
            Změňte, co potřebujete. Úpravy se projeví u služby okamžitě po uložení.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ServiceForm mode="edit" initialData={initialData} />
        </div>
      </div>
    </main>
  )
}