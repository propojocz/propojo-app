export const revalidate = 0

// app/jak-to-funguje/page.tsx
import Link from 'next/link'
import { ArrowRight, Search, CalendarCheck, ShieldCheck, Star, Ban, BadgeCheck, Wallet, Megaphone } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jak to funguje',
  description: 'Jak funguje Propojo – ověření řemeslníci, rezervace termínu online a záloha jako jistota. Pro zákazníky i živnostníky.',
  openGraph: {
    title: 'Jak to funguje | Propojo',
    description: 'Ověření řemeslníci, rezervace online a záloha jako jistota.',
    url: 'https://propojo.cz/jak-to-funguje',
    type: 'website',
  },
  alternates: { canonical: 'https://propojo.cz/jak-to-funguje' },
}

export default function JakToFungujePage() {
  return (
    <main className="min-h-screen bg-white">

      {/* Hero */}
      <section className="bg-gradient-to-b from-emerald-50 to-white px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">Jak to funguje</p>
          <h1 className="mb-4 text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Řemeslníka si zarezervujete<br /><span className="text-emerald-600">jednoduše jako hotel</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-slate-600">
            Ověření živnostníci z vašeho okolí. Vyberete termín, zaplatíte zálohu — a máte jistotu, že dorazí.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/marketplace" className="btn-primary justify-center">
              Najít řemeslníka <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/registrace/zivnostnik" className="btn-secondary justify-center">
              Jsem řemeslník
            </Link>
          </div>
        </div>
      </section>

      {/* Pro zákazníky */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700">👤 Pro zákazníky</span>
            <h2 className="mt-4 text-3xl font-black text-slate-900">Od hledání po hotovo, bez telefonování</h2>
            <p className="mt-2 text-slate-500">Čtyři kroky — a víte, kdo k vám přijde a kdy.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: Search, title: 'Najdete', desc: 'Vyhledáte podle služby a města. Porovnáte ceny, recenze a volné termíny ověřených živnostníků.' },
              { Icon: CalendarCheck, title: 'Zarezervujete', desc: 'Kliknete na volný termín a rezervujete online. Žádné čekání na nabídky.' },
              { Icon: ShieldCheck, title: 'Zaplatíte zálohu', desc: 'Zálohu bezpečně držíme my. Počítá se do konečné ceny — a když řemeslník nedorazí, vrátí se vám celá.' },
              { Icon: Star, title: 'Ohodnotíte', desc: 'Po dokončení práce řemeslníka ohodnotíte a pomůžete ostatním vybírat.' },
            ].map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
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
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700">🔧 Pro řemeslníky</span>
            <h2 className="mt-4 text-3xl font-black text-slate-900">Zakázky bez provizí</h2>
            <p className="mt-2 text-slate-500">Platíte jen předplatné — z vaší práce si nebereme ani korunu.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: BadgeCheck, title: 'Ověříte IČO', desc: 'Registrace je jednoduchá. Vaše IČO ověříme přes ARES — trvá to pár sekund.' },
              { Icon: Megaphone, title: 'Přidáte nabídku', desc: 'Popíšete službu, nastavíte cenu a přidáte fotky své práce. Online za pár minut.' },
              { Icon: CalendarCheck, title: 'Plníte kalendář', desc: 'Zákazníci si rezervují vaše volné termíny. Rezervaci potvrdíte a víte, na čem jste.' },
              { Icon: Wallet, title: 'Vyděláváte', desc: 'Dokončíte zakázku, sbíráte recenze. Více hodnocení = více zákazníků.' },
            ].map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
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
              Vyzkoušet zdarma <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-slate-400">První měsíc zdarma · pak 299 Kč/měsíc · zrušíte kdykoli</p>
          </div>
        </div>
      </section>

      {/* Proč Propojo */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-black text-slate-900">Proč Propojo?</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Záloha jako jistota</h3>
              <p className="text-sm leading-relaxed text-slate-500">Zálohu držíme my, ne řemeslník. Když nedorazí, vrátí se vám celá. Když dorazí, počítá se do ceny.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                <BadgeCheck className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Ověření živnostníci</h3>
              <p className="text-sm leading-relaxed text-slate-500">Každý živnostník je ověřen přes registr ARES. Žádné falešné profily.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                <Ban className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Bez provizí</h3>
              <p className="text-sm leading-relaxed text-slate-500">Řemeslník platí jen předplatné. Z ceny vaší zakázky si nebereme procenta.</p>
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
              { q: 'Kolik mě to jako zákazníka stojí?', a: 'Platíte cenu řemeslníka — žádné přirážky ani poplatky navíc. Propojo vydělává na předplatném řemeslníků, ne na vás.' },
              { q: 'Jak funguje záloha?', a: 'Při rezervaci zaplatíte zálohu, kterou bezpečně držíme my. Po dokončení práce se započítá do konečné ceny. Když řemeslník nedorazí, vrátí se vám celá.' },
              { q: 'Jak ověřujete řemeslníky?', a: 'Každý řemeslník musí při registraci zadat IČO, které automaticky ověřujeme v registru ARES. Na platformě jsou tak jen skuteční živnostníci.' },
              { q: 'Mohu být zákazník i řemeslník zároveň?', a: 'Ano. Řemeslník je automaticky i zákazníkem — se stejným účtem si můžete sami objednávat služby od ostatních.' },
              { q: 'Co dělat, když jsem nespokojený?', a: 'Využijte recenzní systém a řemeslníka ohodnoťte. Při vážném problému nás kontaktujte na admin@propojo.cz.' },
            ].map(faq => (
              <div key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-bold text-slate-900">{faq.q}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{faq.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/faq" className="text-sm font-semibold text-emerald-600 hover:underline">
              Zobrazit všechny otázky →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-emerald-500 to-emerald-600 py-20 px-4 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-black">Připraveni začít?</h2>
          <p className="mb-8 text-emerald-50">Najděte řemeslníka ve svém okolí, nebo začněte nabízet své služby.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/marketplace" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 font-bold text-emerald-700 transition hover:bg-emerald-50">
              Hledat řemeslníka <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/registrace/zivnostnik" className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/70 px-6 py-3.5 font-bold text-white transition hover:bg-white/10">
              Nabídnout služby
            </Link>
          </div>
        </div>
      </section>

    </main>
  )
}