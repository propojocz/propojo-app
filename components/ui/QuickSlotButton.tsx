'use client'
// components/ui/QuickSlotButton.tsx
// Ikona ⚡ v horní liště (jen poskytovatel): rychlé vypsání volného termínu odkudkoli.
// Okno se vykresluje přes portál do <body> – horní lišta má rozmazané pozadí a uvnitř
// ní by se „fixed“ prvek ořízl.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Zap } from 'lucide-react'
import { getQuickSlotCards } from '@/lib/actions/slots'
import QuickSlotForm from '@/components/ui/QuickSlotForm'

export default function QuickSlotButton() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [cards, setCards] = useState<{ id: string; title: string }[] | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCards(null)
    getQuickSlotCards().then((r) => { if (!cancelled) setCards(r.cards) })
    return () => { cancelled = true }
  }, [open])

  const modal = open ? (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/30 px-4 pt-20" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white p-1.5 text-slate-500 shadow" aria-label="Zavřít">
            <X className="h-4 w-4" />
          </button>
        </div>
        {cards === null ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
          </div>
        ) : (
          <div className="rounded-2xl shadow-xl">
            <QuickSlotForm cards={cards} onClose={() => setOpen(false)} />
          </div>
        )}
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-orange-500 transition hover:bg-orange-50"
        aria-label="Vypsat volný termín"
        title="Vypsat volný termín"
      >
        <Zap className="h-5 w-5 fill-orange-400" />
      </button>
      {mounted && modal && createPortal(modal, document.body)}
    </>
  )
}
