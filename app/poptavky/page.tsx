// app/poptavky/page.tsx
// Veřejná nástěnka poptávek od zákazníků.
//
// BEZPEČNOST: data načítáme na SERVERU přes admin klienta (service role).
// Kontaktní údaje (e-mail, telefon) se do HTML vůbec nedostanou, pokud uživatel
// nemá aktivní předplatné — nejde je tedy získat ani přes vývojářské nástroje
// nebo přímým dotazem na API. RLS na tabulce `leads` zůstává zamčená.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { MapPin, Clock, Lock, Phone, Mail, Send, Megaphone, CalendarClock } from 'lucide-react'

export const metadata = { title: 'Poptávky zákazníků | Propojo' }
export const dynamic = 'force-dynamic'

type Lead = {
  id: string
  email: string
  phone: string | null
  category: string | null
  description: string
  city: string
  preferred_date: string | null
  photos: string[] | null
  created_at: string
}

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'právě teď'
  if (h < 24) return `před ${h} h`
  const d = Math.floor(h / 24)
  return `před ${d} ${d === 1 ? 'dnem' : 'dny'}`
}

export default async function PoptavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Má uživatel aktivní předplatné? (jen pak uvidí kontakt)
  let canSeeContact = false
  if (user) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { status: string } | null }
    canSeeContact = sub?.status === 'active' || sub?.status === 'trialing'
  }

  // Načtení poptávek na serveru (admin klient obchází RLS)
  const admin = getAdminClient()
  const { data: leads } = await admin
    .from('leads')
    .select('id, email, phone, category, description, city, preferred_date, photos, created_at')
    .eq('status', 'nova')
    .order('created_at', { ascending: false })
    .limit(100) as { data: Lead[] | null }

  const list = leads ?? []

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Hlavička */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Poptávky zákazníků</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Lidé, kteří shánějí řemeslníka.{' '}
            {canSeeContact ? 'Ozvěte se jim přímo.' : 'Kontakt vidí předplatitelé.'}
          </p>
        </div>
        <Link
          href="/poptavky/nova"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
        >
          <Send className="h-4 w-4" /> Zanechat poptávku
        </Link>
      </div>

      {/* Výzva pro řemeslníky bez předplatného */}
      {user && !canSeeContact && list.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-800">
            <strong>Chcete se zákazníkům ozvat?</strong> Kontaktní údaje se odemknou s aktivním předplatným.{' '}
            <Link href="/dashboard/predplatne" className="font-bold underline">
              Aktivovat předplatné
            </Link>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <h3 className="mb-1 text-lg font-bold text-slate-800">Zatím žádné poptávky</h3>
          <p className="mx-auto mb-5 max-w-sm text-sm text-slate-500">
            Sháníte řemeslníka a nikoho jste nenašli? Zanechte poptávku a nechte je ozvat se vám.
          </p>
          <Link href="/poptavky/nova" className="btn-primary inline-flex">
            <Send className="h-4 w-4" /> Zanechat poptávku
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((lead) => (
            <article key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {lead.category && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                    {lead.category}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {lead.city}
                </span>
                {lead.preferred_date && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> {lead.preferred_date}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {timeAgo(lead.created_at)}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {lead.description}
              </p>

              {/* Fotky */}
              {lead.photos && lead.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {lead.photos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-xl border border-slate-200 object-cover"
                    />
                  ))}
                </div>
              )}

              {/* Kontakt — vykreslí se JEN předplatiteli */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                {canSeeContact ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <a
                      href={`mailto:${lead.email}`}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" /> {lead.email}
                    </a>
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" /> {lead.phone}
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Lock className="h-4 w-4 shrink-0" />
                    {user ? (
                      <span>
                        <Link href="/dashboard/predplatne" className="font-semibold text-emerald-700 hover:underline">
                          Aktivujte předplatné
                        </Link>{' '}
                        pro zobrazení kontaktu
                      </span>
                    ) : (
                      <span>
                        <Link href="/prihlasit?next=/poptavky" className="font-semibold text-emerald-700 hover:underline">
                          Přihlaste se
                        </Link>{' '}
                        jako řemeslník pro zobrazení kontaktu
                      </span>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}