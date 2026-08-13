// components/ui/ServiceFaq.tsx
// Časté dotazy u nabídky. Rozbalovací seznam přes nativní <details> —
// funguje bez JavaScriptu a je přístupný z klávesnice.
//
// Cílem je ubrat zákazníkovi důvod psát zprávu: „Jak dlouho předem?",
// „Můžu zrušit?" Když na to najde odpověď rovnou, spíš objedná.

import { HelpCircle, ChevronDown } from 'lucide-react'

export type Faq = { id: string; question: string; answer: string }

export default function ServiceFaq({ faqs }: { faqs: Faq[] }) {
  if (faqs.length === 0) return null

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
        <HelpCircle className="h-5 w-5 text-emerald-600" /> Časté dotazy
      </h2>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {faqs.map((f) => (
          <details key={f.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50">
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{f.question}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-slate-600">
              {f.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  )
}