// app/storno/page.tsx
// Zrušení rezervace a vrácení peněz podle modelu v2 (vrstva 4, 15. 10. 2026).
// Nahrazuje starou tabulku storno poplatků (100/50/0 %), kterou model v2 ani stanovisko AK nepovolují.
// Pravidla odpovídají lib/booking (rules.ts – customerCancellationOutcome, katalog AUTOREF; texts.ts).
// Závazné znění je ve VOP 4.1 – při změně VOP upravit i tuto stránku.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BOOKING_POLICY } from '@/lib/booking/policy'

export const metadata = {
  title: 'Zrušení rezervace a vrácení peněz | Propojo',
}

export default function StornoPage() {
  const p = BOOKING_POLICY
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět domů
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <div className="mb-8 border-b border-slate-200 pb-6">
            <h1 className="mb-2 text-3xl font-black text-slate-900">Zrušení rezervace a vrácení peněz</h1>
            <p className="text-slate-500">Přehled pravidel pro zákazníky i poskytovatele. Závazné znění najdete v <Link href="/podminky" className="text-emerald-700 underline">Obchodních podmínkách</Link>.</p>
          </div>

          <InfoBox>
            <strong>Jak platba funguje:</strong> přes Propojo platíte jen Rezervační poplatek (u služby a výrobku na míru) nebo
            Cenu výjezdu (u výjezdu a nacenění). Platba jde přímo na účet poskytovatele u Stripe – Propojo peníze nedrží.
            Proto se peníze vždy vrací z účtu poskytovatele.
          </InfoBox>

          <H2>1. Před potvrzením rezervace</H2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Po zaplacení se částka na kartě jen <strong>zablokuje</strong>. Strhne se až ve chvíli, kdy poskytovatel rezervaci potvrdí.</li>
            <li>Poskytovatel má na potvrzení {p.confirmationWindowHours} hodin od platby, nejpozději však {Math.round(p.confirmBeforeStartMinutes / 60)} hodiny před začátkem termínu. Když nepotvrdí včas nebo rezervaci odmítne, blokace se uvolní a nic nezaplatíte.</li>
            <li>Než poskytovatel rezervaci potvrdí, můžete ji kdykoli <strong>zrušit bez poplatku</strong> – blokace se uvolní.</li>
            <li>Termín, který nabídl sám poskytovatel (vypsaný volný termín, jeho návrh), se potvrdí hned po zaplacení.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">Uvolněnou blokaci může banka ještě několik dní ukazovat jako čekající platbu, peníze ale strženy nejsou.</p>

          <H2>2. Po potvrzení – zrušení zákazníkem</H2>
          <p className="mb-3 text-sm text-slate-600">Potvrzenou rezervaci můžete zrušit v detailu objednávky. Celá zaplacená částka se vám vrátí automaticky, když rušíte včas:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Typ rezervace</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Celá částka se vrací, když zrušíte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3 font-medium text-slate-700">Služba</td><td className="px-4 py-3">před začátkem termínu</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Výjezd a nacenění</td><td className="px-4 py-3">před začátkem okna příjezdu a dokud poskytovatel nezaznamenal příjezd na místo</td></tr>
                <tr><td className="px-4 py-3 font-medium text-slate-700">Výrobek na míru</td><td className="px-4 py-3">dokud vám poskytovatel nepředal Závaznou nabídku a nezačal termín</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Později se peníze automaticky nevracejí – Propojo už neví, jestli jste se s poskytovatelem mezitím nedohodli na zakázce.
            Domluvte se s ním ve zprávách, případně využijte odstoupení od smlouvy (bod 4).
          </p>

          <H2>3. Když potvrzenou rezervaci nedodrží poskytovatel</H2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Situace</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Co se stane</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3">Poskytovatel rezervaci zruší</td><td className="px-4 py-3 font-medium text-emerald-700">Celá částka se vám vrátí automaticky.</td></tr>
                <tr><td className="px-4 py-3">Poskytovatel oznámí, že původní termín nemůže dodržet, a navrhne nový</td><td className="px-4 py-3">Nový termín můžete přijmout. Když ho odmítnete nebo nezareagujete do {p.cannotKeepExpiryHours} hodin (nejpozději do začátku původního termínu), celá částka se vrátí automaticky.</td></tr>
                <tr><td className="px-4 py-3">Poskytovatel nedorazí (služba, výjezd)</td><td className="px-4 py-3">Nedostavení nahlásíte v objednávce po skončení termínu, nejpozději do {p.providerNoShow.reportWindowHours} hodin. Když to poskytovatel uzná nebo do {p.providerNoShow.responseHours} hodin nezareaguje, celá částka se vrátí automaticky. Když to rozporuje, peníze se automaticky nehýbou a nárok uplatníte přímo u něj. U výjezdu se peníze automaticky nevrací ani tehdy, když poskytovatel před vaším hlášením zaznamenal příjezd na místo.</td></tr>
                <tr><td className="px-4 py-3">Poskytovatel navrhne jiný termín (původní neruší)</td><td className="px-4 py-3">Nic se nemění – původní termín platí, dokud nový nepřijmete.</td></tr>
              </tbody>
            </table>
          </div>
          <WarningBox>
            <strong>Pro poskytovatele:</strong> zaplacené částky se vracejí z vašeho Stripe účtu podle pokynu, který jste
            odsouhlasili při registraci. Provize Propojo a poplatek Stripe se při vrácení nevracejí. Zrušení z vaší strany,
            nedostavení a spory se započítávají do důvěryhodnosti účtu.
          </WarningBox>

          <H2>4. Odstoupení od smlouvy</H2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Od potvrzené rezervace <strong>služby</strong> nebo <strong>výjezdu</strong> můžete odstoupit bez udání důvodu do 14 dnů od jejího potvrzení – odkazem „Odstoupit od smlouvy“ v detailu objednávky. Potvrzení s datem a časem vám pošleme e-mailem. Odstoupením rezervace končí.</li>
            <li>U <strong>výjezdu</strong> a u <strong>služby s termínem do 14 dní</strong> jste ve shrnutí požádali o provedení před uplynutím lhůty – po provedení (skončení termínu) právo odstoupit zaniká.</li>
            <li>U <strong>výrobku na míru</strong> právo odstoupit ze zákona nevzniká.</li>
            <li>Po odstoupení vám zaplacenou částku vrací poskytovatel, nejpozději do 14 dnů. Rušíte-li ještě včas (bod 2), je jednodušší rezervaci zrušit – peníze se pak vrátí automaticky.</li>
          </ul>

          <H2>5. Jak vrácení peněz probíhá</H2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Automaticky se vrací vždy celá zaplacená částka, na kartu, kterou jste platili.</li>
            <li>V objednávce uvidíte stav: <strong>„Vrácení částky bylo zahájeno“</strong> a potom <strong>„Částka byla vrácena“</strong>. Banka může peníze připsat až za několik pracovních dnů.</li>
            <li>Když vrácení selže (například poskytovatel nemá na účtu prostředky), dáme vědět vám i poskytovateli. Povinnost vrátit peníze má dál poskytovatel.</li>
            <li>Pokud jste platbu reklamovali u své banky (chargeback), automatické vrácení se neprovede – vše se řeší v reklamaci u banky.</li>
          </ul>

          <H2>6. Samotná zakázka</H2>
          <p className="text-sm text-slate-600">
            Smlouvu o samotné práci nebo výrobku uzavíráte přímo s poskytovatelem, Propojo není její stranou a spory z ní nerozhoduje.
            Reklamaci práce, cenu zakázky a případné vrácení dalších plateb řešte přímo s poskytovatelem.
          </p>

          <H2>7. Kontakt</H2>
          <p className="text-sm text-slate-600">
            Když si nevíte rady, napište nám na{' '}
            <a href="mailto:admin@propojo.cz" className="text-emerald-700 hover:underline">admin@propojo.cz</a>.
          </p>
        </div>
      </div>
    </main>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 mt-10 text-xl font-black text-slate-900">{children}</h2>
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      {children}
    </div>
  )
}
function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      {children}
    </div>
  )
}
