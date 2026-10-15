'use client'
// components/ui/ShareSlotButton.tsx
// Tlačítko „Sdílet“ u volného termínu. Otevře menu sdílení (ShareSheet): Facebook, WhatsApp,
// Instagram Story, obrázek příspěvku, QR kód, odkaz (15. 10. 2026; dřív jen nativní sdílení / schránka).

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import ShareSheet from '@/components/ui/ShareSheet'

interface Props {
  slotId: string
  /** Popis termínu (dřív text do sdílení; text teď skládá ShareSheet z údajů termínu) */
  label?: string
  /** 'button' = plné tlačítko, 'compact' = malé vedle termínu v seznamu, 'icon' = jen ikona */
  variant?: 'button' | 'compact' | 'icon'
}

export default function ShareSlotButton({ slotId, variant = 'button' }: Props) {
  const [open, setOpen] = useState(false)
  const sheet = open ? <ShareSheet slotId={slotId} onClose={() => setOpen(false)} /> : null

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Sdílet termín"
          aria-label="Sdílet termín"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
        >
          <Share2 className="h-4 w-4" />
        </button>
        {sheet}
      </>
    )
  }

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Sdílet termín"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
        >
          <Share2 className="h-3.5 w-3.5" /> Sdílet
        </button>
        {sheet}
      </>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 bg-white px-4 py-3 font-bold text-emerald-700 transition hover:bg-emerald-50"
      >
        <Share2 className="h-4 w-4" /> Sdílet termín (Facebook, Instagram, WhatsApp…)
      </button>
      <p className="text-center text-xs leading-relaxed text-slate-400">
        Kdokoli s odkazem uvidí volný termín a může se rovnou objednat.
      </p>
      {sheet}
    </div>
  )
}
