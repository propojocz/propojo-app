'use client'
// components/ui/ServiceItemEditor.tsx
// Editor JEDNÉ položky ceníku (úkonu). Řízená komponenta — nezná databázi.
//
// ZPŮSOB CENY MÍSTO MODELU A/B. Poskytovatel nevybírá „platební model" — to je
// naše vnitřní dělení. Vybírá, jak se u něj cena určuje:
//     Pevná · Od–do · Dohodou · Nacením na místě
// Poslední možnost je model B, zbytek model A. Do databáze jde pořád
// payment_model + price_type jako dřív, mění se jen to, co člověk vidí.
//
// NABÍZÍ SE JEN TO, CO DÁVÁ SMYSL. „Celou cenu předem" nejde zvolit u ceny
// od–do ani u ceny dohodou — appka by nevěděla, kolik strhnout, a zákazník by
// nevěděl, co platí. Poplatek za zrušení se ukáže jen tam, kde se něco platí
// dopředu; jinak není z čeho ho vzít.
//
// Podmínky výjezdu (poplatek za nacenění, Kč/km, doprava zdarma, lhůta) patří
// k úkonu, ne ke kartě.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, X, Truck, Tag, ChevronDown, AlertTriangle } from 'lucide-react'
import { PRICE_UNIT_LABELS } from '@/types/database'
import InfoTip from '@/components/ui/InfoTip'
import type { PaymentModel, PriceType, PriceUnit } from '@/types/database'

// Typy služeb nabídnuté z podkategorií karty (pro našeptávač názvu).
export interface ServiceTypeOption {
  id: string
  name: string
}

// Strop poplatku za nedostavení/zrušení — ochrana zákazníka. Jedno místo
// pro celou platformu; kdyby se měl měnit, měň tady.
const MAX_NO_SHOW_FEE = 1000
const MIN_DEPOSIT = 200

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
  // Podmínky výjezdu — jen nacenění na místě
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
  deposit_amount: MIN_DEPOSIT,
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

/** Způsob ceny, jak ho vidí poskytovatel. Do DB se překládá na model + price_type. */
type ZpusobCeny = 'pevna' | 'rozmezi' | 'dohodou' | 'naceneni'

const ZPUSOBY: { id: ZpusobCeny; popis: string }[] = [
  { id: 'pevna', popis: 'Pevná cena' },
  { id: 'rozmezi', popis: 'Od–do' },
  { id: 'dohodou', popis: 'Dohodou' },
  { id: 'naceneni', popis: 'Nacením na místě' },
]

function zpusobZHodnot(v: ServiceItemValues): ZpusobCeny {
  if (v.payment_model === 'B') return 'naceneni'
  if (v.price_type === 'range') return 'rozmezi'
  if (v.price_type === 'on_agreement') return 'dohodou'
  return 'pevna'
}

