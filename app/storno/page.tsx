// app/storno/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Storno podmínky a Refund politika | Propojo',
}

export default function StornoPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět domů
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <div className="mb-8 border-b border-slate-200 pb-6">
            <h1 className="mb-2 text-3xl font-black text-slate-900">Storno podmínky a Refund politika</h1>
            <p className="text-slate-500">Pravidla pro zrušení objednávky a vrácení peněz na platformě Propojo</p>
          </div>

          <InfoBox>
            <strong>Klíčový princip:</strong> Čím dříve zrušíš, tím více dostaneš zpět. Podnikatelé potřebují čas přeplánovat svůj kalendář.
          </InfoBox>

          <H2>1. Storno ze strany zákazníka</H2>
          <H3>1.1 Tabulka storno poplatků</H3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Kdy zrušíš</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Refundace</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Storno poplatek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr><td className="px-4 py-3 text-slate-700">Více než 48 hodin před termínem</td><td className="px-4 py-3 font-bold text-emerald-600">100 %</td><td className="px-4 py-3 text-slate-600">0 Kč</td></tr>
                <tr><td className="px-4 py-3 text-slate-700">24–48 hodin před termínem</td><td className="px-4 py-3 font-bold text-orange-500">50 %</td><td className="px-4 py-3 text-slate-600">50 % z ceny</td></tr>
                <tr><td className="px-4 py-3 text-slate-700">Méně než 24 hodin před termínem</td><td className="px-4 py-3 font-bold text-red-600">0 %</td><td className="px-4 py-3 text-slate-600">100 % z ceny</td></tr>
                <tr><td className="px-4 py-3 text-slate-700">Nedostavení se (no-show)</td><td className="px-4 py-3 font-bold text-red-600">0 %</td><td className="px-4 py-3 text-slate-600">100 % z ceny</td></tr>
              </tbody>
            </table>
          </div>

          <H3>1.2 Jak zrušit objednávku</H3>
          <ol className="space-y-2 pl-5 text-sm text-slate-600 list-decimal">
            <li>Přihlas se do svého účtu na Propojo</li>
            <li>Jdi do sekce „Moje objednávky"</li>
            <li>U příslušné objednávky klikni na „Zrušit objednávku"</li>
            <li>Potvrď zrušení</li>
            <li>Refundace bude zpracována automaticky do 5–10 pracovních dnů</li>
          </ol>

          <H3>1.3 Kam se vrací peníze</H3>
          <ul className="space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
            <li><strong>Platební karta:</strong> zpět na kartu (5–10 pracovních dnů)</li>
            <li><strong>Bankovní převod:</strong> zpět na účet (3–5 pracovních dnů)</li>
            <li><strong>Apple Pay / Google Pay:</strong> zpět na původní platební metodu</li>
          </ul>

          <H2>2. Storno ze strany podnikatele</H2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Situace</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Pro zákazníka</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Pro podnikatele</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3">Podnikatel zruší objednávku</td><td className="px-4 py-3 font-medium text-emerald-600">100% refundace</td><td className="px-4 py-3">Snížení hodnocení profilu</td></tr>
                <tr><td className="px-4 py-3">Podnikatel se nedostaví (no-show)</td><td className="px-4 py-3 font-medium text-emerald-600">100% refundace</td><td className="px-4 py-3">Výrazné snížení hodnocení + možná blokace</td></tr>
                <tr><td className="px-4 py-3">Podnikatel nabídne náhradní termín</td><td className="px-4 py-3">Zákazník může přijmout nebo odmítnout</td><td className="px-4 py-3">Bez penalizace, pokud zákazník přijme</td></tr>
              </tbody>
            </table>
          </div>
          <WarningBox>
            <strong>Upozornění pro podnikatele:</strong> Opakované rušení objednávek (více než 3× za měsíc) může vést k pozastavení nebo zrušení účtu na platformě.
          </WarningBox>

          <H2>3. Reklamace služby</H2>
          <H3>3.1 Kdy můžeš reklamovat</H3>
          <ul className="space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
            <li>Služba nebyla provedena podle dohody</li>
            <li>Kvalita práce neodpovídá popisu</li>
            <li>Podnikatel nedokončil práci</li>
            <li>Podnikatel způsobil škodu</li>
          </ul>

          <H3>3.2 Postup reklamace</H3>
          <ol className="space-y-2 pl-5 text-sm text-slate-600 list-decimal">
            <li>Nahlas reklamaci do <strong>48 hodin</strong> od dokončení služby</li>
            <li>V sekci „Moje objednávky" vyber „Nahlásit problém"</li>
            <li>Popiš problém a přilož fotodokumentaci</li>
            <li>Podnikatel má 72 hodin na vyjádření</li>
            <li>Platforma rozhodne do 7 pracovních dnů</li>
          </ol>

          <H2>4. Výjimky a zvláštní případy</H2>
          <H3>4.1 Vyšší moc</H3>
          <p className="text-sm text-slate-600">V případě vyšší moci (nemoc, nehoda, extrémní počasí, vládní nařízení) může být storno podmínka prominuta. Kontaktuj zákaznickou podporu s doložením důvodu.</p>

          <H2>5. Kontakt</H2>
          <ul className="space-y-1.5 pl-5 text-sm text-slate-600 list-disc">
            <li><strong>Email:</strong> <a href="mailto:podpora@propojo.cz" className="text-indigo-600 hover:underline">podpora@propojo.cz</a></li>
            <li><strong>V aplikaci:</strong> sekce „Nápověda" → „Kontaktovat podporu"</li>
            <li><strong>Doba odpovědi:</strong> do 24 hodin v pracovní dny</li>
          </ul>

          <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
            Propojo – Storno podmínky a Refund politika · Verze 1.0
          </div>
        </div>
      </div>
    </main>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 mt-10 text-xl font-black text-slate-900">{children}</h2>
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">{children}</h3>
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
