'use client'
// components/ui/BillingSettings.tsx
// Fakturace zákazníkům — nastavení poskytovatele.
//
// Zatím jen NASTAVENÍ. Doklady se nevystavují, dokud nepotvrdíme pravidla
// s právničkou/účetní; proto je u automatického vystavení jasně napsáno,
// že se funkce teprve připravuje — ať poskytovatel nečeká doklad, který
// zatím nepřijde.

import { useState } from 'react'
import { Loader2, Check, FileText, Info } from 'lucide-react'
import { saveBillingSettings, type BillingSettings as Settings } from '@/lib/actions/billing'

interface Props {
  initial: Settings | null
  /** Náhled dalšího čísla, spočítaný na serveru. */
  nextNumberPreview?: string | null
}

export default function BillingSettings({ initial, nextNumberPreview }: Props) {
  const [mode, setMode] = useState<'propojo' | 'own'>(
    initial?.billing_mode === 'propojo' ? 'propojo' : 'own'
  )
  const [name, setName] = useState(initial?.billing_name ?? '')
  const [ico, setIco] = useState(initial?.billing_ico ?? '')
  const [dic, setDic] = useState(initial?.billing_dic ?? '')
  const [address, setAddress] = useState(initial?.billing_address ?? '')
  const [registry, setRegistry] = useState(initial?.billing_registry ?? '')
  const [prefix, setPrefix] = useState(initial?.invoice_prefix ?? `${new Date().getFullYear()}-`)
  const [auto, setAuto] = useState(initial?.invoice_auto === true)
  const [neplatce, setNeplatce] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    const res = await saveBillingSettings({
      billing_mode: mode,
      billing_name: name,
      billing_ico: ico,
      billing_dic: dic,
      billing_address: address,
      billing_registry: registry,
      invoice_prefix: prefix,
      invoice_auto: auto,
    })
    setSaving(false)
    if (res.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError(res.error)
    }
  }

  const input = 'w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-emerald-500'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <FileText className="h-5 w-5 text-emerald-600" />
        <h2 className="font-black text-slate-900">Fakturace zákazníkům</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Jak chcete řešit faktury pro své zákazníky?
      </p>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setMode('propojo')}
          className={`w-full rounded-xl border-2 p-4 text-left transition ${
            mode === 'propojo' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'
          }`}
        >
          <p className="text-sm font-bold text-slate-900">Automaticky přes Propojo</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Pro neplátce DPH. Doklad vytvoříme z údajů objednávky — nemusíte nic přepisovat.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode('own')}
          className={`w-full rounded-xl border-2 p-4 text-left transition ${
            mode === 'own' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'
          }`}
        >
          <p className="text-sm font-bold text-slate-900">Používám vlastní systém</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Faktury si vystavuji sám. Propojo za vás nic vystavovat nebude.
          </p>
        </button>

        <p className="px-1 pt-1 text-xs text-slate-400">
          Napojení na Fakturoid připravujeme.
        </p>
      </div>

      {mode === 'propojo' && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Fakturační jméno nebo název *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Martina Nováková" className={input} />
            <p className="mt-1 text-[11px] text-slate-400">
              Přesně tak, jak to má být na dokladu — ne marketingový název karty.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">IČO *</label>
              <input
                value={ico}
                onChange={(e) => setIco(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="12345678"
                inputMode="numeric"
                className={input}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                DIČ <span className="font-normal text-slate-400">(nepovinné)</span>
              </label>
              <input value={dic} onChange={(e) => setDic(e.target.value)} placeholder="CZ12345678" className={input} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Sídlo *</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Bezručova 208, 756 61 Rožnov pod Radhoštěm" className={input} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Zápis v rejstříku <span className="font-normal text-slate-400">(nepovinné)</span>
            </label>
            <input
              value={registry}
              onChange={(e) => setRegistry(e.target.value)}
              placeholder="Zapsána v živnostenském rejstříku…"
              className={input}
            />
          </div>

          {/* Neplátce DPH je zatím podmínka, ne volba. */}
          <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={neplatce}
              onChange={(e) => setNeplatce(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              <strong className="text-slate-800">Nejsem plátce DPH.</strong> Zatím umíme vystavovat
              doklady jen neplátcům. Jste-li plátce, zvolte prosím „Používám vlastní systém“ —
              doklad plátce má víc náležitostí a chyba by šla k vaší tíži.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Prefix číselné řady</label>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="2026-" className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Další číslo</label>
              <div className="rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-500">
                {nextNumberPreview ?? `${prefix}0001`}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Pořadové číslo přiděluje systém, aby v řadě nevznikly díry ani duplicity.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              Vystavit doklad automaticky po zaplacení objednávky
            </span>
          </label>

          <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Údaje si teď uložíme, ale <strong>doklady zatím nevystavujeme</strong> — dolaďujeme
              s účetní správné náležitosti a postup u vratek. Dáme vám vědět, jakmile to spustíme.
            </span>
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || (mode === 'propojo' && !neplatce)}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
          : saved ? <><Check className="h-4 w-4" /> Uloženo</>
          : 'Uložit nastavení'}
      </button>
      {mode === 'propojo' && !neplatce && (
        <p className="mt-2 text-xs text-amber-700">
          Jste-li plátce DPH, zvolte prosím „Používám vlastní systém“.
        </p>
      )}
    </div>
  )
}