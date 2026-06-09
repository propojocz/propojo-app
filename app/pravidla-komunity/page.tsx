// app/pravidla-komunity/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Pravidla komunity | Propojo',
  description: 'Kodex chování pro všechny uživatele platformy Propojo.',
}

export default function PravidlaKomunityPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět domů
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          {/* Header */}
          <div className="mb-10 border-b border-slate-200 pb-8 text-center">
            <div className="mb-4 text-5xl">🤝</div>
            <h1 className="mb-2 text-3xl font-black text-slate-900">Pravidla komunity</h1>
            <p className="text-slate-500">Kodex chování pro všechny uživatele platformy Propojo</p>
          </div>

          <p className="mb-8 text-slate-600">
            Propojo je komunitní platforma, která funguje díky vzájemné důvěře a respektu. Tato pravidla platí pro všechny – zákazníky i podnikatele. Jejich dodržování zajišťuje bezpečné a příjemné prostředí pro všechny.
          </p>

          <Section num={1} title="Základní principy">
            <GreenBox title="✅ Co očekáváme od všech">
              <ul className="space-y-2 text-sm">
                <li><strong>Respekt</strong> – chovejte se k ostatním tak, jak chcete, aby se chovali k vám</li>
                <li><strong>Čestnost</strong> – uvádějte pravdivé informace, nemanipulujte</li>
                <li><strong>Spolehlivost</strong> – dodržujte dohodnuté termíny a závazky</li>
                <li><strong>Komunikace</strong> – odpovídejte včas, informujte o změnách</li>
                <li><strong>Férovost</strong> – oceňujte práci druhých, plaťte za služby</li>
              </ul>
            </GreenBox>
          </Section>

          <Section num={2} title="Pravidla pro zákazníky">
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Před objednáním</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Přečtěte si profil podnikatele a jeho recenze</li>
              <li>Ujistěte se, že rozumíte ceně a rozsahu služby</li>
              <li>Vybírejte termín, který opravdu můžete dodržet</li>
            </ul>
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Při poskytování služby</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Buďte k dispozici v dohodnutém čase a místě</li>
              <li>Poskytněte podnikateli potřebnou součinnost</li>
              <li>Komunikujte jasně, pokud máte speciální požadavky</li>
            </ul>
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Po dokončení</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Potvrďte dokončení služby v aplikaci</li>
              <li>Napište férové a pravdivé hodnocení</li>
              <li>Pokud něco nesedí, řešte to přes platformu</li>
            </ul>
            <RedBox title="🚫 Zákazníci nesmí">
              <ul className="space-y-1.5 text-sm">
                <li>Kontaktovat podnikatele mimo platformu za účelem obejití poplatků</li>
                <li>Nedostavit se bez včasného zrušení</li>
                <li>Psát nepravdivé nebo záměrně poškozující recenze</li>
                <li>Vyhrožovat negativním hodnocením za účelem získání slevy</li>
                <li>Obtěžovat nebo urážet podnikatele</li>
              </ul>
            </RedBox>
          </Section>

          <Section num={3} title="Pravidla pro podnikatele">
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Profil a prezentace</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Uvádějte pravdivé informace o svých službách a kvalifikaci</li>
              <li>Používejte vlastní fotografie (ne stock fotky)</li>
              <li>Aktualizujte kalendář dostupnosti</li>
              <li>Stanovujte realistické ceny odpovídající kvalitě</li>
            </ul>
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Poskytování služeb</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Dostavte se včas na dohodnuté místo</li>
              <li>Provádějte práci v dohodnuté kvalitě</li>
              <li>Informujte zákazníka o průběhu, pokud je to relevantní</li>
              <li>Respektujte soukromí a majetek zákazníka</li>
            </ul>
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Komunikace</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Reagujte na objednávky do 24 hodin</li>
              <li>Pokud musíte zrušit, informujte co nejdříve</li>
              <li>Odpovídejte na zprávy zákazníků slušně a včas</li>
            </ul>
            <RedBox title="🚫 Podnikatelé nesmí">
              <ul className="space-y-1.5 text-sm">
                <li><strong>Obcházet platformu</strong> – nabízet zákazníkům přímý kontakt nebo platbu mimo platformu</li>
                <li>Požadovat hotovostní platbu nebo spropitné</li>
                <li>Diskriminovat zákazníky na základě pohlaví, věku, národnosti atd.</li>
                <li>Uvádět nepravdivé informace v profilu nebo certifikacích</li>
                <li>Manipulovat s hodnocením (falešné recenze, kupování recenzí)</li>
                <li>Agresivně přesvědčovat zákazníky k dalším službám</li>
              </ul>
            </RedBox>
          </Section>

          <Section num={4} title="Hodnocení a recenze">
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Co patří do recenze</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Popis vaší zkušenosti s konkrétní službou</li>
              <li>Konstruktivní zpětná vazba</li>
              <li>Informace užitečné pro ostatní zákazníky</li>
            </ul>
            <h3 className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-slate-500">Co do recenze nepatří</h3>
            <ul className="mb-4 space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
              <li>Osobní útoky a urážky</li>
              <li>Nepravdivé informace</li>
              <li>Kontaktní údaje nebo odkazy</li>
              <li>Vulgarismy a nenávistný obsah</li>
            </ul>
          </Section>

          <Section num={5} title="Zakázaný obsah a chování">
            <RedBox title="🚫 Přísně zakázáno">
              <ul className="space-y-1.5 text-sm">
                <li>Nabízení nebo poptávání nelegálních služeb</li>
                <li>Diskriminace, nenávistné projevy, rasismus</li>
                <li>Sexuální obtěžování nebo nevhodné návrhy</li>
                <li>Vyhrožování nebo zastrašování</li>
                <li>Podvody, krádeže, úmyslné poškozování</li>
                <li>Spam, phishing, škodlivé odkazy</li>
              </ul>
            </RedBox>
          </Section>

          <Section num={6} title="Důsledky porušení">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Porušení</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Důsledek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Pozdní reakce na objednávku', 'Varování, snížení viditelnosti', 'yellow'],
                    ['Nepravdivé informace v profilu', 'Výzva k opravě, dočasné skrytí', 'yellow'],
                    ['Nevhodná komunikace', 'Varování, při opakování pozastavení', 'orange'],
                    ['Opakované rušení objednávek', 'Snížení hodnocení, dočasné pozastavení', 'orange'],
                    ['Obcházení platformy (bypass)', 'Okamžité zrušení účtu + smluvní pokuta', 'red'],
                    ['Falešné recenze / manipulace', 'Okamžité zrušení účtu', 'red'],
                    ['Podvod, krádež, nelegální činnost', 'Okamžité zrušení účtu + právní kroky', 'red'],
                    ['Diskriminace, obtěžování', 'Okamžité zrušení účtu', 'red'],
                  ].map(([violation, consequence, severity]) => (
                    <tr key={violation} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{violation}</td>
                      <td className={`px-4 py-3 font-medium ${severity === 'red' ? 'text-red-600' : severity === 'orange' ? 'text-orange-600' : 'text-yellow-600'}`}>
                        {consequence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section num={7} title="Nahlášení problému">
            <ol className="space-y-2 pl-5 text-sm text-slate-600 list-decimal">
              <li><strong>V aplikaci:</strong> U profilu nebo objednávky klikněte na „Nahlásit"</li>
              <li><strong>Emailem:</strong> Napište na <a href="mailto:podpora@propojo.cz" className="text-indigo-600 hover:underline">podpora@propojo.cz</a> s popisem situace</li>
              <li><strong>Urgentní případy:</strong> Kontaktujte přímo Policii ČR (158)</li>
            </ol>
            <p className="mt-4 text-sm text-slate-500">Všechna nahlášení prošetříme do 48 hodin. Vaše identita zůstane důvěrná.</p>
          </Section>

          {/* Contact box */}
          <div className="mt-10 rounded-2xl bg-slate-900 p-6 text-center text-white">
            <h3 className="mb-2 font-bold">Máte otázky?</h3>
            <p className="text-sm text-slate-400">Kontaktujte nás na <a href="mailto:podpora@propojo.cz" className="text-indigo-400 hover:underline">podpora@propojo.cz</a></p>
          </div>
        </div>
      </div>
    </main>
  )
}

function Section({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-3 text-xl font-black text-slate-900">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{num}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function GreenBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="mb-3 font-bold text-emerald-800">{title}</p>
      <div className="text-emerald-700">{children}</div>
    </div>
  )
}

function RedBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <p className="mb-3 font-bold text-red-800">{title}</p>
      <div className="text-red-700">{children}</div>
    </div>
  )
}
