'use client'
// components/ui/ServiceItemEditor.tsx
// Editor JEDNÉ položky ceníku (úkonu). Řízená komponenta — nezná databázi.
// Dostane počáteční hodnoty a service_types nabídnuté z podkategorií karty,
// vrátí hotové hodnoty přes onSave. Ukládání do DB řeší volající.
//
// Model A/B je zde NA ÚROVNI POLOŽKY (odsouhlaseno): jedna karta může mít
// „Zaměření 1 500 Kč" (A) i „Výjezd a nacenění" (B) zároveň.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Info, Loader2, X } from 'lucide-react'
import { PRICE_UNIT_LABELS } from '@/types/database'
import type { PaymentModel, PriceType, PriceUnit } from '@/types/database'

// Typy služeb nabídnuté z podkategorií karty (pro našeptávač názvu).
export interface ServiceTypeOption {
  id: string
  name: string
}

// Hodnoty jedné položky, se kterými editor pracuje.
export interface ServiceItemValues {
  id?: string                      // vyplněné jen u existující položky (režim úpravy)
  service_type_id: string | null
  name: string
  payment_model: PaymentModel
  price_type: PriceType
  price: number | null
  price_unit: PriceUnit
  price_max: number | null
  duration_minutes: number | null
  deposit_amount: number | null
  price_includes_material: boolean
  price_note: string | null
  is_active: boolean
}

interface Props {
  initial?: Partial<ServiceItemValues>
  serviceTypes: ServiceTypeOption[]
  saving?: boolean
  onSave: (values: ServiceItemValues) => void
  onCancel: () => void
}

const PRICE_UNITS: PriceUnit[] = ['ukon', 'hod', 'kus', 'm2', 'bm', 'den', 'projekt']

const EMPTY: ServiceItemValues = {
  service_type_id: null,
  name: '',
  payment_model: 'A',
  price_type: 'fixed',
  price: null,
  price_unit: 'ukon',
  price_max: null,
  duration_minutes: null,
  deposit_amount: 200,
  price_includes_material: true,
  price_note: null,
  is_active: true,
}

const numOrNull = (v: string): number | null => (v === '' || v == null ? null : Number(v))

export default function ServiceItemEditor({ initial, serviceTypes, saving = false, onSave, onCancel }: Props) {
  const [v, setV] = useState<ServiceItemValues>({ ...EMPTY, ...initial })
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ServiceItemValues>(key: K, val: ServiceItemValues[K]) =>
    setV(prev => ({ ...prev, [key]: val }))

  const isB = v.payment_model === 'B'
  const isOnAgreement = v.price_type === 'on_agreement'

  // Výběr typu z katalogu předvyplní název (jde přepsat).
  const pickType = (id: string) => {
    if (id === '__custom__') {
      set('service_type_id', null)
      return
    }
    const t = serviceTypes.find(s => s.id === id)
    set('service_type_id', id)
    if (t && (!v.name || v.name.trim() === '')) set('name', t.name)
  }

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
    if (v.duration_minutes == null || v.duration_minutes <= 0) {
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
      out.price_includes_material = true
      out.price_note = out.price_note?.trim() || null
    } else {
      if (isOnAgreement) { out.price = null; out.price_max = null }
      if (out.price_type !== 'range') out.price_max = null
      if (out.deposit_amount != null && out.deposit_amount < 200) out.deposit_amount = 200
      if (out.deposit_amount == null) out.deposit_amount = 200
      out.price_note = out.price_note?.trim() || null
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

        {/* Výběr z katalogu */}
        <div className="space-y-1.5">
          <label className="form-label">Vyberte úkon z katalogu</label>
          <select
            value={v.service_type_id ?? '__custom__'}
            onChange={e => pickType(e.target.value)}
            className="form-input bg-white"
          >
            <option value="__custom__">Vlastní úkon (nenajdu ho v seznamu)</option>
            {serviceTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">
            Nabízíme jen úkony z podkategorií vaší karty. Název pak můžete přepsat.
          </p>
        </div>

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
          <label className="form-label">Jak se za tento úkon platí? *</label>
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
              <p className="pl-5.5 text-xs leading-relaxed text-slate-500">Zákazník rezervuje termín a zaplatí zálohu.</p>
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
              <p className="pl-5.5 text-xs leading-relaxed text-slate-500">Přijedete se podívat, cenu určíte na místě.</p>
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
                <label className="form-label">Jednotka ceny *</label>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="form-label">Cena (Kč) *</label>
                  <input type="number" min={0} placeholder="600"
                    value={v.price ?? ''}
                    onChange={e => set('price', numOrNull(e.target.value))}
                    className="form-input bg-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Délka (min) *</label>
                  <input type="number" min={0} placeholder="45"
                    value={v.duration_minutes ?? ''}
                    onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                    className="form-input bg-white" />
                </div>
              </div>
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
                <label className="form-label">Co je v ceně?</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    { value: true,  title: 'Včetně materiálu', desc: 'Zákazník nic nedoplácí' },
                    { value: false, title: 'Jen práce',        desc: 'Materiál účtuji zvlášť' },
                  ] as const).map(opt => {
                    const sel = v.price_includes_material === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => set('price_includes_material', opt.value)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          sel ? 'border-emerald-500 bg-white' : 'border-slate-200 bg-white hover:border-emerald-300'
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

            {/* Záloha */}
            <div className="space-y-1.5">
              <label className="form-label">Rezervační záloha (Kč)</label>
              <input type="number" min={200} placeholder="200"
                value={v.deposit_amount ?? ''}
                onChange={e => set('deposit_amount', numOrNull(e.target.value))}
                className="form-input bg-white" />
              <p className="text-xs text-slate-400">Minimálně 200 Kč. Záloha se započítá do konečné ceny.</p>
            </div>

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

        {/* ── Model B: jen délka a poznámka ── */}
        {isB && (
          <>
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <span>U tohoto úkonu určíte cenu až po prohlídce. Podmínky výjezdu (poplatek, doprava) se berou z nastavení karty.</span>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Orientační délka prohlídky (min) *</label>
              <input type="number" min={0} placeholder="60"
                value={v.duration_minutes ?? ''}
                onChange={e => set('duration_minutes', numOrNull(e.target.value))}
                className="form-input bg-white" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Poznámka <span className="font-normal text-slate-400">(volitelné)</span></label>
              <input type="text" maxLength={200} placeholder="např. Zaměření zdarma, nacenění do 3 dnů"
                value={v.price_note ?? ''}
                onChange={e => set('price_note', e.target.value || null)}
                className="form-input bg-white" />
            </div>
          </>
        )}

        {/* Zveřejnit */}
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={v.is_active}
            onChange={e => set('is_active', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-semibold text-slate-700">Zveřejnit v ceníku</span>
        </label>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-emerald-200 pt-4">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300">
            Zrušit
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</> : 'Uložit úkon'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}