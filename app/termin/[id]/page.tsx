// app/termin/[id]/page.tsx
// VEŘEJNÁ stránka jednoho volného termínu — cíl odkazu, který poskytovatel
// hodí do Instagram story („v pátek mi vypadl klient, mám volno 14–16").
//
// Kdokoli (i nepřihlášený) uvidí: kdy, kdo, co se do okna vejde a za kolik.
// Klik na úkon otevře objednávku (OrderItemModal) s tímhle jedním termínem.
//
// Když je termín mezitím zabraný nebo prošlý, NEVRACÍME 404 — ukážeme, že je
// pryč, a nabídneme kartu s dalšími volnými termíny. Story žije den, termín minuty.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarDays, Clock, MapPin, ArrowRight, CircleCheck, CircleAlert } from 'lucide-react'
import type { ServiceItem } from '@/types/database'
import Avatar from '@/components/ui/Avatar'
import SlotBooking from './SlotBooking'
import type { Metadata } from 'next'

interface Props { params: { id: string } }

type SlotRow = {
  id: string
  provider_id: string
  starts_at: string
  ends_at: string
  status: string
}

const fmtDayLong = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function windowMinutes(startsAt: string, endsAt: string): number {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data: slot } = await supabase
    .from('availability_slots')
    .select('starts_at, ends_at, provider_id')
    .eq('id', params.id)
    .single() as { data: { starts_at: string; ends_at: string; provider_id: string } | null }

  if (!slot) return { title: 'Termín nenalezen' }

  const { data: prof } = await supabase
    .from('profiles')
    .select('display_name, company_name, full_name')
    .eq('id', slot.provider_id)
    .single() as { data: any }

  const name = prof?.display_name || prof?.company_name || prof?.full_name || 'Poskytovatel'
  const title = `Volný termín ${fmtDayLong(slot.starts_at)} ${fmtTime(slot.starts_at)} — ${name}`

  return {
    title,
    description: `${name} má volno ${fmtDayLong(slot.starts_at)} od ${fmtTime(slot.starts_at)}. Rezervujte online přes Propojo.`,
    openGraph: { title, description: 'Volný termín k rezervaci', type: 'website' },
    // Termín je pomíjivý — ať ho vyhledávače neindexují jako trvalý obsah.
    robots: { index: false, follow: true },
  }
}

