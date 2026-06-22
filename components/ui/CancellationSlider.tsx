'use client'
// components/ui/CancellationSlider.tsx
// Posuvník mezi 4 stupni storno politiky. Pod ním se ukáže znění zvoleného stupně.

import { CANCELLATION_LEVELS, cancellationIndex, type CancellationKey } from '@/lib/cancellation'
import { ShieldOff, Shield } from 'lucide-react'

interface Props {
  value: CancellationKey | string | null
  onChange: (key: CancellationKey) => void
}

export default function CancellationSlider({ value, onChange }: Props) {
  const idx = cancellationIndex(value)
  const current = CANCELLATION_LEVELS[idx]
  const isOff = current.key === 'zadna'

  return (
    <div className="space-y-3">
      {/* Posuvník */}
      <input
        type="range"
        min={0}
        max={CANCELLATION_LEVELS.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(CANCELLATION_LEVELS[Number(e.target.value)].key)}
        className="w-full accent-emerald-500"
      />

      {/* Popisky stupňů */}
      <div className="flex justify-between text-xs font-semibold">
        {CANCELLATION_LEVELS.map((lvl, i) => (
          <button
            key={lvl.key}
            type="button"
            onClick={() => onChange(lvl.key)}
            className={`transition-colors ${i === idx ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {lvl.label}
          </button>
        ))}
      </div>

      {/* Znění zvoleného stupně */}
      <div className={`flex gap-2.5 rounded-xl border p-4 ${isOff ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50'}`}>
        {isOff ? (
          <ShieldOff className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <Shield className="h-5 w-5 shrink-0 text-emerald-600" />
        )}
        <div>
          <p className={`text-sm font-bold ${isOff ? 'text-slate-600' : 'text-emerald-800'}`}>{current.label} — {current.short}</p>
          <p className={`mt-0.5 text-sm ${isOff ? 'text-slate-500' : 'text-emerald-700'}`}>{current.detail}</p>
        </div>
      </div>
    </div>
  )
}