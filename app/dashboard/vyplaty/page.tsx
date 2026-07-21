// app/dashboard/vyplaty/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, Landmark, ShieldCheck, ArrowLeft, Clock, Eye, ArrowRight } from 'lucide-react'
import ConnectButton from '@/components/ui/ConnectButton'
import { refreshConnectStatus } from '@/lib/actions/connect'

export const metadata = { title: 'Výplaty | Propojo' }

interface Props { searchParams: { stav?: string } }

export default async function VyplatyPage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/vyplaty')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider, stripe_account_id, stripe_onboarding_done, stripe_payouts_enabled')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean; stripe_account_id: string | null; stripe_onboarding_done: boolean; stripe_payouts_enabled: boolean } | null }

  // Výplaty jsou jen pro poskytovatele
  if (profile?.is_provider !== true) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">Výplaty jsou určeny pro poskytovatele služeb.</p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex"><ArrowLeft className="h-4 w-4" /> Zpět na přehled</Link>
      </div>
    )
  }

  // Po návratu z onboardingu obnovíme stav přímo ze Stripe (ať nečekáme na webhook)
  let payoutsEnabled = profile.stripe_payouts_enabled
  let onboardingDone = profile.stripe_onboarding_done
  if (searchParams.stav === 'hotovo' && profile.stripe_account_id) {
    const fresh = await refreshConnectStatus()
    payoutsEnabled = fresh.payoutsEnabled
    onboardingDone = fresh.onboardingDone
  }

  const hasAccount = !!profile.stripe_account_id
  const fullyReady = payoutsEnabled && onboardingDone

  // Má aktivní předplatné? Bez něj jsou nabídky neviditelné — a když sem přišel
  // rovnou napojit účet (Krok 2), Stripe ho vrátí sem a Krok 1 by mu utekl.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .limit(1)
    .maybeSingle() as { data: { status: string } | null }
  const hasActiveSub = !!sub

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Výplaty</h1>
        <p className="mt-0.5 text-sm text-slate-500">Napojení bankovního účtu pro příjem záloh od zákazníků.</p>
      </div>

      {fullyReady ? (
        // ── ÚČET PLNĚ NAPOJEN ─────────────────────────────────
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Účet je napojen</p>
              <p className="text-sm text-slate-500">Můžete přijímat zálohy od zákazníků. Peníze chodí na váš bankovní účet.</p>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>Vaše bankovní údaje a ověření spravuje bezpečně Stripe. Propojo k nim nemá přístup.</span>
          </div>
        </div>
      ) : hasAccount && !fullyReady ? (
        // ── ROZDĚLANÉ (založen účet, ale onboarding nedokončen) ─
        <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Napojení není dokončené</p>
              <p className="text-sm text-slate-500">Dokončete prosím vyplnění údajů u Stripe, abyste mohli přijímat platby.</p>
            </div>
          </div>
          <ConnectButton label="Dokončit napojení" />
        </div>
      ) : (
        // ── ZATÍM NENAPOJENO ──────────────────────────────────
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-black text-slate-900">Napojte bankovní účet</h2>
          </div>
          <p className="mb-5 text-sm text-slate-500">
            Abyste mohli přijímat rezervační zálohy od zákazníků, napojte svůj bankovní účet přes Stripe.
            Vyplnění zabere pár minut – proběhne přímo u Stripe v češtině.
          </p>

          <ul className="mb-6 space-y-3 text-sm text-slate-700">
            <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" /> Bezpečné ověření přes Stripe (IČO, bankovní účet)</li>
            <li className="flex gap-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Zálohy chodí přímo na váš účet</li>
            <li className="flex gap-2.5"><AlertTriangle className="h-4 w-4 shrink-0 text-emerald-600" /> Propojo nemá přístup k vašim bankovním údajům</li>
          </ul>

          <p className="mb-4 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>Budete potřebovat svůj <strong>IBAN</strong> — najdete ho ve své bankovní aplikaci u čísla účtu.</span>
          </p>

          <ConnectButton />
        </div>
      )}

      {/* ── NAVAZUJÍCÍ KROK ─────────────────────────────────────
          Kdo si napojil účet jako první, snadno přehlédne, že bez předplatného
          ho stejně nikdo neuvidí. Stripe ho po onboardingu vrátí sem, ne na
          stránku Předplatné — tak mu to připomeneme rovnou tady. */}
      {fullyReady && !hasActiveSub && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <Eye className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900">Zbývá poslední krok</p>
              <p className="text-sm leading-relaxed text-slate-600">
                Platby přijímat můžete, ale <strong>vaše nabídky zákazníci zatím nevidí</strong>.
                Zviditelní je předplatné — první měsíc zdarma.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/predplatne"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-bold text-white transition hover:bg-amber-600"
          >
            Aktivovat předplatné <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Vše hotovo */}
      {fullyReady && hasActiveSub && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Máte hotovo — nabídky jsou viditelné a můžete přijímat platby.
        </div>
      )}
    </div>
  )
}