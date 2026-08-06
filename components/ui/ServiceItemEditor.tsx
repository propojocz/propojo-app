'use client'
// components/ui/ServiceItemEditor.tsx
// Editor JEDNÉ položky ceníku (úkonu). Řízená komponenta — nezná databázi.
//
// Model A/B je na úrovni POLOŽKY: jedna karta může mít „Zaměření 1 500 Kč" (A)
// i „Výjezd a nacenění" (B) zároveň.
//
// Podmínky výjezdu (poplatek za nacenění, Kč/km, doprava zdarma, do kolika dnů)
// patří sem — k úkonu, ne ke kartě. Dřív byly na kartě a vedle toho tady byla
// volba „Nejdřív nacenění", takže na jedné obrazovce stálo dvakrát totéž.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Info, Loader2, X, Truck, Tag } from 'lucide-react'
import { PRICE_UNIT_LABELS } from '@/types/database'
import InfoTip from '@/components/ui/InfoTip'
import type { PaymentModel, PriceType, PriceUnit } from '@/types/database'

// Typy služeb nabídnuté z podkategorií karty (pro našeptávač názvu).
export interface ServiceTypeOption {
  id: string
  name: string
}

// Hodnoty jedné položky, se kterými editor pracuje.
// Strop poplatku za nedostavení/zrušení — ochrana zákazníka. Jedno místo
// pro celou platformu; kdyby se měl měnit, měň tady.
const MAX_NO_SHOW_FEE = 1000

export interface ServiceItemValues {
  id?: string                      // vyplněné jen u existující položky (režim úpravy)
  service_type_id: string | null
  /** Ke které podkategorii karty úkon patří (vrstva 13). */
  subcategory_id: string | null
  name: string
  payment_model: PaymentModel
  price_type: PriceType
  price: number | null
  price_unit: PriceUnit
  price_max: number | null
  duration_minutes: number | null
  deposit_amount: number | null
  deposit_type: 'zaloha' | 'plna_platba' | 'bez_platby'
  no_show_fee: number | null
  fee_mode: 'noshow' | 'storno' | 'zadny'
  price_includes_material: boolean | null
  price_note: string | null
  is_active: boolean
  // Podmínky výjezdu — jen model B
  quote_fee: number | null
  price_per_km: number | null
  free_km: number | null
  quote_days: number | null
}

interface Props {
  initial?: Partial<ServiceItemValues>
  serviceTypes: ServiceTypeOption[]
  /** Název podkategorie, pod kterou úkon spadá — jen k zobrazení. */
  subcategoryName?: string | null
  saving?: boolean
  onSave: (values: ServiceItemValues) => void
  onCancel: () => void
}

const PRICE_UNITS: PriceUnit[] = ['ukon', 'hod', 'kus', 'm2', 'bm', 'den', 'projekt']

const EMPTY: ServiceItemValues = {
  service_type_id: null,
  subcategory_id: null,
  name: '',
  payment_model: 'A',
  price_type: 'fixed',
  price: null,
  price_unit: 'ukon',
  price_max: null,
  duration_minutes: null,
  deposit_amount: 200,
  deposit_type: 'zaloha',
  no_show_fee: null,
  fee_mode: 'noshow',
  price_includes_material: true,
  price_note: null,
  is_active: true,
  quote_fee: null,
  price_per_km: null,
  free_km: null,
  quote_days: null,
}

const numOrNull = (v: string): number | null => (v === '' || v == null ? null : Number(v))

