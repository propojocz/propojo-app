// app/pridat-sluzbu/page.tsx
// Stránka pro přidání nové služby – pouze ověření poskytovatelé (s IČO)
//
// Texty mluví o NABÍDCE, ne o „kartě". „Karta" je náš vnitřní pojem — poskytovatel
// nepřemýšlí „chci vytvořit kartu", ale „chci nabídnout svoje služby".

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceForm from '@/components/forms/ServiceForm'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, ArrowRight, EyeOff, LayoutGrid, Sparkles, ChevronRight } from 'lucide-react'

export const metadata = {
  title: 'Přidat novou službu | Propojo',
  description: 'Nabídněte své řemeslné či profesionální služby tisícům zákazníků.',
}

interface Props {
  searchParams: { novy?: string }
}

export default async function PridatSluzbuPage({ searchParams }: Props) {
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

  // Existující karty poskytovatele — podle nich rozhodneme, jestli se ho
  // nejdřív zeptat "k existující, nebo nová?". Nemá-li žádnou, ptát se nemá
  // smysl, rovnou dostane formulář jako dřív. ?novy=1 volbu přeskočí (odkaz
  // "Vytvořit novou kartu" z volicí obrazovky).
  let existingCards: { id: string; title: string; category: string | null; city: string | null }[] = []
  if (isProvider) {
    const { data: cards } = await supabase
      .from('services')
      .select('id, title, category, city')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false }) as { data: typeof existingCards | null }
    existingCards = cards ?? []
  }
  const showChooser = isProvider && existingCards.length > 0 && searchParams.novy !== '1'

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

  // ── VOLBA: k existující kartě, nebo nová? ──
  // Jen když poskytovatel už nějakou kartu má — jinak by se ptalo zbytečně.
  if (showChooser) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <Link
            href="/dashboard"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na dashboard
          </Link>

          <div className="mb-8">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-600">
              Přidat nabídku
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Kam ji přidat?</h1>
            <p className="mt-2 max-w-xl leading-relaxed text-slate-500">
              Novou službu nebo výrobek můžete přidat do ceníku některé z vašich karet, nebo pro ně
              založit úplně novou kartu.
            </p>
          </div>

          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Přidat k existující kartě
            </p>
            <div className="space-y-1">
              {existingCards.map((card) => (
                <Link
                  key={card.id}
                  href={`/dashboard/nabidky/${card.id}/upravit`}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-emerald-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <LayoutGrid className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{card.title}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {[card.category, card.city].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>
          </div>

          <Link
            href="/pridat-sluzbu?novy=1"
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-emerald-800">Vytvořit novou kartu</span>
              <span className="block text-xs text-emerald-700/70">
                Pro jiný obor nebo úplně samostatnou nabídku.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-emerald-400" />
          </Link>
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
            Vytvořte nabídku
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Ukažte okolí, co umíte
          </h1>
          <p className="mt-2 max-w-xl leading-relaxed text-slate-500">
            {hasActiveSub
              ? 'Stačí nám říct, co nabízíte. Ceník, termíny a zbytek nastavíte v dalších krocích.'
              : 'Stačí nám říct, co nabízíte. Ceník i termíny nastavíte v dalších krocích — uložit si nabídku můžete i bez předplatného.'}
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