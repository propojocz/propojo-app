// app/dashboard/predplatne/page.tsx
//
// Stránka vysvětluje DVĚ ODDĚLENÉ věci, které se pletou:
//   1) PŘEDPLATNÉ  → aby byl profil a nabídky VIDĚT v marketplace (299 Kč/měsíc, 1. měsíc zdarma)
//   2) NAPOJENÍ ÚČTU (Stripe Connect) → aby mohl PŘIJÍMAT zálohy od zákazníků
//
// Barvy podle stavu:
//   – oranžová = ještě potřeba udělat (barva poskytovatele)
//   – zelená   = hotovo / aktivní

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, XCircle, Sparkles, ShieldCheck, Wallet, BadgeCheck,
  ArrowLeft, Eye, Landmark, ArrowRight, CircleDollarSign,
} from 'lucide-react'
import SubscribeButton from '@/components/ui/SubscribeButton'
import ManageSubscriptionButton from '@/components/ui/ManageSubscriptionButton'

export const metadata = { title: 'Předplatné | Propojo' }

interface Props { searchParams: { stav?: string } }

export default async function PredplatnePage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/predplatne')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider, stripe_onboarding_done, stripe_payouts_enabled')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean; stripe_onboarding_done: boolean; stripe_payouts_enabled: boolean } | null }

  if (profile?.is_provider !== true) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">Předplatné je určeno pro poskytovatele služeb.</p>
        <Link href="/dashboard" className="btn-secondary mt-4 inline-flex"><ArrowLeft className="h-4 w-4" /> Zpět na přehled</Link>
      </div>
    )
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, billing_period, current_period_end, trial_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { status: string; billing_period: string | null; current_period_end: string | null; trial_end: string | null; cancel_at_period_end: boolean } | null }

  const isActive = sub?.status === 'active' || sub?.status === 'trialing'
  const connectReady = profile.stripe_onboarding_done && profile.stripe_payouts_enabled
  const stav = searchParams.stav

  const fmtDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long' }).format(new Date(iso)) : '—'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Předplatné a platby</h1>
        <p className="mt-0.5 text-sm text-slate-500">Dva kroky, aby vás zákazníci našli a mohli u vás zaplatit.</p>
      </div>

      {/* Hláška po návratu z Checkoutu */}
      {stav === 'uspech' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Platba proběhla. Aktivace se může projevit do pár sekund – obnovte stránku.
        </div>
      )}
      {stav === 'zruseno' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <XCircle className="h-4 w-4 shrink-0" />
          Platba byla zrušena. Předplatné nebylo aktivováno.
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          KROK 1 — PŘEDPLATNÉ (viditelnost)
          ══════════════════════════════════════════════════════════ */}
      {isActive ? (
        // AKTIVNÍ — zeleně
        <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Eye className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="flex items-center gap-2 text-lg font-black text-slate-900">
                Vaše nabídky jsou viditelné
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> Aktivní
                </span>
              </p>
              <p className="text-sm text-slate-500">
                {sub?.status === 'trialing'
                  ? 'Zkušební období zdarma – zákazníci vás už vidí v marketplace'
                  : sub?.billing_period === 'yearly'
                    ? 'Propojo Standard – 2 990 Kč/rok'
                    : 'Propojo Standard – 299 Kč/měsíc'}
              </p>
            </div>
          </div>
          <div className="mb-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            {sub?.status === 'trialing' && sub?.trial_end && (
              <div className="flex justify-between"><span className="text-slate-500">Zdarma do</span><span className="font-semibold text-slate-800">{fmtDate(sub.trial_end)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-slate-500">{sub?.cancel_at_period_end ? 'Platnost do' : 'Další platba'}</span><span className="font-semibold text-slate-800">{fmtDate(sub?.current_period_end ?? null)}</span></div>
            {sub?.cancel_at_period_end && (
              <div className="flex justify-between"><span className="text-slate-500">Stav</span><span className="font-semibold text-amber-600">Bude ukončeno na konci období</span></div>
            )}
          </div>
          <ManageSubscriptionButton />
          <p className="mt-3 text-center text-xs text-slate-400">
            Ve správě můžete předplatné zrušit, změnit kartu nebo zobrazit faktury.
          </p>
        </section>
      ) : (
        // NEAKTIVNÍ — oranžově, s vysvětlením
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-6 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Eye className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Krok 1 · Zviditelněte své nabídky</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                Dokud nemáte aktivní předplatné, <strong>váš profil ani nabídky se v marketplace nezobrazují</strong> –
                zákazníci vás zatím nevidí. Připravit si služby (karty) a profil ale můžete kdykoli –
                po aktivaci se zveřejní tak, jak jste si je nachystali.
              </p>
            </div>
          </div>

          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            <BadgeCheck className="h-4 w-4" /> První měsíc zdarma
          </div>

          <ul className="mb-6 space-y-3 text-sm text-slate-700">
            <li className="flex gap-2.5"><Eye className="h-4 w-4 shrink-0 text-amber-600" /> Váš profil a nabídky se zobrazí zákazníkům v marketplace</li>
            <li className="flex gap-2.5"><Wallet className="h-4 w-4 shrink-0 text-amber-600" /> <strong>Žádná provize</strong> z vaší práce – platíte jen předplatné</li>
            <li className="flex gap-2.5"><Sparkles className="h-4 w-4 shrink-0 text-amber-600" /> Neomezený počet nabídek</li>
          </ul>

          <SubscribeButton />
          <p className="mt-3 text-center text-xs text-slate-400">
            299 Kč/měsíc, první měsíc zdarma. Zrušit můžete kdykoli. Platbu zpracovává Stripe.
          </p>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          KROK 2 — NAPOJENÍ ÚČTU (přijímání plateb)
          ══════════════════════════════════════════════════════════ */}
      {connectReady ? (
        // NAPOJENO — zeleně
        <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CircleDollarSign className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="flex items-center gap-2 text-lg font-black text-slate-900">
                Můžete přijímat platby
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> Napojeno
                </span>
              </p>
              <p className="text-sm text-slate-500">Zálohy od zákazníků chodí přímo na váš bankovní účet.</p>
            </div>
          </div>
        </section>
      ) : (
        // NENAPOJENO — oranžově, s vysvětlením a odkazem na Výplaty
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-6 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Landmark className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Krok 2 · Napojte účet pro platby</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                Aby u vás zákazníci mohli <strong>zaplatit rezervační zálohu</strong>, napojte si bankovní účet přes Stripe.
                Je to <strong>jen kvůli výplatám</strong> – teď se vám nic nestrhává. Bez napojení vás zákazníci uvidí,
                ale nezaplatí u vás online.
              </p>
            </div>
          </div>

          <ul className="mb-6 space-y-3 text-sm text-slate-700">
            <li className="flex gap-2.5"><ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" /> Bezpečné ověření přes Stripe – Propojo k údajům nemá přístup</li>
            <li className="flex gap-2.5"><Wallet className="h-4 w-4 shrink-0 text-amber-600" /> Zálohy chodí přímo na váš bankovní účet</li>
          </ul>

          <Link
            href="/dashboard/vyplaty"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-white transition hover:bg-amber-600"
          >
            Napojit účet pro platby <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {/* Shrnutí — co ještě zbývá */}
      {(!isActive || !connectReady) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <strong className="text-slate-700">Jak to funguje:</strong>{' '}
              {!isActive && 'Aktivace předplatného vás zviditelní zákazníkům. '}
              {!connectReady && 'Napojení účtu jim umožní u vás zaplatit zálohu. '}
              Obě věci můžete vyřídit kdykoli.
            </span>
          </p>
        </div>
      )}
    </div>
  )
}