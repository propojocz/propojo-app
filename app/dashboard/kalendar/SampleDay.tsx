// app/dashboard/kalendar/SampleDay.tsx
// Kalendář K2 – ukázkový den, když v celém zobrazeném týdnu nic není (Matej 19. 10.: jen při prázdném týdnu).
// Zašedlá, neklikací ukázka s vymyšlenými údaji – ať je vidět, k čemu kalendář slouží.

import { Ban, Coffee, StickyNote, Zap } from 'lucide-react'

export default function SampleDay() {
  const time = (from: string, to: string) => (
    <div className="w-12 shrink-0 pt-2.5 text-right">
      <p className="text-sm font-black tabular-nums text-slate-900">{from}</p>
      <p className="text-[11px] tabular-nums text-slate-400">{to}</p>
    </div>
  )

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 sm:p-4" aria-hidden="true">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">Ukázka</span>
        <p className="text-xs text-slate-500">Takhle bude vypadat váš den, až budete mít rezervace.</p>
      </div>
      <ul className="pointer-events-none select-none space-y-2 opacity-60 grayscale">
        <li className="flex gap-3">
          {time('08:00', '09:00')}
          <div className="flex flex-1 items-start gap-3 rounded-xl border border-l-4 border-slate-200 border-l-sky-400 bg-white px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">JN</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">Jana Nováková <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Potvrzeno</span></p>
              <p className="text-sm text-slate-600">Konzultace</p>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <div className="w-12 shrink-0 pt-1.5 text-right text-[11px] tabular-nums text-slate-400">09:00</div>
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
            <Coffee className="h-3.5 w-3.5" /> Pauza / přesun 09:00–09:15
          </div>
        </li>
        <li className="flex gap-3">
          <div className="w-12 shrink-0 pt-2.5 text-right text-xs font-semibold tabular-nums text-slate-400">09:15</div>
          <div className="flex flex-1 flex-wrap items-center gap-2 rounded-xl border border-dashed border-emerald-300 px-3.5 py-2.5">
            <p className="flex-1 text-sm text-slate-700"><span className="font-bold text-emerald-700">Volno</span> 09:15–11:00 <span className="text-slate-500">(1 h 45 min)</span></p>
            <span className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white">
              <Zap className="h-3.5 w-3.5" /> Vytvořit bleskový termín
            </span>
          </div>
        </li>
        <li className="flex gap-3">
          {time('11:00', '12:00')}
          <div className="flex flex-1 items-start gap-3 rounded-xl border border-l-4 border-slate-200 border-l-indigo-400 bg-white px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">PS</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">Petr Svoboda <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Čeká na potvrzení</span></p>
              <p className="text-sm text-slate-600">Výjezd a nacenění · okno příjezdu</p>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          {time('13:00', '14:00')}
          <div className="flex flex-1 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <StickyNote className="mt-0.5 h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-bold text-amber-900">Vlastní termín <span className="ml-1 text-[11px] font-semibold text-amber-700">· mimo Propojo</span></p>
              <p className="text-sm text-slate-800">Paní Dvořáková – volala, přijde osobně</p>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          {time('15:00', '17:00')}
          <div className="flex flex-1 items-start gap-3 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5">
            <Ban className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <p className="text-sm font-bold text-slate-600">Blokováno</p>
              <p className="text-sm text-slate-500">Lékař</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  )
}
