'use client'
// components/ui/FreeSlotReminder.tsx
// Připomínka na dashboardu: „máte volný termín, o kterém nikdo neví".
//
// Ukazuje se jen tehdy, když má poskytovatel volné okno v nejbližších dnech
// a ještě na něj nikoho neupozornil. Jakmile rozešle, zmizí — nemá otravovat.
//
// Proč na dashboardu a ne až v Termínech: poskytovatel nesedí u počítače a
// nehledá funkce. Vypadne mu klient, vytáhne telefon — a tohle je první věc,
// kterou po přihlášení uvidí.

import { useState } from 'react'
import Link from 'next/link'
import { Megaphone, CalendarDays, ArrowRight } from 'lucide-react'
import SlotNotifyPanel from '@/components/ui/SlotNotifyPanel'

export interface ReminderSlot {
  id: string
  /** „so 25. 7. · 14:00–16:00" */
  label: string
  /** Názvy karet nabízených v okně */
  services: string
  /** Kolik dalších volných oken čeká bez upozornění */
  moreCount: number
}

export default function FreeSlotReminder({ slot }: { slot: ReminderSlot }) {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <SlotNotifyPanel
        slotId={slot.id}
        label={slot.label}
        onClose={() => setOpen(false)}
      />
    )
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
            <Megaphone className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900">Máte volný termín, o kterém nikdo neví</p>
            <p className="mt-0.5 text-sm text-slate-600">
              <strong className="text-slate-900">{slot.label}</strong>
              {slot.services && <span className="text-slate-500"> · {slot.services}</span>}
            </p>
            {slot.moreCount > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                a další {slot.moreCount} {slot.moreCount === 1 ? 'okno' : slot.moreCount < 5 ? 'okna' : 'oken'} bez upozornění
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 font-bold text-white transition hover:bg-emerald-600"
          >
            <Megaphone className="h-4 w-4" /> Nabídnout zákazníkům
          </button>
          <Link
            href="/dashboard/terminy"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
          >
            Termíny <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Prázdný stav — poskytovatel nemá vypsané žádné volné okno. */
export function NoFreeSlotHint() {
  return (
    <Link
      href="/dashboard/terminy"
      className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 transition-all hover:border-emerald-400 hover:bg-emerald-50/40"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
        <CalendarDays className="h-5 w-5 text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-800">Vypadl vám klient?</p>
        <p className="text-sm text-slate-500">
          Vypište volný termín a dejte o něm vědět svým zákazníkům — obsadí se dřív, než stihnete uklidit.
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  )
}