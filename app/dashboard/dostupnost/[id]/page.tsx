// app/dashboard/dostupnost/[id]/page.tsx
// Dostupnost jedné karty — otevírací doba, rezerva na přejezd, sdílený kalendář.
//
// Záměrně samostatná stránka, ne další blok v ServiceForm: formulář karty je
// už dost dlouhý a dostupnost se mění jindy než popis a fotky. Nastavení tak
// žije na jednom jediném místě — ServiceForm sem pouze odkazuje.

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getServiceHours, providerHasOtherCards } from '@/lib/actions/service-hours'
import ServiceHours from '@/components/forms/ServiceHours'

export const metadata: Metadata = { title: 'Dostupnost karty | Propojo' }

interface Props { params: { id: string } }

export default async function DostupnostPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/prihlasit?next=/dashboard/dostupnost/${params.id}`)

  const { data: service } = await supabase
    .from('services')
    .select('id, title, provider_id, location_type, travel_buffer_minutes, separate_calendar')
    .eq('id', params.id)
    .single() as { data: any }

  // Cizí kartu neukazujeme ani nepřiznáváme, že existuje.
  if (!service || service.provider_id !== user.id) notFound()

  const [hours, hasOtherCards] = await Promise.all([
    getServiceHours(params.id),
    providerHasOtherCards(params.id),
  ])

  const isTravelCard = service.location_type !== 'u_poskytovatele'

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/nabidky"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Zpět na Moje nabídky
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
          <CalendarDays className="h-6 w-6 text-emerald-600" /> Dostupnost
        </h1>
        <p className="mt-1 text-sm text-slate-500">{service.title}</p>
      </div>

      <ServiceHours
        serviceId={service.id}
        initialHours={hours}
        initialTravelBuffer={Number(service.travel_buffer_minutes ?? 0)}
        initialSeparateCalendar={service.separate_calendar === true}
        isTravelCard={isTravelCard}
        hasOtherCards={hasOtherCards}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-bold text-slate-800">Jak to funguje dál</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Z otevírací doby se zákazníkům nabídnou konkrétní volné časy podle délky úkonu.
          Obsazené termíny a časy, které si zablokujete, se mezi nimi nikdy neobjeví.
          Jednorázová volna a zákazníky z ulice zapíšete v denním přehledu.
        </p>
        <Link
          href="/dashboard/terminy"
          className="mt-3 inline-flex text-sm font-semibold text-emerald-600 hover:underline"
        >
          Přejít na termíny →
        </Link>
      </div>
    </div>
  )
}