'use client'
// components/ui/BrandPicker.tsx
// Připne/odepne kartu ke značce. Nabízí jen značky, kde je uživatel
// potvrzeným členem. Data si načítá sám podle serviceId — dá se proto
// vložit i do klientského formuláře jako <BrandPicker serviceId={id} />.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Loader2 } from 'lucide-react'
import { setServiceBrand, getBrandPickerData } from '@/lib/actions/brands'

type BrandOption = { id: string; name: string }

export default function BrandPicker({ serviceId }: { serviceId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [myBrands, setMyBrands] = useState<BrandOption[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Načteme aktuální značku karty + značky, kde jsem člen.
  useEffect(() => {
    let alive = true
    getBrandPickerData(serviceId).then(data => {
      if (!alive) return
      setMyBrands(data.myBrands)
      setSelected(data.currentBrandId)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [serviceId])

  // Ještě načítáme, nebo poskytovatel není v žádné značce → nic neukazujeme.
  if (loading) return null
  if (myBrands.length === 0 && !selected) return null

  const pick = async (brandId: string | null) => {
    setSaving(brandId ?? 'none'); setErr(null)
    const res = await setServiceBrand(serviceId, brandId)
    setSaving(null)
    if (res.success) { setSelected(brandId); router.refresh() }
    else setErr(res.error)
  }

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <Building2 className="h-4 w-4 text-slate-400" /> Značka
      </label>
      <p className="mb-2.5 text-xs text-slate-400">
        Karta se může zobrazovat pod jménem vašeho salonu nebo firmy. Ceník i kalendář zůstávají vaše.
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Bez značky */}
        <button
          type="button"
          onClick={() => pick(null)}
          disabled={saving !== null}
          className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
            selected === null ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          {saving === 'none' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (selected === null && <Check className="h-3.5 w-3.5" />)}
          Bez značky
        </button>

        {myBrands.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => pick(b.id)}
            disabled={saving !== null}
            className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
              selected === b.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {saving === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (selected === b.id && <Check className="h-3.5 w-3.5" />)}
            {b.name}
          </button>
        ))}
      </div>

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  )
}