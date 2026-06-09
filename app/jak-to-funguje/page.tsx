export const revalidate = 0

// app/jak-to-funguje/page.tsx
import Link from 'next/link'
import { ArrowRight, Search, ClipboardList, Star, ShieldCheck, Zap, Ban, MessageSquare, CreditCard } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jak to funguje',
  description: 'Zjistěte jak Propojo funguje – pro zákazníky i živnostníky. Jednoduché, bez přirážek, přímý kontakt.',
  openGraph: {
    title: 'Jak to funguje | Propojo',
    description: 'Zjistěte jak Propojo funguje – pro zákazníky i živnostníky.',
    url: 'https://propojo.cz/jak-to-funguje',
    type: 'website',
  },
  alternates: { canonical: 'https://propojo.cz/jak-to-funguje' },
}

const COLOR_MAP: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-600',
  violet: 'bg-violet-100 text-violet-600',
  blue: 'bg-blue-100 text-blue-600',
  amber: 'bg-amber-100 text-amber-600',
  emerald: 'bg-emerald-100 text-emerald-600',
}

export default function JakToFunguJePage() {
  return (
    <main className="min-h-screen bg-white">

      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-950 to-slate-900 px-4 py-20 text-center text-white">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-300">Jak to funguje</p>
          <h1 className="mb-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            Propojo spojuje lidi<br /><span className="text-indigo-300">s řemeslníky</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-indigo-200">
            Bez zprostředkovatelů, bez skrytých poplatků. Přímý kontakt mezi zákazníkem a živnostníkem.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/marketplace" className="btn-hero-primary">
              Najít živnostníka <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/registrace/zivnostnik" className="btn-hero-secondary">
              Jsem živnostník
            </Link>
          </div>
        </div>
      </section>

      {/* Pro zákazníky */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-semibold text-indigo-700">👤 Pro zákazníky</span>
            <h2 className="mt-4 text-3xl font-black text-slate-900">Najděte živnostníka za 5 minut</h2>
            <p className="mt-2 text-slate-500">Jednoduchý proces od hledání po dokončení zakázky.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: Search, title: 'Najděte živnostníka', desc: 'Vyhledejte podle kategorie nebo lokace. Porovnejte profily, hodnocení a ceny.', color: 'indigo' },
              { Icon: MessageSquare, title: 'Odešlete poptávku', desc: 'Napište zprávu s popisem práce. Živnostník odpoví do 24 hodin.', color: 'violet' },
              { Icon: ClipboardList, title: 'Dohodněte se', desc: 'Živnostník přijme poptávku, dohodněte termín a podmínky přímo spolu.', color: 'blue' },
              { Icon: Star, title: 'Ohodnoťte', desc: 'Po dokončení ohodnoťte živnostníka a pomozte ostatním zákazníkům.', color: 'amber' },
            ].map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${COLOR_MAP[step.color]}`}>
                    <step.Icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-black text-slate-200">{i + 1}</span>
                </div>
                <h3 className="mb-2 font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/marketplace" className="btn-primary">
              Prohlédnout nabídky <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pro živnostníky */}
      <section className="bg-slate-50 py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700">🔧 Pro živnostníky</span>
            <h2 className="mt-4 text-3xl font-black text-slate-900">Získejte nové zákazníky zdarma</h2>
            <p className="mt-2 text-slate-500">Registrace trvá 2 minuty, první nabídka dalších 5.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: ShieldCheck, title: 'Ověřte IČO', desc: 'Registrace je jednoduchá. Ověříme vaše IČO přes ARES – trvá to 30 sekund.', color: 'indigo' },
              { Icon: Zap, title: 'Přidejte nabídku', desc: 'Popište vaši službu, nastavte cenu a přidejte fotky. Online za 2 minuty.', color: 'violet' },
              { Icon: MessageSquare, title: 'Přijímejte poptávky', desc: 'Zákazníci vás kontaktují přímo. Přijměte nebo odmítněte každou poptávku.', color: 'blue' },
              { Icon: CreditCard, title: 'Vydělávejte', desc: 'Dokončete zakázku a budujte si hodnocení. Více recenzí = více zákazníků.', color: 'emerald' },
            ].map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${COLOR_MAP[step.color]}`}>
                    <step.Icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-black text-slate-200">{i + 1}</span>
                </div>
                <h3 className="mb-2 font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/registrace/zivnostnik" className="btn-primary">
              Začít zdarma <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Proč Propojo */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-black text-slate-900">Proč Propojo?</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                <Ban className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Žádné přirážky</h3>
              <p className="text-sm leading-relaxed text-slate-500">Platíte přímo živnostníkovi. My si nebereme procenta z obchodu.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Ověření živnostníci</h3>
              <p className="text-sm leading-relaxed text-slate-500">Každý živnostník je ověřen přes registr ARES. Žádné falešné profily.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                <Star className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Recenzní systém</h3>
              <p className="text-sm leading-relaxed text-slate-500">Hodnocení od skutečných zákazníků. Vybírejte podle zkušeností ostatních.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-20 px-4">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-10 text-center text-3xl font-black text-slate-900">Časté otázky</h2>
          <div className="space-y-3">
            {[
              { q: 'Je Propojo zdarma?', a: 'Ano, registrace i přidání nabídek je zdarma. Zákazníci neplatí žádné poplatky navíc.' },
              { q: 'Jak probíhá platba?', a: 'Platba probíhá přímo mezi zákazníkem a živnostníkem. Propojo je pouze zprostředkovatel kontaktu.' },
              { q: 'Jak ověřujete živnostníky?', a: 'Každý živnostník musí při registraci zadat IČO, které automaticky ověřujeme v registru ARES.' },
              { q: 'Mohu být zákazník i živnostník?', a: 'Zatím ne, ale pracujeme na tom. Pro každou roli je potřeba samostatný účet.' },
              { q: 'Co dělat když jsem nespokojený?', a: 'Využijte recenzní systém a ohodnoťte živnostníka. Při vážném problému nás kontaktujte na jankrizek@propojo.cz.' },
            ].map(faq => (
              <div key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-bold text-slate-900">{faq.q}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{faq.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/faq" className="text-sm font-semibold text-indigo-600 hover:underline">
              Zobrazit všechny otázky →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-indigo-600 to-indigo-700 py-20 px-4 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-black">Připraveni začít?</h2>
          <p className="mb-8 text-indigo-200">Registrace je zdarma a trvá méně než 2 minuty.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/marketplace" className="btn-hero-primary">
              Hledat živnostníka <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/registrace/zivnostnik" className="btn-hero-secondary">
              Nabídnout služby
            </Link>
          </div>
        </div>
      </section>

    </main>
  )
}