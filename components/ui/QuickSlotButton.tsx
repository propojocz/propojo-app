'use client'
// components/ui/QuickSlotButton.tsx
// Ikona ⚡ v horní liště (jen poskytovatel): rychlé vypsání volného termínu odkudkoli.
// Okno se vykresluje přes portál do <body> – horní lišta má rozmazané pozadí a uvnitř
// ní by se „fixed“ prvek ořízl.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Zap } from 'lucide-react'
import { getQuickSlotCards, type QuickSlotCard } from '@/lib/actions/slots'
import QuickSlotForm, { type QuickSlotInitial } from '@/components/ui/QuickSlotForm'

/** Okno bleskového termínu – z horní lišty i z Kalendáře (s předvyplněnou mezerou). */
export function QuickSlotModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: QuickSlotInitial }) {
  const [mounted, setMounted] = useState(false)
  const [cards, setCards] = useState<QuickSlotCard[] | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCards(null)
    getQuickSlotCards().then((r) => { if (!cancelled) setCards(r.cards) })
    return () => { cancelled = true }
  }, [open])

  if (!open || !mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/30 px-4 pt-4 sm:pt-16" onClick={onClose}>
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full bg-white p-1.5 text-slate-500 shadow" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        </div>
        {cards === null ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
          </div>
        ) : (
          <div className="rounded-2xl shadow-xl">
            <QuickSlotForm cards={cards} onClose={onClose} initial={initial} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function QuickSlotButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10 text-orange-500 transition hover:bg-orange-50"
        aria-label="Vypsat bleskový termín"
        title="Vypsat bleskový termín – rychle jeden nebo víc volných termínů"
      >
        <Zap className="h-5 w-5 fill-orange-400" />
      </button>
      <QuickSlotModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
