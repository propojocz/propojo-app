'use client'
// components/ui/OrderTimeline.tsx
// „Průběh objednávky" — jednoduchá osa toho, co už proběhlo, co se děje teď
// a co čeká dál. Po úpravě termínového flow nerozlišujeme zvlášť „provider přijal":
// zákazníka zajímá hlavně termín, platba, realizace a dokončení.

import { Check } from 'lucide-react'
import { datumCas } from '@/lib/format'

type Stav = 'hotovo' | 'ted' | 'ceka'

type Krok = {
  nadpis: string
  cas?: string | null
  popis?: string | null
  stav: Stav
}

const fmt = (iso?: string | null) => (iso ? datumCas(iso) : null)

export default function OrderTimeline({
  status,
  depositStatus,
  createdAt,
  scheduledAt,
  completedAt,
  hasDeposit,
  isCustomer,
  isInquiry = false,
  hasTimeProposals = false,
  paymentInterrupted = false,
}: {
  status: string
  depositStatus: string | null
  createdAt: string
  scheduledAt: string | null
  completedAt?: string | null
  hasDeposit: boolean
  isCustomer: boolean
  isInquiry?: boolean
  /** Existuje právě aktivní návrh termínu / změny termínu. */
  hasTimeProposals?: boolean
  /** Zákazník se vrátil z checkoutu bez dokončení platby. */
  paymentInterrupted?: boolean
}) {
  // DOTAZ: zákazník napsal z karty, nic si neobjednal. Ukazovat klasickou osu by
  // bylo zavádějící — zatím probíhá jen konverzace.
  if (isInquiry && !scheduledAt && status === 'cekajici') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-slate-900">Zatím jen dotaz</h3>
        <p className="text-xs leading-relaxed text-slate-500">
          {isCustomer
            ? 'Nic jste si zatím neobjednal — tohle je konverzace o nabídce. Objednávka vznikne, až se domluvíte na termínu a případně zaplatíte zálohu.'
            : 'Zákazník se zatím jen ptá. Když se domluvíte, navrhněte mu termín.'}
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-emerald-500 bg-white">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <p className="text-xs font-bold text-slate-800">Domlouváte se ve zprávách</p>
        </div>
      </div>
    )
  }

  const zaplaceno = depositStatus === 'paid' || depositStatus === 'released'
  const vraceno = depositStatus === 'refunded'
  const zruseno = status === 'zruseno'
  const spor = status === 'spor'
  const dokonceno = status === 'dokonceno'
  const cekaPotvrzeni = status === 'ceka_potvrzeni'
  const prijato = status === 'prijato' || status === 'v_procesu'
  const maTermin = !!scheduledAt
  const realizacePripravena = maTermin && prijato && (!hasDeposit || zaplaceno)

  // ── ZRUŠENO ──────────────────────────────────────────────────────
  if (zruseno) {
    const kroky: Krok[] = [
      { nadpis: 'Objednávka vytvořena', cas: fmt(createdAt), stav: 'hotovo' },
      ...(maTermin ? [{ nadpis: 'Termín byl vybrán', cas: fmt(scheduledAt), stav: 'hotovo' as Stav }] : []),
      ...(zaplaceno || vraceno ? [{ nadpis: 'Platba přijata', stav: 'hotovo' as Stav }] : []),
      { nadpis: 'Objednávka zrušena', stav: 'hotovo' },
      ...(vraceno
        ? [{
            nadpis: isCustomer ? 'Peníze vráceny' : 'Záloha vrácena zákazníkovi',
            popis: isCustomer ? 'Na kartě se objeví zpravidla do několika pracovních dnů.' : null,
            stav: 'hotovo' as Stav,
          }]
        : []),
    ]
    return <Osa kroky={kroky} tema="zruseno" />
  }

  // ── BĚŽNÝ PRŮBĚH ────────────────────────────────────────────────
  const kroky: Krok[] = []

  kroky.push({ nadpis: 'Objednávka vytvořena', cas: fmt(createdAt), stav: 'hotovo' })

  // 1) TERMÍN
  if (!maTermin) {
    kroky.push({
      nadpis: hasTimeProposals ? 'Poskytovatel navrhl termíny' : 'Domluva termínu',
      popis: hasTimeProposals
        ? (isCustomer ? 'Vyberte si jeden z navržených časů.' : 'Čeká se, který termín zákazník potvrdí.')
        : (isCustomer ? 'Domluvte se s poskytovatelem na konkrétním čase.' : 'Navrhněte zákazníkovi konkrétní časy.'),
      stav: 'ted',
    })
  } else {
    const definitivni = !hasDeposit || zaplaceno
    kroky.push({
      nadpis: definitivni ? 'Termín potvrzen' : 'Termín vybrán',
      cas: fmt(scheduledAt),
      popis: definitivni
        ? null
        : (isCustomer ? 'Termín se definitivně potvrdí po zaplacení.' : 'Zákazník ještě musí dokončit platbu.'),
      stav: 'hotovo',
    })
  }

  // 2) PLATBA — jen pokud se u objednávky opravdu něco platí předem.
  if (hasDeposit) {
    let nadpis = 'Čeká se na platbu'
    let popis: string | null = null
    let stav: Stav = 'ceka'

    if (zaplaceno) {
      nadpis = 'Platba uhrazena'
      stav = 'hotovo'
    } else if (maTermin && prijato) {
      stav = 'ted'
      if (paymentInterrupted && isCustomer) {
        nadpis = 'Platba nebyla dokončena'
        popis = 'Termín pro vás zatím držíme. Platbu můžete zkusit znovu nebo zvolit jiný termín.'
      } else {
        nadpis = 'Čeká se na platbu'
        popis = isCustomer
          ? 'Dokončete platbu, aby se termín závazně potvrdil.'
          : 'Čeká se, až zákazník dokončí platbu.'
      }
    } else {
      popis = isCustomer ? 'Platba se zpřístupní po výběru termínu.' : null
    }

    kroky.push({ nadpis, popis, stav })
  }

  // Probíhající změnu termínu zobrazujeme jako samostatný krok. Původní termín
  // dál platí, dokud zákazník nový návrh nepřijme.
  if (maTermin && hasTimeProposals) {
    kroky.push({
      nadpis: 'Navržena změna termínu',
      popis: isCustomer
        ? 'Původní termín zatím platí. Vyberte si nový návrh, nebo změnu odmítněte.'
        : 'Původní termín zatím platí. Čeká se na rozhodnutí zákazníka.',
      stav: 'ted',
    })
  }

  // 3) REALIZACE
  kroky.push({
    nadpis: 'Realizace služby',
    popis: realizacePripravena
      ? (isCustomer ? 'Dostavte se v potvrzený termín.' : 'Zakázku proveďte v potvrzeném termínu.')
      : null,
    stav: (cekaPotvrzeni || dokonceno)
      ? 'hotovo'
      : (realizacePripravena && !hasTimeProposals ? 'ted' : 'ceka'),
  })

  // 4) DOKONČENÍ
  kroky.push({
    nadpis: dokonceno ? 'Dokončeno' : 'Potvrzení a hodnocení',
    cas: dokonceno ? fmt(completedAt) : null,
    popis: cekaPotvrzeni
      ? (isCustomer
          ? 'Potvrďte, že vše proběhlo v pořádku. Když nic nenamítnete, platba se poskytovateli odešle automaticky do 2 dnů.'
          : 'Čeká se na potvrzení zákazníka. Bez námitky se platba odešle automaticky do 2 dnů.')
      : null,
    stav: dokonceno ? 'hotovo' : (cekaPotvrzeni ? 'ted' : 'ceka'),
  })

  return <Osa kroky={kroky} tema={spor ? 'spor' : 'normal'} />
}

