// app/dashboard/predplatne/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, Sparkles, ShieldCheck, Wallet, BadgeCheck, ArrowLeft } from 'lucide-react'
import SubscribeButton from '@/components/ui/SubscribeButton'

export const metadata = { title: 'Předplatné | Propojo' }

interface Props { searchParams: { stav?: string } }

export default async function PredplatnePage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/predplatne')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean } | null }

  // Předplatné je jen pro poskytovatele
  if (profile?.is_provider !== true) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">Předplatné je určeno pro poskytovatele služeb.</p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex"><ArrowLeft className="h-4 w-4" /> Zpět na přehled</Link>
      </div>
    )
  }

  // Aktuální předplatné (poslední záznam uživatele)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, trial_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { status: string; current_period_end: string | null; trial_end: string | null; cancel_at_period_end: boolean } | null }

  const isActive = sub?.status === 'active' || sub?.status === 'trialing'
  const stav = searchParams.stav

  const fmtDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long' }).format(new Date(iso)) : '—'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Předplatné</h1>
        <p className="mt-0.5 text-sm text-slate-500">Správa vašeho předplatného Propojo.</p>
      </div>

      {/* Hláška po návratu z Checkoutu */}
      {stav === 'uspech' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Platba proběhla. Aktivace předplatného se může projevit do pár sekund – obnovte stránku.
        </div>
      )}
      {stav === 'zruseno' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <XCircle className="h-4 w-4 shrink-0" />
          Platba byla zrušena. Předplatné nebylo aktivováno.
        </div>
      )}

      {isActive ? (
        // ── AKTIVNÍ PŘEDPLATNÉ ────────────────────────────────
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Předplatné je aktivní</p>
              <p className="text-sm text-slate-500">
                {sub?.status === 'trialing' ? 'Zkušební období (první měsíc zdarma)' : 'Propojo Standard – 299 Kč/měsíc'}
              </p>
            </div>
          </div>
          <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            {sub?.status === 'trialing' && sub?.trial_end && (
              <div className="flex justify-between"><span className="text-slate-500">Zkušební období do</span><span className="font-semibold text-slate-800">{fmtDate(sub.trial_end)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-slate-500">Další platba</span><span className="font-semibold text-slate-800">{fmtDate(sub?.current_period_end ?? null)}</span></div>
            {sub?.cancel_at_period_end && (
              <div className="flex justify-between"><span className="text-slate-500">Stav</span><span className="font-semibold text-amber-600">Bude ukončeno na konci období</span></div>
            )}
          </div>
        </div>
      ) : (
        // ── NEMÁ PŘEDPLATNÉ ───────────────────────────────────
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-black text-slate-900">Propojo Standard</h2>
          </div>
          <div className="mb-4 flex items-baseline gap-1">
            <span className="text-3xl font-black text-slate-900">299 Kč</span>
            <span className="text-slate-500">/ měsíc</span>
          </div>
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            <BadgeCheck className="h-4 w-4" /> První měsíc zdarma
          </div>

          <ul className="mb-6 space-y-3 text-sm text-slate-700">
            <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" /> Ověřený profil s odznakem důvěryhodnosti</li>
            <li className="flex gap-2.5"><Wallet className="h-4 w-4 shrink-0 text-emerald-600" /> <strong>Žádná provize</strong> z vaší práce – platíte jen předplatné</li>
            <li className="flex gap-2.5"><Sparkles className="h-4 w-4 shrink-0 text-emerald-600" /> Neomezené nabídky služeb v marketplace</li>
          </ul>

          <SubscribeButton />

          <p className="mt-3 text-center text-xs text-slate-400">
            Zrušit můžete kdykoli. Platbu zpracovává Stripe.
          </p>
        </div>
      )}
    </div>
  )
}