export default function ServiceItemEditor({ initial, serviceTypes, subcategoryName = null, saving = false, onSave, onCancel }: Props) {
  const [v, setV] = useState<ServiceItemValues>({ ...EMPTY, ...initial })
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ServiceItemValues>(key: K, val: ServiceItemValues[K]) =>
    setV(prev => ({ ...prev, [key]: val }))

  const isB = v.payment_model === 'B'
  const isOnAgreement = v.price_type === 'on_agreement'
  // Záloha vyšší než cena úkonu (jen pevná cena) — blokuje uložení.
  const zalohaMoc =
    v.deposit_type === 'zaloha' &&
    v.price_type === 'fixed' &&
    (v.price ?? 0) > 0 &&
    (v.deposit_amount ?? 0) > (v.price ?? 0)

  const switchModel = (m: PaymentModel) => {
    if (m === 'B') {
      setV(prev => ({ ...prev, payment_model: 'B', price_type: 'on_agreement' }))
    } else {
      setV(prev => ({ ...prev, payment_model: 'A', price_type: 'fixed' }))
    }
  }

  const handleSave = () => {
    if (!v.name || v.name.trim().length < 2) { setError('Zadejte název úkonu.'); return }
    if (!isB && !isOnAgreement && (v.price == null || v.price <= 0)) {
      setError('Zadejte cenu, nebo zvolte „Po domluvě".'); return
    }
    // Délka je povinná jen tam, kde se objednává čas (pevná cena za úkon/hodinu).
    // U m², bm, dne, projektu, u modelu B i u ceny dohodou se délka neřeší.
    const potrebaDelku = !isB && v.price_type === 'fixed'
      && (v.price_unit === 'ukon' || v.price_unit === 'hod')
    if (potrebaDelku && (v.duration_minutes == null || v.duration_minutes <= 0)) {
      setError('Zadejte délku úkonu — podle ní se v kalendáři počítá termín.'); return
    }
    setError(null)

    // Očištění hodnot podle modelu/typu ceny — ať do DB nejdou nesmysly.
    const out: ServiceItemValues = { ...v, name: v.name.trim() }
    if (isB) {
      out.price = null
      out.price_type = 'on_agreement'
      out.price_max = null
      out.deposit_amount = null
      out.deposit_type = 'zaloha'
      out.no_show_fee = null
      out.fee_mode = 'noshow'
      out.price_includes_material = true
      out.price_note = out.price_note?.trim() || null
    } else {
      if (isOnAgreement) { out.price = null; out.price_max = null }
      if (out.price_type !== 'range') out.price_max = null
      if (out.deposit_type === 'bez_platby') {
        // Platí se až po službě — žádná záloha, a tím pádem ani poplatek
        // (není z čeho ho strhnout).
        out.deposit_amount = null
        out.no_show_fee = null
        out.fee_mode = 'zadny'
      } else if (out.deposit_type === 'plna_platba') {
        out.deposit_amount = null   // platí se celá cena, záloha se neřeší
      } else {
        if (out.deposit_amount != null && out.deposit_amount < 200) out.deposit_amount = 200
        if (out.deposit_amount == null) out.deposit_amount = 200
        // Záloha nikdy vyšší než cena úkonu (jen u pevné ceny, jinde cenu neznáme).
        if (out.price_type === 'fixed' && out.price != null && out.price > 0
            && out.deposit_amount != null && out.deposit_amount > out.price) {
          out.deposit_amount = out.price
        }
      }
      if (out.fee_mode == null) out.fee_mode = 'noshow'
      if (out.fee_mode === 'zadny') out.no_show_fee = null
      if (out.no_show_fee != null && out.no_show_fee <= 0) out.no_show_fee = null
      if (out.no_show_fee != null && out.no_show_fee > MAX_NO_SHOW_FEE) out.no_show_fee = MAX_NO_SHOW_FEE
      out.price_note = out.price_note?.trim() || null
      // Výjezdové podmínky patří jen k naceňovacímu úkonu.
      out.quote_fee = null
      out.price_per_km = null
      out.free_km = null
      out.quote_days = null
    }
    onSave(out)
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/60"
    >
      <div className="space-y-4 p-4 sm:p-5">

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-emerald-800">
            {v.id ? 'Upravit úkon' : 'Nový úkon'}
          </h4>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Zrušit">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Kam úkon patří — plyne z podkategorií vybraných na kartě, nevybírá se znovu. */}
        {subcategoryName && (
          <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Tag className="h-3.5 w-3.5 text-slate-400" />
            Úkon v podkategorii <strong className="text-slate-700">{subcategoryName}</strong>
          </p>
        )}

        {/* Název na kartě */}
        <div className="space-y-1.5">
          <label className="form-label flex items-center justify-between">
            <span>Název na kartě *</span>
            <span className="text-xs font-normal text-slate-400">{v.name.length} / 100</span>
          </label>
          <input
            type="text" maxLength={100} placeholder="např. Dámský střih a foukaná"
            value={v.name}
            onChange={e => set('name', e.target.value)}
            className="form-input bg-white"
          />
        </div>

        {/* Model A/B — na úrovni položky */}
        <div className="space-y-2">
          <label className="form-label flex items-center justify-between gap-1">
            <span>Jak se za tento úkon platí? *</span>
            <InfoTip>
              <strong>Pevná cena</strong> — víte předem, kolik to stojí. Zákazník si rezervuje
              termín a zaplatí zálohu.<br />
              <strong>Nacenění</strong> — cenu nelze určit dopředu. Přijedete se podívat,
              teprve pak dáte nabídku. Používejte vždy, když si cenou nejste jistí — ušetří
              to spory o doúčtování.
            </InfoTip>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => switchModel('A')}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                !isB ? 'border-emerald-500 bg-white' : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <div className="mb-0.5 flex items-center gap-2">
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${!isB ? 'border-emerald-500' : 'border-slate-300'}`}>
                  {!isB && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </span>
                <span className="text-sm font-extrabold text-slate-900">Pevná cena a záloha</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Zákazník rezervuje termín a zaplatí zálohu.</p>
            </button>

            <button
              type="button"
              onClick={() => switchModel('B')}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                isB ? 'border-emerald-500 bg-white' : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <div className="mb-0.5 flex items-center gap-2">
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${isB ? 'border-emerald-500' : 'border-slate-300'}`}>
                  {isB && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </span>
                <span className="text-sm font-extrabold text-slate-900">Nejdřív nacenění</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Přijedete se podívat, cenu určíte na místě.</p>
            </button>
          </div>
        </div>

        {/* ── Model A: cena ── */}
        {!isB && (
          <>
            {/* Typ ceny */}
            <div className="flex gap-1.5 rounded-xl bg-white p-1.5">
              {([
                { value: 'fixed', label: 'Pevná cena' },
                { value: 'range', label: 'Rozmezí' },
                { value: 'on_agreement', label: 'Po domluvě' },
              ] as const).map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('price_type', t.value)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
                    v.price_type === t.value ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Jednotka ceny */}
            {!isOnAgreement && (
              <div className="space-y-1.5">
                <label className="form-label flex items-center justify-between gap-1">
                  <span>Jednotka ceny *</span>
                  <InfoTip>
                    <strong>Za úkon</strong> = pevná částka za celý výkon (střih, manikúra).
                    <strong> Za hodinu</strong> = sazba krát čas.
                    U dlouhých prací (za den, za m²) se délka v kalendáři nepoužívá — termíny
                    na ně nemá smysl vypisovat.
                  </InfoTip>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRICE_UNITS.map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => set('price_unit', u)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition-all ${
                        v.price_unit === u
                          ? 'border-emerald-500 bg-white text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300'
                      }`}
                    >
                      {PRICE_UNIT_LABELS[u]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pevná cena */}
            {v.price_type === 'fixed' && (
              (() => {
                // Délka slouží ke skládání termínů v kalendáři — má smysl jen tam,
                // kde se objednává ČAS (za úkon, za hodinu). U ceny za m², bm, den,
                // projekt nebo kus dopředu nikdo neví, jak dlouho to zabere, tak
                // délku vůbec nenabízíme (jinde matla — „mytí střech za m²" a délka min).
                const casovaJednotka = v.price_unit === 'ukon' || v.price_unit === 'hod'
                return casovaJednotka ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="form-label">Cena (Kč) *</label>
                      <input type="number" min={0} placeholder="600"
                        value={v.price ?? ''}
                        onChange={e => set('price', numOrNull(e.target.value))}
                        className="form-input bg-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="form-label flex items-center justify-between gap-1">
                        <span>Délka (min) *</span>
                        <InfoTip>
                          Jak dlouho úkon trvá. Podle toho poznáme, <strong>do kterých volných oken se vejde</strong> —
                          a když je úkon kratší než okno, zabere jen svůj čas.
                          <strong> Zbytek okna zůstane volný</strong> pro dalšího zákazníka.
                        </InfoTip>
                      </label>
                      <input type="number" min={0} placeholder="45"
                        value={v.duration_minutes ?? ''}
                        onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                        className="form-input bg-white" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="form-label">Cena (Kč) *</label>
                    <input type="number" min={0} placeholder="600"
                      value={v.price ?? ''}
                      onChange={e => set('price', numOrNull(e.target.value))}
                      className="form-input bg-white" />
                    <p className="text-xs text-slate-400">
                      U ceny {PRICE_UNIT_LABELS[v.price_unit]} se délka neřeší — u téhle karty
                      domluvíte termín v poptávce, ne přes pevné okno.
                    </p>
                  </div>
                )
              })()
            )}

            {/* Rozmezí */}
            {v.price_type === 'range' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="form-label">Cena od (Kč) *</label>
                    <input type="number" min={0} placeholder="1800"
                      value={v.price ?? ''}
                      onChange={e => set('price', numOrNull(e.target.value))}
                      className="form-input bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="form-label">Cena do (Kč) *</label>
                    <input type="number" min={0} placeholder="2600"
                      value={v.price_max ?? ''}
                      onChange={e => set('price_max', numOrNull(e.target.value))}
                      className="form-input bg-white" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Délka (min) *</label>
                  <input type="number" min={0} placeholder="120"
                    value={v.duration_minutes ?? ''}
                    onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                    className="form-input bg-white" />
                </div>
              </>
            )}

            {/* Po domluvě */}
            {isOnAgreement && (
              <>
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span>Cena bude domluvena se zákazníkem. V ceníku se zobrazí „Cena dohodou".</span>
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Orientační délka (min) *</label>
                  <input type="number" min={0} placeholder="60"
                    value={v.duration_minutes ?? ''}
                    onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                    className="form-input bg-white" />
                  <p className="text-xs text-slate-400">Podle délky se v kalendáři rezervuje čas — i u ceny dohodou ji potřebujeme.</p>
                </div>
              </>
            )}

            {/* Materiál v ceně */}
            {!isOnAgreement && (
              <div className="space-y-2">
                <label className="form-label flex items-center justify-between gap-1">
                  <span>Co je v ceně?</span>
                  <InfoTip>
                    Když účtujete materiál zvlášť, zákazník uvidí u ceny štítek
                    <strong> „bez materiálu"</strong>. Bez něj by vaši cenu srovnával s nabídkou,
                    kde materiál zahrnutý je — a vypadali byste dráž, než jste.
                  </InfoTip>
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    { value: true,  title: 'Včetně materiálu', desc: 'Zákazník nic nedoplácí' },
                    { value: false, title: 'Jen práce',        desc: 'Materiál účtuji zvlášť' },
                    { value: null,  title: 'Neřeším',          desc: 'Výuka, poradenství, IT' },
                  ] as const).map(opt => {
                    const sel = v.price_includes_material === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => set('price_includes_material', opt.value)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
                        }`}
                      >
                        <p className="text-sm font-extrabold text-slate-900">{opt.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{opt.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Jak zákazník platí předem: záloha nebo celá cena */}
            <div className="space-y-1.5">
              <label className="form-label flex items-center justify-between gap-1">
                <span>Platba předem</span>
                <InfoTip>
                  Buď <strong>záloha</strong> (zbytek zákazník doplatí na místě), nebo
                  <strong> celá cena předem</strong> (na místě se nedoplácí nic). Peníze se drží
                  přes Propojo a uvolní se vám po provedení práce.
                </InfoTip>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button"
                  onClick={() => set('deposit_type', 'zaloha')}
                  className={`rounded-xl border-2 px-2 py-2.5 text-left transition ${v.deposit_type === 'zaloha' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">Záloha</span>
                  <span className="block text-xs text-slate-500">zbytek na místě</span>
                </button>
                <button type="button"
                  onClick={() => set('deposit_type', 'plna_platba')}
                  className={`rounded-xl border-2 px-2 py-2.5 text-left transition ${v.deposit_type === 'plna_platba' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">Celá předem</span>
                  <span className="block text-xs text-slate-500">na místě nic</span>
                </button>
                <button type="button"
                  onClick={() => set('deposit_type', 'bez_platby')}
                  className={`rounded-xl border-2 px-2 py-2.5 text-left transition ${v.deposit_type === 'bez_platby' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">Až po službě</span>
                  <span className="block text-xs text-slate-500">nic předem</span>
                </button>
              </div>

              {v.deposit_type === 'zaloha' && (() => {
                // Záloha nemůže být vyšší než cena úkonu — zákazník by zaplatil
                // předem víc, než služba stojí. Hlídáme jen u pevné ceny (u „od–do"
                // a „dohodou" cenu neznáme, tam strop nedává smysl).
                const cena = v.price_type === 'fixed' ? (v.price ?? 0) : 0
                const zaloha = v.deposit_amount ?? 0
                const moc = cena > 0 && zaloha > cena
                return (
                  <div className="mt-2 space-y-1.5">
                    <label className="form-label"><span>Výše zálohy (Kč)</span></label>
                    <input type="number" min={200} max={cena > 0 ? cena : undefined} placeholder="200"
                      value={v.deposit_amount ?? ''}
                      onChange={e => set('deposit_amount', numOrNull(e.target.value))}
                      className={`form-input bg-white ${moc ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`} />
                    {moc ? (
                      <p className="text-xs font-semibold text-red-600">
                        Záloha nemůže být vyšší než cena úkonu ({cena.toLocaleString('cs-CZ')} Kč). Snižte ji.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {cena > 0
                          ? `Minimálně 200 Kč, nejvýš ${cena.toLocaleString('cs-CZ')} Kč. Doporučujeme kolem třetiny ceny.`
                          : 'Minimálně 200 Kč. Záloha se započítá do konečné ceny.'}
                      </p>
                    )}
                  </div>
                )
              })()}
              {v.deposit_type === 'plna_platba' && (
                <p className="mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Zákazník zaplatí celou cenu úkonu předem. Na místě už nic nedoplácí.
                </p>
              )}
              {v.deposit_type === 'bez_platby' && (
                <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Zákazník předem neplatí nic — zaplatí až po službě na místě. Bez zálohy
                  nejde nastavit poplatek za nedostavení.
                </p>
              )}
            </div>

            {/* Poplatek jen když je něco zaplaceno předem — u „až po službě" není
                z čeho ho strhnout, tak ho vůbec nenabízíme. */}
            {v.deposit_type !== 'bez_platby' && (
            <div className="space-y-1.5">
              <label className="form-label flex items-center justify-between gap-1">
                <span>Poplatek, když zákazník nepřijde</span>
                <InfoTip>
                  Dvě různé situace, vyberte jednu. <strong>Nedostavení</strong> = zákazník
                  se neozve a nepřijde. <strong>Zrušení předem</strong> = dá vědět včas, ale
                  pozdě. Zákazník poplatek vidí předem u objednávky.
                </InfoTip>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button type="button"
                  onClick={() => set('fee_mode', 'zadny')}
                  className={`rounded-xl border-2 px-2 py-2 text-center text-xs font-bold transition ${v.fee_mode === 'zadny' ? 'border-emerald-500 bg-emerald-50 text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                  Žádný
                </button>
                <button type="button"
                  onClick={() => set('fee_mode', 'noshow')}
                  className={`rounded-xl border-2 px-2 py-2 text-center text-xs font-bold transition ${v.fee_mode === 'noshow' ? 'border-emerald-500 bg-emerald-50 text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                  Za nedostavení
                </button>
                <button type="button"
                  onClick={() => set('fee_mode', 'storno')}
                  className={`rounded-xl border-2 px-2 py-2 text-center text-xs font-bold transition ${v.fee_mode === 'storno' ? 'border-emerald-500 bg-emerald-50 text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                  Za zrušení předem
                </button>
              </div>

              {v.fee_mode !== 'zadny' && (
                <div className="mt-2">
                  <input type="number" min={0} placeholder="např. 300"
                    value={v.no_show_fee ?? ''}
                    onChange={e => set('no_show_fee', numOrNull(e.target.value))}
                    className="form-input bg-white" />
                  <p className="mt-1 text-xs text-slate-400">
                    {v.fee_mode === 'noshow'
                      ? `Kč (max ${MAX_NO_SHOW_FEE}), které si necháte, když zákazník nedorazí a neozve se.`
                      : 'Kč, které si necháte, když zákazník zruší příliš pozdě.'}
                  </p>
                </div>
              )}
              {v.fee_mode === 'zadny' && (
                <p className="text-xs text-slate-400">Bez poplatku — při zrušení i nedostavení se záloha vrací.</p>
              )}
            </div>
            )}

            {/* Poznámka k ceně */}
            <div className="space-y-1.5">
              <label className="form-label">Poznámka k ceně <span className="font-normal text-slate-400">(volitelné)</span></label>
              <input type="text" maxLength={200} placeholder="např. Dlouhé vlasy + 200 Kč"
                value={v.price_note ?? ''}
                onChange={e => set('price_note', e.target.value || null)}
                className="form-input bg-white" />
            </div>
          </>
        )}

        {/* ── Model B: délka + podmínky výjezdu ── */}
        {isB && (
          <>
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <span>U tohoto úkonu určíte cenu až po prohlídce. Níže nastavte, co stojí samotný výjezd a nacenění.</span>
            </div>

            <div className="space-y-1.5">
              <label className="form-label flex items-center justify-between gap-1">
                <span>Orientační délka prohlídky (min) *</span>
                <InfoTip>
                  Kolik času si na prohlídku vyhradíte. Slouží jen pro váš kalendář —
                  zákazník tuhle hodnotu nevidí jako závazek.
                </InfoTip>
              </label>
              <input type="number" min={0} placeholder="60"
                value={v.duration_minutes ?? ''}
                onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                className="form-input bg-white" />
            </div>

            {/* Podmínky výjezdu */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-1 flex items-center gap-2">
                <Truck className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-extrabold text-slate-800">Za kolik vyjedete</p>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                Zákazník tyhle podmínky uvidí, než vás poptá. Necháte-li prázdné, máte výjezd zdarma.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="form-label">Poplatek za nacenění (Kč)</label>
                  <input type="number" min={0} placeholder="500"
                    value={v.quote_fee ?? ''}
                    onChange={e => set('quote_fee', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Nabídku dodám do (dnů)</label>
                  <input type="number" min={0} max={365} placeholder="3"
                    value={v.quote_days ?? ''}
                    onChange={e => set('quote_days', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Doprava zdarma do (km)</label>
                  <input type="number" min={0} placeholder="10"
                    value={v.free_km ?? ''}
                    onChange={e => set('free_km', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Nad rámec (Kč/km)</label>
                  <input type="number" min={0} placeholder="12"
                    value={v.price_per_km ?? ''}
                    onChange={e => set('price_per_km', numOrNull(e.target.value))}
                    className="form-input" />
                </div>
              </div>

              {Number(v.quote_fee) > 0 && (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Přijme-li zákazník vaši nabídku, poplatek {Number(v.quote_fee).toLocaleString('cs-CZ')} Kč se započítá do celkové ceny.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Poznámka <span className="font-normal text-slate-400">(volitelné)</span></label>
              <input type="text" maxLength={200} placeholder="např. Zaměření zdarma v okolí Vsetína"
                value={v.price_note ?? ''}
                onChange={e => set('price_note', e.target.value || null)}
                className="form-input bg-white" />
            </div>
          </>
        )}

        {/* Nabízet zákazníkům — dřív nejasné „Zveřejnit v ceníku". */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={v.is_active}
            onChange={e => set('is_active', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Nabízet zákazníkům</span>
            <span className="block text-xs leading-relaxed text-slate-500">
              Vypněte, když úkon dočasně neděláte — zůstane vám uložený, ale v ceníku ho nikdo neuvidí.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-emerald-200 pt-4">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300">
            Zrušit
          </button>
          <button type="button" onClick={handleSave} disabled={saving || zalohaMoc} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : 'Uložit úkon'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}