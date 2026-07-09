// app/poptavky/page.tsx
// Veřejná nástěnka poptávek. Kontakt vidí jen řemeslník s aktivním předplatným.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { MapPin, Clock, Lock, Phone, Mail, Plus, Megaphone } from 'lucide-react'

export const metadata = { title: 'Poptávky | Propojo' }
export const dynamic = 'force-dynamic'

type Poptavka = {
  id: string
  title: string
  description: string | null
  category: string | null
  city: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'právě teď'
  if (h < 24) return `před ${h} h`
  const d = Math.floor(h / 24)
  return `před ${d} ${d === 1 ? 'dnem' : d < 5 ? 'dny' : 'dny'}`
}

export default async function PoptavkyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Zjistíme, jestli je aktuální uživatel řemeslník s aktivním předplatným
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

  const { data: poptavky } = await supabase
    .from('poptavky')
    .select('id, title, description, category, city, contact_name, contact_phone, contact_email, created_at')
    .eq('status', 'aktivni')
    .order('created_at', { ascending: false })
    .limit(100) as { data: Poptavka[] | null }

  const list = poptavky ?? []

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Hlavička */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Poptávky zákazníků</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Lidé, kteří shánějí řemeslníka. {canSeeContact ? 'Ozvěte se jim přímo.' : 'Kontakt vidí předplatitelé.'}
          </p>
        </div>
        <Link
          href="/poptavky/nova"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
        >
          <Plus className="h-4 w-4" /> Vyvěsit poptávku
        </Link>
      </div>

      {/* Výzva pro neplatící řemeslníky */}
      {user && !canSeeContact && list.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-800">
            <strong>Chcete se zákazníkům ozvat?</strong> Kontaktní údaje se odemknou s aktivním předplatným.{' '}
            <Link href="/dashboard/predplatne" className="font-bold underline">Aktivovat předplatné</Link>
          </div>
        </div>
      )}

      {/* Prázdný stav */}
      {list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <h3 className="mb-1 text-lg font-bold text-slate-800">Zatím žádné poptávky</h3>
          <p className="mx-auto mb-5 max-w-sm text-sm text-slate-500">
            Sháníte řemeslníka a nikoho nenašli? Vyvěste poptávku a nechte je ozvat se vám.
          </p>
          <Link href="/poptavky/nova" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">
            <Plus className="h-4 w-4" /> Vyvěsit poptávku
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900">{p.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {p.city}</span>
                    {p.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{p.category}</span>}
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(p.created_at)}</span>
                  </div>
                </div>
              </div>

              {p.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{p.description}</p>
              )}

              {/* Kontakt — jen pro předplatitele */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                {canSeeContact ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-semibold text-slate-800">{p.contact_name}</span>
                    {p.contact_phone && (
                      <a href={`tel:${p.contact_phone}`} className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline">
                        <Phone className="h-3.5 w-3.5" /> {p.contact_phone}
                      </a>
                    )}
                    {p.contact_email && (
                      <a href={`mailto:${p.contact_email}`} className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline">
                        <Mail className="h-3.5 w-3.5" /> {p.contact_email}
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Lock className="h-4 w-4 shrink-0" />
                    {user ? (
                      <span><Link href="/dashboard/predplatne" className="font-semibold text-emerald-700 hover:underline">Aktivujte předplatné</Link> pro zobrazení kontaktu</span>
                    ) : (
                      <span><Link href="/prihlasit" className="font-semibold text-emerald-700 hover:underline">Přihlaste se</Link> jako řemeslník pro zobrazení kontaktu</span>
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