export default function ServiceItemEditor({
  initial, serviceTypes, subcategoryName = null, saving = false, onSave, onCancel,
}: Props) {
  const [v, setV] = useState<ServiceItemValues>({ ...EMPTY, ...initial })
  const [error, setError] = useState<string | null>(null)
  const [detailyOtevrene, setDetailyOtevrene] = useState(false)

  const set = <K extends keyof ServiceItemValues>(key: K, val: ServiceItemValues[K]) =>
    setV(prev => ({ ...prev, [key]: val }))

  const zpusob = zpusobZHodnot(v)
  const jeNaceneni = zpusob === 'naceneni'
  const jePevna = zpusob === 'pevna'

  // „Celou cenu předem" jen u pevné ceny. Jinde cenu neznáme dopředu.
  const lzeCelaPlatba = jePevna
  const platba = v.deposit_type

  // Záloha vyšší než cena úkonu (jen pevná cena) — blokuje uložení.
  const zalohaMoc =
    platba === 'zaloha' && jePevna && (v.price ?? 0) > 0 && (v.deposit_amount ?? 0) > (v.price ?? 0)

  // Délka je potřeba tam, kde se objednává čas — podle ní se počítá termín.
  const potrebaDelku = !jeNaceneni && (v.price_unit === 'ukon' || v.price_unit === 'hod')

  const prepniZpusob = (z: ZpusobCeny) => {
    setV(prev => {
      const next = { ...prev }
      if (z === 'naceneni') {
        next.payment_model = 'B'
        next.price_type = 'on_agreement'
      } else {
        next.payment_model = 'A'
        next.price_type = z === 'rozmezi' ? 'range' : z === 'dohodou' ? 'on_agreement' : 'fixed'
      }
      // Když cenu předem neznáme, celá platba přestává dávat smysl.
      if (z !== 'pevna' && next.deposit_type === 'plna_platba') next.deposit_type = 'zaloha'
      return next
    })
  }

  const handleSave = () => {
    if (!v.name || v.name.trim().length < 2) { setError('Zadejte název úkonu.'); return }
    if (jePevna && (v.price == null || v.price <= 0)) {
      setError('Zadejte cenu, nebo přepněte na „Dohodou".'); return
    }
    if (zpusob === 'rozmezi' && ((v.price ?? 0) <= 0 || (v.price_max ?? 0) <= (v.price ?? 0))) {
      setError('U rozmezí zadejte cenu od a vyšší cenu do.'); return
    }
    if (potrebaDelku && (v.duration_minutes == null || v.duration_minutes <= 0)) {
      setError('Zadejte délku úkonu — podle ní se v kalendáři počítá termín.'); return
    }
    if (zalohaMoc) { setError('Záloha nemůže být vyšší než cena úkonu.'); return }
    setError(null)

    // Očištění hodnot — ať do databáze nejdou nesmysly.
    const out: ServiceItemValues = { ...v, name: v.name.trim() }

    if (jeNaceneni) {
      out.payment_model = 'B'
      out.price_type = 'on_agreement'
      out.price = null
      out.price_max = null
      out.deposit_amount = null
      out.deposit_type = 'zaloha'
      out.no_show_fee = null
      out.fee_mode = 'noshow'
      out.price_includes_material = true
    } else {
      out.payment_model = 'A'
      if (zpusob === 'dohodou') { out.price = null; out.price_max = null }
      if (zpusob !== 'rozmezi') out.price_max = null

      if (out.deposit_type === 'bez_platby') {
        out.deposit_amount = null
        out.no_show_fee = null
        out.fee_mode = 'zadny'
      } else if (out.deposit_type === 'plna_platba') {
        out.deposit_amount = null   // platí se celá cena, záloha se neřeší
      } else {
        if (out.deposit_amount == null || out.deposit_amount < MIN_DEPOSIT) out.deposit_amount = MIN_DEPOSIT
        if (jePevna && out.price != null && out.price > 0 && out.deposit_amount > out.price) {
          out.deposit_amount = out.price
        }
      }

      if (out.fee_mode == null) out.fee_mode = 'noshow'
      if (out.fee_mode === 'zadny') out.no_show_fee = null
      if (out.no_show_fee != null && out.no_show_fee <= 0) out.no_show_fee = null
      if (out.no_show_fee != null && out.no_show_fee > MAX_NO_SHOW_FEE) out.no_show_fee = MAX_NO_SHOW_FEE

      // Výjezdové podmínky patří jen k naceňovacímu úkonu.
      out.quote_fee = null
      out.price_per_km = null
      out.free_km = null
      out.quote_days = null
    }

    out.price_note = out.price_note?.trim() || null
    onSave(out)
  }

  // ── Souhrn: co uvidí zákazník ──
  const castka = jeNaceneni
    ? 'nacenění na místě'
    : zpusob === 'dohodou'
      ? 'cena dohodou'
      : zpusob === 'rozmezi'
        ? `${Number(v.price ?? 0).toLocaleString('cs-CZ')} – ${Number(v.price_max ?? 0).toLocaleString('cs-CZ')} Kč`
        : `${Number(v.price ?? 0).toLocaleString('cs-CZ')} Kč`
  const jednotka = !jeNaceneni && v.price_unit !== 'ukon' ? ` ${PRICE_UNIT_LABELS[v.price_unit] ?? ''}` : ''
  const platbaText = jeNaceneni
    ? null
    : platba === 'zaloha'
      ? `záloha ${Number(v.deposit_amount ?? 0).toLocaleString('cs-CZ')} Kč`
      : platba === 'plna_platba' ? 'platba předem' : 'platí až po službě'

  const btn = (aktivni: boolean, disabled = false) =>
    `rounded-xl border-[1.5px] px-3 py-2.5 text-left transition ${
      disabled
        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
        : aktivni
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 bg-white hover:border-emerald-300'
    }`

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/60"
    >
      <div className="space-y-5 p-4 sm:p-5">

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-emerald-800">
            {v.id ? 'Upravit úkon' : 'Nový úkon'}
          </h4>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Zrušit">
            <X className="h-4 w-4" />
          </button>
        </div>

        {subcategoryName && (
          <p className="flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-500">
            <Tag className="h-3.5 w-3.5 text-slate-400" />
            Patří k <strong className="text-slate-700">{subcategoryName}</strong>
          </p>
        )}

        {/* ── 1. CO TO JE ── */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Co to je?</label>
          <input
            type="text"
            value={v.name}
            onChange={e => set('name', e.target.value)}
            maxLength={80}
            placeholder="např. Pánský střih"
            className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />
          {serviceTypes.length > 0 && !v.name && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {serviceTypes.slice(0, 8).map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => { set('name', st.name); set('service_type_id', st.id) }}
                  className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                  {st.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 2. KOLIK TO STOJÍ ── */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Kolik to stojí?</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {ZPUSOBY.map(z => (
              <button
                key={z.id}
                type="button"
                onClick={() => prepniZpusob(z.id)}
                className={`rounded-xl border-[1.5px] px-2 py-2 text-center text-[12.5px] font-bold transition ${
                  zpusob === z.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                }`}
              >
                {z.popis}
              </button>
            ))}
          </div>

          {/* Pevná cena */}
          {jePevna && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Cena (Kč)</label>
                <input type="number" min={0} value={v.price ?? ''} onChange={e => set('price', numOrNull(e.target.value))}
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Za co</label>
                <select value={v.price_unit} onChange={e => set('price_unit', e.target.value as PriceUnit)}
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500">
                  {PRICE_UNITS.map(u => <option key={u} value={u}>{PRICE_UNIT_LABELS[u] ?? u}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Rozmezí */}
          {zpusob === 'rozmezi' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Od (Kč)</label>
                <input type="number" min={0} value={v.price ?? ''} onChange={e => set('price', numOrNull(e.target.value))}
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Do (Kč)</label>
                <input type="number" min={0} value={v.price_max ?? ''} onChange={e => set('price_max', numOrNull(e.target.value))}
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}

          {/* Délka — všude, kde se objednává čas */}
          {potrebaDelku && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Jak dlouho (min)</label>
              <input type="number" min={0} step={5} value={v.duration_minutes ?? ''} onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                placeholder="45"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
              <p className="mt-1 text-[11.5px] text-slate-400">Podle délky poznáme, do kterých volných oken se úkon vejde.</p>
            </div>
          )}

          {/* Nacenění na místě */}
          {jeNaceneni && (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Truck className="h-3.5 w-3.5 text-slate-400" /> Podmínky výjezdu
                <InfoTip>Zákazník je vidí předem u objednávky. Cenu určíte až po prohlídce.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Za nacenění (Kč)</label>
                  <input type="number" min={0} value={v.quote_fee ?? ''} onChange={e => set('quote_fee', numOrNull(e.target.value))}
                    placeholder="0 = zdarma"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Prohlídka (min)</label>
                  <input type="number" min={0} step={15} value={v.duration_minutes ?? ''} onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                    placeholder="60"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Doprava zdarma do (km)</label>
                  <input type="number" min={0} value={v.free_km ?? ''} onChange={e => set('free_km', numOrNull(e.target.value))}
                    placeholder="10"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Dál pak (Kč/km)</label>
                  <input type="number" min={0} value={v.price_per_km ?? ''} onChange={e => set('price_per_km', numOrNull(e.target.value))}
                    placeholder="12"
                    className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Nabídku dodám do (dnů)</label>
                <input type="number" min={0} value={v.quote_days ?? ''} onChange={e => set('quote_days', numOrNull(e.target.value))}
                  placeholder="3"
                  className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}
        </div>

        {/* ── 3. PLATBA PŘEDEM ── */}
        {!jeNaceneni && (
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Co zákazník platí předem?</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => set('deposit_type', 'zaloha')} className={btn(platba === 'zaloha')}>
                <b className="block text-[13px] text-slate-900">Zálohu</b>
                <span className="block text-[11px] text-slate-500">zbytek na místě</span>
              </button>
              <button
                type="button"
                disabled={!lzeCelaPlatba}
                onClick={() => lzeCelaPlatba && set('deposit_type', 'plna_platba')}
                className={btn(platba === 'plna_platba', !lzeCelaPlatba)}
              >
                <b className="block text-[13px] text-slate-900">Celou cenu</b>
                <span className="block text-[11px] text-slate-500">na místě už nic</span>
              </button>
              <button type="button" onClick={() => set('deposit_type', 'bez_platby')} className={btn(platba === 'bez_platby')}>
                <b className="block text-[13px] text-slate-900">Nic</b>
                <span className="block text-[11px] text-slate-500">platí až po službě</span>
              </button>
            </div>

            {!lzeCelaPlatba && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>Celou cenu předem</strong> jde vybrat jen u pevné ceny — jinak zákazník neví, kolik platí.</span>
              </p>
            )}

            {platba === 'zaloha' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Výše zálohy (Kč)</label>
                <input type="number" min={MIN_DEPOSIT} value={v.deposit_amount ?? ''} onChange={e => set('deposit_amount', numOrNull(e.target.value))}
                  className={`w-full rounded-xl border-[1.5px] bg-white px-3 py-2.5 outline-none focus:border-emerald-500 ${zalohaMoc ? 'border-red-400' : 'border-slate-200'}`} />
                <p className="mt-1 text-[11.5px] text-slate-400">
                  Nejméně {MIN_DEPOSIT} Kč{jePevna && (v.price ?? 0) > 0 ? `, nejvýš ${Number(v.price).toLocaleString('cs-CZ')} Kč` : ''}. Započítá se do konečné ceny.
                </p>
              </div>
            )}

            {platba === 'bez_platby' && (
              <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
                Bez platby předem nejde nastavit poplatek za nedostavení — není z čeho ho strhnout.
              </p>
            )}
          </div>
        )}

        {/* ── 4. KDYŽ ZÁKAZNÍK NEPŘIJDE ── */}
        {!jeNaceneni && platba !== 'bez_platby' && (
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Když zákazník nepřijde</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => set('fee_mode', 'zadny')} className={btn(v.fee_mode === 'zadny')}>
                <b className="block text-[13px] text-slate-900">Nic neúčtuji</b>
                <span className="block text-[11px] text-slate-500">záloha se vrací</span>
              </button>
              <button type="button" onClick={() => set('fee_mode', 'noshow')} className={btn(v.fee_mode === 'noshow')}>
                <b className="block text-[13px] text-slate-900">Nedorazí</b>
                <span className="block text-[11px] text-slate-500">a neozve se</span>
              </button>
              <button type="button" onClick={() => set('fee_mode', 'storno')} className={btn(v.fee_mode === 'storno')}>
                <b className="block text-[13px] text-slate-900">Zruší pozdě</b>
                <span className="block text-[11px] text-slate-500">dá vědět, ale těsně</span>
              </button>
            </div>

            {v.fee_mode !== 'zadny' && (
              <div className="mt-3">
                <input type="number" min={0} max={MAX_NO_SHOW_FEE} value={v.no_show_fee ?? ''} onChange={e => set('no_show_fee', numOrNull(e.target.value))}
                  placeholder="např. 300"
                  className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500" />
                <p className="mt-1 text-[11.5px] text-slate-400">
                  Kolik si necháte ze zálohy. Nejvýš {MAX_NO_SHOW_FEE.toLocaleString('cs-CZ')} Kč. Zákazník to vidí u objednávky.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Nepovinné ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setDetailyOtevrene(o => !o)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
          >
            <span className="text-[12.5px] font-semibold text-slate-700">Materiál a poznámka</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${detailyOtevrene ? 'rotate-180' : ''}`} />
          </button>

          {detailyOtevrene && (
            <div className="space-y-3 border-t border-slate-100 p-3.5">
              {!jeNaceneni && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Je v ceně materiál?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => set('price_includes_material', true)}
                      className={btn(v.price_includes_material === true)}>
                      <b className="block text-[12.5px] text-slate-900">Ano, včetně</b>
                      <span className="block text-[11px] text-slate-500">nic se nedoplácí</span>
                    </button>
                    <button type="button" onClick={() => set('price_includes_material', false)}
                      className={btn(v.price_includes_material === false)}>
                      <b className="block text-[12.5px] text-slate-900">Účtuji zvlášť</b>
                      <span className="block text-[11px] text-slate-500">jen práce</span>
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Poznámka k ceně</label>
                <input type="text" maxLength={120} value={v.price_note ?? ''} onChange={e => set('price_note', e.target.value || null)}
                  placeholder="např. u dlouhých vlasů příplatek 100 Kč"
                  className="w-full rounded-xl border-[1.5px] border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}
        </div>

        {/* ── Souhrn: co uvidí zákazník ── */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-slate-900 px-3.5 py-2.5 text-[13px] text-white">
          <strong>{v.name.trim() || 'Úkon'}</strong>
          <span className="text-white/30">·</span>
          <span>{castka}{jednotka}</span>
          {potrebaDelku && v.duration_minutes ? (
            <><span className="text-white/30">·</span><span className="text-emerald-200">{v.duration_minutes} min</span></>
          ) : null}
          {platbaText && (
            <><span className="text-white/30">·</span><span className="text-emerald-200">{platbaText}</span></>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300">
            Zrušit
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : (v.id ? 'Uložit změny' : 'Přidat úkon do ceníku')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}