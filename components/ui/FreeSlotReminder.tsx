'use client'
// components/ui/FreeSlotReminder.tsx
// Připomínka na dashboardu: „zaplňte volný termín".
//
// FRAMING JE ZÁMĚRNÝ: dřív tu stálo „máte termín, o kterém nikdo neví", což
// znělo jako přiznání, že na Propoju nikdo není a poskytovatel si má zákazníky
// sehnat sám. Termín se přitom v marketplace nabízí normálně — sdílení je
// NAVÍC, ne náhrada. Proto se tu mluví o zaplnění a využití vlastní klientely.
//
// Ukazuje se jen tehdy, když má poskytovatel volné okno v nejbližších dnech
// a ještě na něj nikoho neupozornil. Jakmile rozešle, zmizí — nemá otravovat.
//
// Proč na dashboardu a ne až v Termínech: poskytovatel nesedí u počítače a
// nehledá funkce. Vypadne mu klient, vytáhne telefon — a tohle je první věc,
// kterou po přihlášení uvidí.

import { useState } from 'react'
import Link from 'next/link'
import { Megaphone, CalendarDays, ArrowRight, Zap } from 'lucide-react'
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
            <p className="font-black text-slate-900">Zaplňte volný termín</p>
            <p className="mt-0.5 text-sm text-slate-600">
              <strong className="text-slate-900">{slot.label}</strong>
              {slot.services && <span className="text-slate-500"> · {slot.services}</span>}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Termín se zákazníkům na Propoju nabízí sám. Můžete ho navíc poslat lidem,
              kteří u vás už byli, nebo sdílet na sítích — tím se zaplní rychleji.
            </p>
            {slot.moreCount > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                Máte ještě {slot.moreCount} {slot.moreCount === 1 ? 'další volný termín' : slot.moreCount < 5 ? 'další volné termíny' : 'dalších volných termínů'}
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
            <Megaphone className="h-4 w-4" /> Sdílet volný termín
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

/**
 * Prázdný stav — poskytovatel nemá vypsané žádné volné okno.
 *
 * Dřív to byla jen laskavá pobídka („vypadl vám klient?"). Jenže bez termínu
 * si u něj zákazník nemůže objednat na konkrétní čas — musí poslat poptávku
 * a čekat, až se poskytovatel ozve. To je přesně ten krok, na kterém většina
 * lidí odpadne. Proto se to teď říká rovnou: bez termínu přicházíš o objednávky,
 * které by jinak přišly samy.
 */
export function NoFreeSlotHint() {
  return (
    <Link
      href="/dashboard/terminy"
      className="flex items-start gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4 transition-all hover:border-emerald-400 hover:bg-emerald-50/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
        <CalendarDays className="h-5 w-5 text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-900">Nemáte vypsaný žádný termín</p>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
          Zákazník si u vás zatím nemůže rovnou zamluvit čas — musí poslat poptávku
          a čekat, až se ozvete. U toho, kdo termín vypsaný má, klikne a je hotovo.
        </p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <Zap className="h-3.5 w-3.5" /> Vypsat volný termín — zabere to půl minuty
        </p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  )
}