function Osa({ kroky, tema }: { kroky: Krok[]; tema: 'normal' | 'zruseno' | 'spor' }) {
  const barva = tema === 'zruseno' ? 'slate' : tema === 'spor' ? 'orange' : 'emerald'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-slate-900">Průběh objednávky</h3>

      <ol className="relative space-y-0">
        {kroky.map((k, i) => {
          const posledni = i === kroky.length - 1
          const hotovo = k.stav === 'hotovo'
          const ted = k.stav === 'ted'

          return (
            <li key={`${k.nadpis}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
              {!posledni && (
                <span
                  aria-hidden
                  className={`absolute left-[11px] top-6 h-full w-0.5 ${
                    hotovo ? (barva === 'emerald' ? 'bg-emerald-300' : 'bg-slate-300') : 'bg-slate-200'
                  }`}
                />
              )}

              <span
                className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  hotovo
                    ? tema === 'zruseno' ? 'bg-slate-400 text-white'
                      : tema === 'spor' ? 'bg-orange-500 text-white'
                      : 'bg-emerald-500 text-white'
                    : ted
                      ? 'border-2 border-emerald-500 bg-white'
                      : 'border-2 border-slate-200 bg-white'
                }`}
              >
                {hotovo
                  ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  : ted
                    ? <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
              </span>

              <div className={`min-w-0 flex-1 ${ted ? '-mt-0.5 rounded-xl bg-emerald-50 px-3 py-2' : 'pt-0.5'}`}>
                <p className={`text-sm ${hotovo || ted ? 'font-bold text-slate-900' : 'font-semibold text-slate-400'}`}>
                  {k.nadpis}
                </p>
                {k.cas && <p className="mt-0.5 text-xs text-slate-400">{k.cas}</p>}
                {k.popis && <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{k.popis}</p>}
                {!k.cas && !k.popis && !hotovo && !ted && (
                  <p className="mt-0.5 text-xs text-slate-400">Čeká</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}