// app/poptavky/[requestId]/page.tsx
// Detail jedné poptávky. Jednoduchý: kontext poptávky + akce podle role.
//   - poskytovatel: sdílená InterestAction (Mám zájem / Otevřít chat / Plno)
//   - zákazník (vlastník): CTA „Zobrazit zájemce"
// Kontakt zákazníka se tu nikde nezobrazuje.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { MapPin, CalendarClock, Clock, Tag, Users, ArrowLeft, Lock, ChevronRight } from 'lucide-react'
import InterestAction, { type PickerCard } from '@/components/ui/InterestAction'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Detail poptávky | Propojo' }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

const ACTIVE = new Set(['interested', 'negotiating'])

export default async function PoptavkaDetailPage({
  params,
}: {
  params: { requestId: string }
}) {
  const { requestId } = params
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = getAdminClient()

  const { data: req } = await admin
    .from('requests')
    .select('id, customer_id, category, subcategory_id, city, description, preferred_date, photos, status, created_at, expires_at')
    .eq('id', requestId)
    .maybeSingle() as { data: {
      id: string; customer_id: string | null; category: string | null; subcategory_id: string | null
      city: string; description: string; preferred_date: string | null; photos: string[] | null
      status: string; created_at: string; expires_at: string
    } | null }
  if (!req) notFound()

  const isOwner = !!user && req.customer_id === user.id
  const isOpen = req.status === 'open' && new Date(req.expires_at).getTime() > Date.now()

  // Reakce → počet zájemců + můj stav.
  const { data: rs } = await admin
    .from('request_responses')
    .select('id, provider_id, status')
    .eq('request_id', requestId) as { data: Array<{ id: string; provider_id: string; status: string }> | null }
  const responses = rs ?? []
  const activeCount = responses.filter((r) => ACTIVE.has(r.status)).length
  const mine = user ? responses.find((r) => r.provider_id === user.id) : undefined

  let myConversationId: string | null = null
  if (mine) {
    const { data: c } = await admin
      .from('conversations').select('id').eq('request_response_id', mine.id).maybeSingle() as { data: { id: string } | null }
    myConversationId = c?.id ?? null
  }

  // Karty poskytovatele (pro picker) — jen když je přihlášený a není to jeho poptávka.
  let myCards: PickerCard[] = []
  if (user && !isOwner) {
    const { data: cards } = await admin
      .from('services')
      .select('id, title, category, subcategory_id')
      .eq('provider_id', user.id)
      .eq('is_active', true) as { data: Array<{ id: string; title: string | null; category: string | null; subcategory_id: string | null }> | null }
    myCards = (cards ?? []).map((c) => ({ id: c.id, title: c.title ?? 'Nabídka', category: c.category, subcategoryId: c.subcategory_id }))
  }

  const statusBadge = req.status === 'selected'
    ? { text: 'Vybráno', cls: 'bg-emerald-100 text-emerald-700' }
    : !isOpen
      ? { text: 'Uzavřená', cls: 'bg-slate-100 text-slate-500' }
      : { text: 'Otevřená', cls: 'bg-blue-100 text-blue-700' }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/poptavky" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na poptávky
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge.cls}`}>{statusBadge.text}</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" /> {timeAgo(req.created_at)}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-black text-slate-900">{req.category ?? 'Poptávka'}</h1>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
          {req.category && (
            <span className="inline-flex items-center gap-1.5"><Tag className="h-4 w-4 text-slate-400" /> {req.category}</span>
          )}
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {req.city}</span>
          {req.preferred_date && (
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-slate-400" /> {req.preferred_date}</span>
          )}
          <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" /> {activeCount} {activeCount === 1 ? 'zájemce' : activeCount < 5 ? 'zájemci' : 'zájemců'}</span>
        </div>

        {req.description && (
          <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-700">
            {req.description}
          </p>
        )}

        {req.photos && req.photos.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {req.photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="" className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
            ))}
          </div>
        )}

        {/* Akce podle role */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          {isOwner ? (
            <Link
              href={`/dashboard/poptavky/${req.id}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
            >
              Zobrazit zájemce ({activeCount}) <ChevronRight className="h-4 w-4" />
            </Link>
          ) : !isOpen ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
              Tahle poptávka už není otevřená.
            </p>
          ) : (
            <>
              <InterestAction
                requestId={req.id}
                category={req.category}
                subcategoryId={req.subcategory_id}
                isFull={activeCount >= 5}
                initialMyStatus={mine?.status ?? null}
                initialConversationId={myConversationId}
                myCards={myCards}
                isLoggedIn={!!user}
                block
              />
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <Lock className="h-3.5 w-3.5" /> Kontaktní údaje zákazníka uvidíte až po výběru.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}