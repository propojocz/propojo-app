'use client'
// app/onboarding/page.tsx – průvodce pro nové podnikatele
import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, ArrowRight } from 'lucide-react'

const STEPS = [
  {
    title: 'Základní informace',
    subtitle: 'IČO, kontakty, kategorie služeb',
    time: '~5 min',
    content: {
      heading: 'Co vyplníte:',
      items: [
        '<strong>IČO</strong> – automaticky ověříme přes ARES',
        '<strong>Kontaktní údaje</strong> – email, telefon (vidí jen potvrzení zákazníci)',
        '<strong>Kategorie služeb</strong> – vyberte 1–3 hlavní obory',
        '<strong>Oblast působení</strong> – město, okres nebo kraj',
      ],
      tip: 'Čím přesněji vyberete lokalitu, tím relevantnější zákazníky dostanete.',
      cta: 'Vyplnit údaje',
      href: '/dashboard/profil',
    },
  },
  {
    title: 'Profil a fotografie',
    subtitle: 'Popis, portfolio, certifikáty',
    time: '~10 min',
    content: {
      heading: 'Váš profil je vaše vizitka:',
      items: [
        '<strong>Profilová fotka</strong> – vaše tvář budí důvěru',
        '<strong>Popis služeb</strong> – co nabízíte, jaké máte zkušenosti',
        '<strong>Portfolio</strong> – 5–10 fotek vaší práce (před/po)',
        '<strong>Certifikáty</strong> – odborné kurzy, oprávnění',
      ],
      tip: 'Profily s fotkami mají 3× vyšší úspěšnost. Používejte vlastní fotky, ne stock.',
      cta: 'Upravit profil',
      href: '/dashboard/profil',
    },
  },
  {
    title: 'Ceník služeb',
    subtitle: 'Ceny, balíčky, volitelné příplatky',
    time: '~5 min',
    content: {
      heading: 'Nastavte své ceny:',
      items: [
        '<strong>Pevné ceny</strong> – např. „Střih pánský: 350 Kč"',
        '<strong>Cenové rozpětí</strong> – např. „Malování: 50–80 Kč/m²"',
        '<strong>Balíčky</strong> – kombinace služeb se slevou',
        '<strong>Příplatky</strong> – víkend, svátky, express',
      ],
      tip: 'Zákazníci chtějí vidět cenu předem. Čím jasnější ceník, tím víc objednávek.',
      cta: 'Nastavit ceny',
      href: '/pridat-sluzbu',
    },
  },
  {
    title: 'Kalendář dostupnosti',
    subtitle: 'Pracovní hodiny, volné termíny',
    time: '~3 min',
    content: {
      heading: 'Nastavte kdy pracujete:',
      items: [
        '<strong>Pracovní dny</strong> – které dny jste k dispozici',
        '<strong>Hodiny</strong> – od–do pro každý den',
        '<strong>Blokace</strong> – dny kdy nepracujete (dovolená, atd.)',
        '<strong>Délka termínu</strong> – minimální čas na službu',
      ],
      tip: 'Aktuální kalendář = víc objednávek. Zákazníci objednávají jen z volných termínů.',
      cta: 'Otevřít kalendář',
      href: '/dashboard',
    },
  },
  {
    title: 'Zveřejnit první nabídku',
    subtitle: 'Přidat službu do Marketplace',
    time: '~2 min',
    content: {
      heading: 'Poslední krok:',
      items: [
        '<strong>Vyplňte název a popis</strong> – konkrétně a srozumitelně',
        '<strong>Nastavte cenu</strong> – za hodinu, den nebo projekt',
        '<strong>Přidejte fotku</strong> – reálná fotka z vaší práce',
        '<strong>Zveřejněte</strong> – a zákazníci vás okamžitě uvidí',
      ],
      tip: 'První nabídka do 2 minut. Kdykoliv ji můžete upravit nebo přidat další.',
      cta: 'Přidat nabídku',
      href: '/pridat-sluzbu',
    },
  },
]

export default function OnboardingPage() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [openStep, setOpenStep] = useState<number>(0)

  const toggleComplete = (idx: number) => {
    setCompletedSteps(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }

  const progress = Math.round((completedSteps.length / STEPS.length) * 100)
  const allDone = completedSteps.length === STEPS.length

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-4 py-14 text-center text-white">
        <div className="mb-2 text-4xl">🚀</div>
        <h1 className="mb-2 text-3xl font-black">Vítejte na Propojo!</h1>
        <p className="text-indigo-200">Průvodce nastavením vašeho profilu</p>
      </div>

      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        {/* Progress */}
        <div className="mb-8 flex items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke="#4f46e5" strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute text-lg font-black text-slate-900">{progress}%</span>
          </div>
          <div>
            <p className="font-bold text-slate-900">Váš profil</p>
            <p className="text-sm text-slate-500">
              {allDone ? '🎉 Profil je kompletní!' : `${completedSteps.length} z ${STEPS.length} kroků dokončeno`}
            </p>
          </div>
        </div>

        {/* Kroky */}
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const isCompleted = completedSteps.includes(idx)
            const isOpen = openStep === idx

            return (
              <div
                key={idx}
                className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all ${
                  isCompleted ? 'border-indigo-300 bg-indigo-50/30' : isOpen ? 'border-indigo-400 shadow-md' : 'border-slate-200'
                }`}
              >
                <button
                  onClick={() => setOpenStep(isOpen ? -1 : idx)}
                  className="flex w-full items-center gap-4 p-5 text-left"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${
                    isCompleted ? 'bg-indigo-600 text-white' : isOpen ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-slate-900">{step.title}</p>
                    <p className="text-xs text-slate-500">{step.subtitle}</p>
                  </div>
                  <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 sm:block">{step.time}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-5 pb-5">
                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <p className="mb-3 text-sm font-semibold text-slate-700">{step.content.heading}</p>
                      <ul className="space-y-2">
                        {step.content.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                            <span dangerouslySetInnerHTML={{ __html: item }} />
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                        <span>💡</span>
                        {step.content.tip}
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <Link href={step.content.href} className="btn-primary flex-1 justify-center">
                        {step.content.cta} <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => toggleComplete(idx)}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                          isCompleted
                            ? 'border-indigo-200 bg-indigo-100 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'
                        }`}
                      >
                        {isCompleted ? '✓ Hotovo' : 'Označit jako hotové'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Success */}
        {allDone && (
          <div className="mt-8 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 p-8 text-center text-white shadow-lg">
            <div className="mb-3 text-4xl">🎉</div>
            <h3 className="mb-2 text-xl font-black">Profil dokončen!</h3>
            <p className="mb-5 text-indigo-200 text-sm">Váš profil je aktivní a zákazníci vás mohou najít.</p>
            <Link href="/marketplace" className="btn-hero-primary inline-flex">
              Přejít na Marketplace
            </Link>
          </div>
        )}

        {/* Help */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-sm font-semibold text-slate-700">Potřebujete pomoct?</p>
          <p className="mt-1 text-xs text-slate-500">
            Napište nám na{' '}
            <a href="mailto:podpora@propojo.cz" className="text-indigo-600 hover:underline">
              podpora@propojo.cz
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
