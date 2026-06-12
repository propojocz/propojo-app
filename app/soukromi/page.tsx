// app/soukromi/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ochrana osobních údajů | Propojo',
  description: 'Zásady ochrany osobních údajů a GDPR informace platformy Propojo.',
}

export default function SoukromiPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět domů
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <div className="mb-8 border-b border-slate-200 pb-6">
            <h1 className="text-3xl font-black text-slate-900">Ochrana osobních údajů</h1>
            <p className="mt-2 text-slate-500">GDPR · Platné od 1. 1. 2025 · Propojo</p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-slate-600">
            <Section title="1. Správce osobních údajů">
              <p>Správcem osobních údajů je provozovatel platformy Propojo. Kontaktní email pro záležitosti ochrany osobních údajů: <a href="mailto:gdpr@propojo.cz" className="text-indigo-600 hover:underline">gdpr@propojo.cz</a>.</p>
            </Section>

            <Section title="2. Jaké údaje zpracováváme">
              <p><strong className="text-slate-800">Identifikační a kontaktní údaje:</strong> jméno, emailová adresa, telefonní číslo, město, IČO (u živnostníků).</p>
              <p><strong className="text-slate-800">Profilové údaje:</strong> profilová fotografie, bio, hodnocení a recenze.</p>
              <p><strong className="text-slate-800">Transakční údaje:</strong> záznamy o objednávkách a poptávkách.</p>
              <p><strong className="text-slate-800">Technické údaje:</strong> IP adresa, typ prohlížeče, cookies, logy přístupů.</p>
            </Section>

            <Section title="3. Účel a právní základ zpracování">
              <p><strong className="text-slate-800">Plnění smlouvy:</strong> zpracování nezbytné pro poskytování služeb platformy – registrace, správa účtu, zprostředkování kontaktu.</p>
              <p><strong className="text-slate-800">Oprávněný zájem:</strong> zabezpečení platformy, prevence podvodů, zlepšování služeb.</p>
              <p><strong className="text-slate-800">Souhlas:</strong> marketingová komunikace, analytické a marketingové cookies (pouze se souhlasem).</p>
              <p><strong className="text-slate-800">Právní povinnost:</strong> uchovávání daňových dokladů a dalších dokumentů vyžadovaných zákonem.</p>
            </Section>

            <Section title="4. Sdílení údajů">
              <p>Vaše osobní údaje neprodáváme třetím stranám. Sdílíme je pouze s:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Supabase (databáze a autentifikace) – zpracovatel se sídlem v USA s certifikací SOC 2</li>
                <li>Resend (emailová komunikace) – zpracovatel pro odesílání notifikací</li>
                <li>Vercel (hosting) – zpracovatel pro provoz aplikace</li>
                <li>Orgány veřejné moci – na základě zákonné povinnosti</li>
              </ul>
            </Section>

            <Section title="5. Doba uchovávání">
              <p>Osobní údaje uchováváme po dobu existence vašeho účtu a dále po dobu nezbytnou pro splnění právních povinností (zpravidla 5–10 let pro účetní doklady).</p>
              <p>Po zrušení účtu jsou osobní údaje anonymizovány nebo smazány do 30 dnů, s výjimkou údajů uchovávaných ze zákonných důvodů.</p>
            </Section>

            <Section title="6. Vaše práva">
              <p>Máte právo na <strong className="text-slate-800">přístup</strong> ke svým údajům, jejich <strong className="text-slate-800">opravu</strong>, <strong className="text-slate-800">výmaz</strong> („právo být zapomenut"), <strong className="text-slate-800">omezení zpracování</strong> a <strong className="text-slate-800">přenositelnost</strong> údajů.</p>
              <p>Máte právo <strong className="text-slate-800">vznést námitku</strong> proti zpracování a <strong className="text-slate-800">odvolat souhlas</strong> kdykoli, aniž by to mělo vliv na zákonnost předchozího zpracování.</p>
              <p>Pro uplatnění práv nás kontaktujte na <a href="mailto:gdpr@propojo.cz" className="text-indigo-600 hover:underline">gdpr@propojo.cz</a>. Odpovíme do 30 dnů. Máte také právo podat stížnost u Úřadu pro ochranu osobních údajů (uoou.cz).</p>
            </Section>

            <Section title="7. Cookies">
              <p><strong className="text-slate-800">Nezbytné cookies:</strong> zajišťují základní funkce platformy (přihlášení, bezpečnost). Nelze je vypnout.</p>
              <p><strong className="text-slate-800">Analytické cookies:</strong> pomáhají nám porozumět, jak platformu používáte. Aktivní pouze se souhlasem.</p>
              <p><strong className="text-slate-800">Marketingové cookies:</strong> slouží k personalizaci obsahu. Aktivní pouze se souhlasem.</p>
              <p>Souhlas s nepovinnými cookies můžete kdykoli odvolat v nastavení cookies (lišta při spuštění webu).</p>
            </Section>

            <Section title="8. Bezpečnost">
              <p>Přijímáme přiměřená technická a organizační opatření k ochraně vašich osobních údajů, včetně šifrování přenosu dat (HTTPS), bezpečného ukládání hesel a pravidelných bezpečnostních kontrol.</p>
            </Section>

            <Section title="9. Změny zásad">
              <p>O podstatných změnách těchto Zásad budete informováni emailem nebo oznámením na platformě s předstihem nejméně 14 dní.</p>
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