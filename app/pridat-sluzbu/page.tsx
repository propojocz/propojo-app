// app/pridat-sluzbu/page.tsx
// Stránka pro přidání nové služby – pouze ověření poskytovatelé (s IČO)

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceForm from '@/components/forms/ServiceForm'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, ArrowRight } from 'lucide-react'

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

  // Zákazník (bez role poskytovatele) – výzva ke stání se živnostníkem
  if (!isProvider) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
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
            <h1 className="mb-2 text-2xl font-black text-slate-900">Staňte se ověřeným živnostníkem</h1>
            <p className="mx-auto mb-6 max-w-md text-slate-500">
              Abyste mohli nabízet služby, musíte být ověřený živnostník. Stačí zadat IČO – ověříme ho
              v registru ARES a získáte odznak důvěryhodnosti. Zákazníci tak vědí, že jste skutečný profesionál.
            </p>
            <Link href="/registrace/zivnostnik" className="btn-primary inline-flex">
              Stát se živnostníkem <ArrowRight className="h-4 w-4" />
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
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        {/* Zpět */}
        <Link
          href="/marketplace"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na Marketplace
        </Link>

        {/* Hlavička */}
        <div className="mb-8">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Nová nabídka
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Čím můžete pomoci?
          </h1>
          <p className="mt-2 text-slate-500">
            Vyplňte formulář a vaše nabídka se okamžitě zobrazí zákazníkům.
            Přidání je zdarma.
          </p>
        </div>

        {/* Formulář */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ServiceForm mode="create" />
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