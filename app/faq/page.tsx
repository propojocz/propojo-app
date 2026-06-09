'use client'
// app/faq/page.tsx
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, Search } from 'lucide-react'

const FAQ_DATA = [
  {
    section: '📌 Obecné',
    items: [
      { q: 'Co je Propojo?', a: 'Propojo je online platforma, která propojuje zákazníky s lokálními podnikateli – elektrikáři, malíři, instalatéry, uklízeči a dalšími. Vyberete službu, uvidíte cenu předem, objednáte online a zaplatíte bezpečně přes platformu.' },
      { q: 'Je registrace zdarma?', a: 'Ano, registrace je zdarma pro zákazníky i podnikatele. Zákazníci neplatí žádné poplatky navíc – pouze cenu služby. Podnikatelé mají první 3 měsíce zcela zdarma (bez předplatného i bez provizí).' },
      { q: 'Jak funguje platba?', a: 'Platba probíhá online kartou, převodem nebo přes Apple/Google Pay. Peníze jsou drženy na platformě a uvolněny podnikateli až po dokončení služby. Toto chrání obě strany.' },
    ],
  },
  {
    section: '👤 Pro zákazníky',
    items: [
      { q: 'Jak objednám službu?', a: 'Vyberte kategorii nebo vyhledejte konkrétní službu. Projděte profily podnikatelů, zvolte termín a zaplaťte online. Podnikatel objednávku potvrdí do 24 hodin.' },
      { q: 'Co když se podnikatel nedostaví?', a: 'Pokud se podnikatel nedostaví, obdržíte automaticky 100% refundaci. Incident je zaznamenán a ovlivní hodnocení podnikatele.' },
      { q: 'Mohu zrušit objednávku?', a: 'Ano. Při zrušení více než 48 hodin předem dostanete zpět 100 % ceny. Bližší podmínky viz Storno politika.' },
      { q: 'Jak mohu hodnotit podnikatele?', a: 'Po dokončení služby vám přijde výzva k hodnocení. Ohodnoťte podnikatele 1–5 hvězdičkami a napište krátkou recenzi.' },
    ],
  },
  {
    section: '🔧 Pro podnikatele',
    items: [
      { q: 'Jak se registruji jako podnikatel?', a: 'Klikněte na „Začít zdarma", zvolte typ účtu „Podnikatel" a vyplňte profil. Potřebujete IČO a alespoň jednu fotografii. Profil bude aktivní do 24 hodin.' },
      { q: 'Kolik si Propojo bere provizi?', a: 'Provize je 10 % z každé dokončené zakázky. První 3 měsíce jsou bez poplatků. Neexistují žádné skryté poplatky ani měsíční předplatné.' },
      { q: 'Jak fungují výplaty?', a: 'Peníze jsou uvolněny po potvrzení dokončení zákazníkem. Výplata probíhá každý týden na váš bankovní účet, obvykle v pátek.' },
      { q: 'Mohu odmítnout objednávku?', a: 'Ano, každou objednávku musíte aktivně přijmout. Máte na to 24 hodin. Opakované odmítání bez důvodu může ovlivnit vaši viditelnost.' },
    ],
  },
  {
    section: '💳 Platby a bezpečnost',
    items: [
      { q: 'Je platba bezpečná?', a: 'Ano. Platby jsou zpracovávány přes certifikovanou platební bránu (PCI DSS). Propojo nikdy neukládá čísla karet.' },
      { q: 'Co dělat, pokud mám problém s platbou?', a: 'Napište na podpora@propojo.cz nebo použijte chat podpory v aplikaci. Odpovídáme do 24 hodin v pracovní dny.' },
    ],
  },
]

export default function FAQPage() {
  const [open, setOpen] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = FAQ_DATA.map(sec => ({
    ...sec,
    items: sec.items.filter(
      item =>
        item.q.toLowerCase().includes(search.toLowerCase()) ||
        item.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(sec => sec.items.length > 0)

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-16 text-center text-white">
        <h1 className="mb-2 text-3xl font-black sm:text-4xl">Často kladené otázky</h1>
        <p className="text-slate-400">Najděte odpovědi na nejčastější dotazy</p>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Zpět domů
        </Link>

        {/* Hledání */}
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            type="search"
            placeholder="Hledat v otázkách..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Sekce */}
        <div className="space-y-8">
          {filtered.map(sec => (
            <div key={sec.section}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">{sec.section}</p>
              <div className="space-y-2">
                {sec.items.map(item => (
                  <div key={item.q} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <button
                      onClick={() => setOpen(open === item.q ? null : item.q)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {item.q}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open === item.q ? 'rotate-180' : ''}`} />
                    </button>
                    {open === item.q && (
                      <div className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600">
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              <div className="mb-3 text-4xl">🔍</div>
              <p>Žádné výsledky pro „{search}"</p>
            </div>
          )}
        </div>

        {/* Kontakt */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h3 className="mb-2 text-lg font-bold text-slate-900">Nenašli jste odpověď?</h3>
          <p className="mb-5 text-sm text-slate-500">Napište nám a odpovíme do 24 hodin.</p>
          <a href="mailto:podpora@propojo.cz" className="btn-primary">
            Napsat podporu
          </a>
        </div>
      </div>
    </main>
  )
}