export default async function TerminPage({ params }: Props) {
  const supabase = createClient()

  const { data: slot } = await supabase
    .from('availability_slots')
    .select('id, provider_id, starts_at, ends_at, status')
    .eq('id', params.id)
    .single() as { data: SlotRow | null }

  if (!slot) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  // Karty nabízené v tomto okně
  const { data: links } = await supabase
    .from('slot_services')
    .select('service_id')
    .eq('slot_id', slot.id) as { data: { service_id: string }[] | null }
  const serviceIds = Array.from(new Set((links ?? []).map((l) => l.service_id)))
  if (serviceIds.length === 0) notFound()

  const { data: services } = await supabase
    .from('services')
    .select(`id, title, subtitle, city, image_url, location_type, quote_fee, price_per_km, free_km, quote_days, is_active,
             profiles (id, full_name, display_name, company_name, avatar_url, rating, review_count, is_suspended)`)
    .in('id', serviceIds)
    .eq('is_active', true) as { data: any[] | null }

  const activeServices = (services ?? []).filter((s) => s.profiles?.is_suspended !== true)
  if (activeServices.length === 0) notFound()

  // Viditelnost stejná jako v marketplace: bez aktivního předplatného karta neexistuje.
  // (Čte se přes service role — subscriptions má RLS „každý vidí jen svoje".)
  const adminDb = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: subs } = await adminDb
    .from('subscriptions')
    .select('user_id')
    .eq('user_id', slot.provider_id)
    .in('status', ['active', 'trialing'])
    .limit(1)
  if (!subs || subs.length === 0) notFound()

  const provider = activeServices[0].profiles
  const providerName = provider?.display_name || provider?.company_name || provider?.full_name || 'Poskytovatel'

  const minutes = windowMinutes(slot.starts_at, slot.ends_at)
  const isPast = new Date(slot.starts_at) < new Date()
  const isTaken = slot.status !== 'volno'
  const gone = isPast || isTaken

  // Úkony, které se do okna vejdou (jen zveřejněné, model A — nacenění se nerezervuje na čas)
  let items: ServiceItem[] = []
  if (!gone) {
    const { data: itemRows } = await supabase
      .from('service_items')
      .select('*')
      .in('service_id', serviceIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }) as { data: ServiceItem[] | null }
    items = (itemRows ?? []).filter(
      (i) => i.payment_model !== 'B' && (!i.duration_minutes || i.duration_minutes <= minutes)
    )
  }

  // Mapa karta → údaje potřebné k objednávce
  const serviceMap: Record<string, {
    title: string
    locationType: string | null
    quoteTerms: { quote_fee: number | null; price_per_km: number | null; free_km: number | null; quote_days: number | null }
  }> = {}
  for (const s of activeServices) {
    serviceMap[s.id] = {
      title: s.title,
      locationType: s.location_type,
      quoteTerms: {
        quote_fee: s.quote_fee,
        price_per_km: s.price_per_km,
        free_km: s.free_km,
        quote_days: s.quote_days,
      },
    }
  }

  const mainService = activeServices[0]

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">

        {/* Hlavička termínu */}
        <div className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${gone ? 'border-slate-200' : 'border-emerald-500'}`}>
          <div className={`px-5 py-4 ${gone ? 'bg-slate-100' : 'bg-emerald-50'}`}>
            <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${gone ? 'text-slate-500' : 'text-emerald-700'}`}>
              {gone ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
              {isPast ? 'Termín už proběhl' : isTaken ? 'Termín je obsazený' : 'Volný termín'}
            </p>
            <p className="mt-1 text-2xl font-black leading-tight text-slate-900">
              {fmtDayLong(slot.starts_at)}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-lg font-bold text-slate-700">
              <Clock className="h-4 w-4 text-slate-400" />
              {fmtTime(slot.starts_at)}–{fmtTime(slot.ends_at)}
              <span className="text-sm font-normal text-slate-400">({minutes} min)</span>
            </p>
          </div>

          {/* Poskytovatel */}
          <Link href={`/sluzby/${mainService.id}`} className="flex items-center gap-3 border-t border-slate-100 px-5 py-4 transition hover:bg-slate-50">
            <Avatar name={providerName} url={provider?.avatar_url} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-slate-900">{providerName}</p>
              <p className="flex items-center gap-1 truncate text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {mainService.city}
                {mainService.subtitle && <span className="truncate"> · {mainService.subtitle}</span>}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        </div>

        {/* Obsah podle stavu */}
        {gone ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              {isPast
                ? 'Tenhle termín už je za námi.'
                : 'Někdo byl rychlejší — termín je zabraný.'}
              {' '}Podívejte se, jestli má {providerName} volno jindy.
            </p>
            <Link
              href={`/sluzby/${mainService.id}`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-bold text-white transition hover:bg-emerald-600"
            >
              <CalendarDays className="h-4 w-4" /> Zobrazit další termíny
            </Link>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Do tohoto okna se zatím nevejde žádný úkon z ceníku.
            <Link href={`/sluzby/${mainService.id}`} className="mt-3 block font-semibold text-emerald-600 hover:underline">
              Zobrazit celou nabídku →
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-2 mt-5 text-sm font-bold text-slate-700">
              Co se do termínu vejde:
            </p>
            <SlotBooking
              items={items}
              slot={{ id: slot.id, starts_at: slot.starts_at, ends_at: slot.ends_at }}
              providerId={slot.provider_id}
              serviceMap={serviceMap}
              isLoggedIn={!!user}
            />
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
              Termín je volný pro toho, kdo si ho vezme první. Po rezervaci je rovnou potvrzený.
            </p>
          </>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Rezervace přes{' '}
          <Link href="/" className="font-semibold text-emerald-600 hover:underline">Propojo</Link>
        </p>
      </div>
    </main>
  )
}