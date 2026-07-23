'use client'
// components/ui/ShareSlotButton.tsx
// Sdílení odkazu na volný termín. Na mobilu použije nativní sdílení (Web Share API) —
// poskytovatel klikne a rovnou vybere Instagram / WhatsApp, bez kopírování a vkládání.
// Na desktopu (a kde Web Share není) zkopíruje odkaz do schránky.

import { useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'

interface Props {
  slotId: string
  /** Text nabídky do sdílení — např. „Pátek 14:00–16:00, Salon Bella" */
  label?: string
  /** 'button' = plné tlačítko, 'compact' = malé vedle termínu v seznamu */
  variant?: 'button' | 'compact'
}

export default function ShareSlotButton({ slotId, label, variant = 'button' }: Props) {
  const [done, setDone] = useState(false)

  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/termin/${slotId}`
    : `/termin/${slotId}`

  const share = async () => {
    const shareText = label
      ? `Uvolnil se mi termín: ${label}. Kdo dřív přijde…`
      : 'Uvolnil se mi termín — kdo dřív přijde…'

    // Nativní sdílení (mobil): rovnou do Instagramu, WhatsAppu, zpráv…
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Volný termín', text: shareText, url })
        return
      } catch {
        // Uživatel sdílení zavřel — nic neděláme.
        return
      }
    }

    // Fallback: do schránky
    try {
      await navigator.clipboard.writeText(url)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      // Když ani schránka nejde, aspoň odkaz ukážeme k ručnímu zkopírování.
      window.prompt('Zkopírujte odkaz:', url)
    }
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={share}
        title="Sdílet odkaz na termín"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
      >
        {done ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Zkopírováno</> : <><Share2 className="h-3.5 w-3.5" /> Sdílet</>}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={share}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 bg-white px-4 py-3 font-bold text-emerald-700 transition hover:bg-emerald-50"
      >
        {done
          ? <><Check className="h-4 w-4" /> Odkaz zkopírován</>
          : <><Share2 className="h-4 w-4" /> Sdílet termín (Instagram, WhatsApp…)</>}
      </button>
      <p className="text-center text-xs leading-relaxed text-slate-400">
        Kdokoli s odkazem uvidí volný termín a může se rovnou objednat.
      </p>
    </div>
  )
}