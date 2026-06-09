// app/podminky/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Obchodní podmínky | Propojo',
  description: 'Obchodní podmínky platformy Propojo pro zákazníky a živnostníky.',
}

export default function PodminkyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět domů
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <div className="mb-8 border-b border-slate-200 pb-6">
            <h1 className="text-3xl font-black text-slate-900">Obchodní podmínky</h1>
            <p className="mt-2 text-slate-500">Platné od 1. 1. 2025 · Propojo</p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-slate-600">
            <Section title="1. Úvodní ustanovení">
              <p>Tyto obchodní podmínky (dále jen „Podmínky") upravují práva a povinnosti mezi provozovatelem platformy Propojo (dále jen „Provozovatel") a uživateli platformy (dále jen „Uživatelé").</p>
              <p>Provozovatelem platformy Propojo dostupné na adrese propojo.cz je fyzická nebo právnická osoba uvedená v kontaktních údajích. Používáním platformy vyjadřujete souhlas s těmito Podmínkami.</p>
            </Section>

            <Section title="2. Registrace a uživatelský účet">
              <p>Registrací na platformě se zavazujete uvádět pravdivé, přesné a aktuální informace. Živnostníci jsou povinni uvést platné IČO, které bude ověřeno prostřednictvím registru ARES.</p>
              <p>Za bezpečnost přihlašovacích údajů odpovídá každý Uživatel samostatně. V případě podezření na neoprávněný přístup k účtu jste povinni nás neprodleně informovat na <a href="mailto:podpora@propojo.cz" className="text-indigo-600 hover:underline">podpora@propojo.cz</a>.</p>
              <p>Provozovatel si vyhrazuje právo zrušit nebo pozastavit účet, který porušuje tyto Podmínky nebo Pravidla komunity.</p>
            </Section>

            <Section title="3. Služby platformy">
              <p>Propojo slouží jako zprostředkovatel kontaktu mezi zákazníky a živnostníky. Provozovatel není stranou smluvního vztahu mezi zákazníkem a živnostníkem a nenese odpovědnost za kvalitu, bezpečnost ani výsledek poskytnutých služeb.</p>
              <p>Živnostníci odpovídají za správnost a aktuálnost informací ve svých nabídkách, za dodržení platných právních předpisů při poskytování služeb a za komunikaci se zákazníky.</p>
            </Section>

            <Section title="4. Platby a poplatky">
              <p>Registrace a základní používání platformy je zdarma. Platby za poskytnuté služby probíhají přímo mezi zákazníkem a živnostníkem mimo platformu, pokud není uvedeno jinak.</p>
              <p>Provozovatel si vyhrazuje právo zavést poplatky za prémiové funkce v budoucnu. O jakýchkoli změnách budou Uživatelé informováni s předstihem nejméně 30 dní.</p>
            </Section>

            <Section title="5. Hodnocení a recenze">
              <p>Zákazníci mohou hodnotit živnostníky po dokončení objednávky. Hodnocení musí vycházet ze skutečné zkušenosti a nesmí obsahovat nepravdivé informace, osobní útoky, vulgarismy ani obsah porušující práva třetích osob.</p>
              <p>Provozovatel si vyhrazuje právo odstranit hodnocení, která porušují tyto Podmínky nebo Pravidla komunity.</p>
            </Section>

            <Section title="6. Odpovědnost a záruky">
              <p>Platforma je poskytována „tak jak je" bez záruk jakéhokoli druhu. Provozovatel neodpovídá za přímé ani nepřímé škody vzniklé v důsledku používání platformy, včetně škod vzniklých při poskytování služeb živnostníky.</p>
              <p>Celková odpovědnost Provozovatele vůči jednotlivému Uživateli je omezena na částku uhrazenou Uživatelem za prémiové služby v posledních 12 měsících.</p>
            </Section>

            <Section title="7. Duševní vlastnictví">
              <p>Veškerý obsah platformy včetně loga, designu a softwaru je chráněn autorským zákonem a patří Provozovateli nebo jeho partnerům. Obsah vložený Uživateli zůstává jejich vlastnictvím, avšak udělují Provozovateli nevýhradní licenci k jeho zobrazení na platformě.</p>
            </Section>

            <Section title="8. Změny podmínek">
              <p>Provozovatel si vyhrazuje právo tyto Podmínky kdykoli změnit. O podstatných změnách budete informováni emailem nebo oznámením na platformě. Pokračováním v používání platformy po nabytí účinnosti změn vyjadřujete souhlas s novými Podmínkami.</p>
            </Section>

            <Section title="9. Rozhodné právo a spory">
              <p>Tyto Podmínky se řídí právním řádem České republiky. Případné spory budou řešeny přednostně smírnou cestou. Nedojde-li k dohodě, jsou příslušné soudy České republiky.</p>
            </Section>

            <Section title="10. Kontakt">
              <p>V případě dotazů k těmto Podmínkám nás kontaktujte na <a href="mailto:podpora@propojo.cz" className="text-indigo-600 hover:underline">podpora@propojo.cz</a>.</p>
            </Section>
          </div>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-slate-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
