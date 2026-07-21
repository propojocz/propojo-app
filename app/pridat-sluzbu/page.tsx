// app/pridat-sluzbu/page.tsx
// Stránka pro přidání nové služby – pouze ověření poskytovatelé (s IČO)

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceForm from '@/components/forms/ServiceForm'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, ArrowRight, EyeOff } from 'lucide-react'

export const metadata = {
  title: 'Přidat novou službu | Propojo',
  description: 'Nabídněte své řemeslné či profesionální služby tisícům zákazníků.',
}

export default async function PridatSluzbuPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Nepřihlášeného uživatele přesměrujeme na login
  if (!user) {
    redirect('/prihlasit?next=/pridat-sluzbu')
  }

  // Ověříme roli – službu smí přidat jen poskytovatel (živnostník s IČO)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean } | null }

  const isProvider = profile?.is_provider === true

  // Má aktivní předplatné? Bez něj se nabídka po uložení nezveřejní — a poskytovatel
  // to musí vědět DŘÍV, než ji vyplní, ne až když ji nikde nenajde.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .limit(1)
    .maybeSingle() as { data: { status: string } | null }
  const hasActiveSub = !!sub

  // Zákazník (bez role poskytovatele) – výzva ke stání se živnostníkem
  if (!isProvider) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <Link
            href="/marketplace"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na Marketplace
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <BadgeCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="mb-2 text-2xl font-black text-slate-900">Začněte nabízet své služby</h1>
            <p className="mx-auto mb-6 max-w-md text-slate-500">
              Váš účet zůstane stejný — jen ho rozšíříme. Stačí zadat IČO, ověříme ho v registru ARES
              a získáte odznak důvěryhodnosti. Zabere to půl minuty.
            </p>
            {/* Přihlášený zákazník NEJDE na /registrace/zivnostnik — to je průvodce pro
                zakládání NOVÉHO účtu (jméno, e-mail, heslo), které už dávno má.
                Míří na jednoduchý přechod: jedno pole s IČO. */}
            <Link href="/stat-se-poskytovatelem" className="btn-primary inline-flex">
              Pokračovat <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-6 text-xs text-slate-400">
              Předplatné 299 Kč/měsíc, první měsíc zdarma. Žádná provize z práce.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* Zpět */}
        <Link
          href="/marketplace"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na Marketplace
        </Link>

        {/* Bez předplatného: jasně říct, že se nabídka nezveřejní, a nabídnout cestu ven */}
        {!hasActiveSub && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <EyeOff className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Nabídku si připravte — zveřejní se po aktivaci předplatného</p>
                <p className="text-sm leading-relaxed text-slate-600">
                  Můžete ji vyplnit a uložit už teď. Zákazníkům se v marketplace zobrazí, jakmile budete mít
                  aktivní předplatné — <strong>první měsíc zdarma</strong>.
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

        {/* Hlavička */}
        <div className="mb-8">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-600">
            Nová nabídka
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Čím můžete pomoci?
          </h1>
          <p className="mt-2 text-slate-500">
            {hasActiveSub
              ? 'Vyplňte formulář a vaše nabídka se zobrazí zákazníkům v marketplace.'
              : 'Vyplňte formulář v klidu — uložit si nabídku můžete i bez předplatného.'}
          </p>
        </div>

        {/* Formulář */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ServiceForm mode="create" hasActiveSub={hasActiveSub} />
        </div>

        {/* Podmínky */}
        <p className="mt-4 text-center text-xs text-slate-400">
          Přidáním souhlasíte s{' '}
          <Link href="/podminky" className="underline hover:text-slate-600">
            obchodními podmínkami
          </Link>{' '}
          a{' '}
          <Link href="/soukromi" className="underline hover:text-slate-600">
            zásadami ochrany osobních údajů
          </Link>
          .
        </p>
      </div>
    </main>
  )
}