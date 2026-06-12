// app/pridat-sluzbu/page.tsx
// Stránka pro přidání nové služby – pouze přihlášení uživatelé

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceForm from '@/components/forms/ServiceForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Přidat novou službu | ŽivnoTrh',
  description: 'Nabídněte své řemeslné či profesionální služby tisícům zákazníků.',
}

export default async function PridatSluzbuPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Nepřihlášeného uživatele přesměrujeme na login
  if (!user) {
    redirect('/prihlasit?next=/pridat-sluzbu')
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
