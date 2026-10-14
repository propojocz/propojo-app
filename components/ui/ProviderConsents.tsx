'use client'
// components/ui/ProviderConsents.tsx
// Souhlasy při registraci poskytovatele (13. 10. 2026): podmínky + pokyn k vracení peněz zákazníkům.
// Pokyn je podle advokátky samostatné zaškrtávací pole s přesným zněním (AK bod 4, § 1753 OZ) – proto
// dvě krátká pole; znění pokynu je schované pod „Co to znamená?“, ať registrace neodrazuje.

import { useState } from 'react'
import Link from 'next/link'
import { AUTOREF_INSTRUCTION_TEXT } from '@/lib/booking/texts'

export default function ProviderConsents({
  terms, refund, onTerms, onRefund,
}: {
  terms: boolean
  refund: boolean
  onTerms: (v: boolean) => void
  onRefund: (v: boolean) => void
}) {
  const [showText, setShowText] = useState(false)
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={terms} onChange={(e) => onTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
        <span>
          Souhlasím s <Link href="/podminky" target="_blank" className="underline">Podmínkami pro poskytovatele</Link> a{' '}
          <Link href="/pravidla-komunity" target="_blank" className="underline">pravidly komunity</Link>.
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={refund} onChange={(e) => onRefund(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
        <span>
          Souhlasím s pravidly ochrany zákazníků: když zruším potvrzenou rezervaci nebo nedorazím, vrátí se zákazníkovi
          zaplacená částka automaticky z mého Stripe účtu.{' '}
          <button type="button" onClick={() => setShowText((v) => !v)} className="font-semibold text-emerald-700 underline">
            {showText ? 'Skrýt' : 'Přesná pravidla'}
          </button>
        </span>
      </label>
      {showText && (
        <p className="whitespace-pre-line rounded-lg bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          {AUTOREF_INSTRUCTION_TEXT}
        </p>
      )}
    </div>
  )
}
