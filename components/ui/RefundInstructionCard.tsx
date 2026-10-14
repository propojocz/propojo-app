'use client'
// components/ui/RefundInstructionCard.tsx
// Pokyn poskytovatele k automatickým refundům (vrstva 4, AK bod 4, model §21). Samostatné zaškrtávací
// pole s přesným zněním; bez platného pokynu poskytovatel nepřijímá nové rezervace s platbou.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck2, Loader2 } from 'lucide-react'
import { acceptRefundInstruction } from '@/lib/actions/connect'

export default function RefundInstructionCard({
  text,
  acceptedAt,
}: {
  text: string
  /** Kdy pokyn v aktuální verzi odsouhlasil (null = zatím ne) */
  acceptedAt: string | null
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const accept = async () => {
    if (!checked || busy) return
    setBusy(true)
    setError(null)
    const res = await acceptRefundInstruction()
    setBusy(false)
    if (res.success) router.refresh()
    else setError(res.error)
  }

  return (
    <div className={`rounded-2xl border bg-white p-6 shadow-sm ${acceptedAt ? 'border-slate-200' : 'border-2 border-amber-300'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${acceptedAt ? 'bg-emerald-100' : 'bg-amber-100'}`}>
          <FileCheck2 className={`h-5 w-5 ${acceptedAt ? 'text-emerald-600' : 'text-amber-600'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-900">Ochrana zákazníků – vracení peněz</p>
          {acceptedAt ? (
            <p className="text-sm text-slate-500">
              Odsouhlaseno {new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(acceptedAt))}.{' '}
              <button type="button" onClick={() => setOpen((v) => !v)} className="font-semibold text-emerald-700 underline">
                {open ? 'Skrýt znění' : 'Zobrazit znění'}
              </button>
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Jedno zaškrtnutí a můžete přijímat rezervace s platbou. Peníze zůstávají na vašem Stripe účtu, Propojo je
              nedrží. Jen když například zrušíte rezervaci nebo nedorazíte, vrátí se zákazníkovi automaticky – a to
              výhradně v přesně vyjmenovaných případech.{' '}
              <button type="button" onClick={() => setOpen((v) => !v)} className="font-semibold text-emerald-700 underline">
                {open ? 'Skrýt přesná pravidla' : 'Přesná pravidla'}
              </button>
            </p>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
          {text}
        </div>
      )}

      {!acceptedAt && (
        <>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>Souhlasím s pravidly ochrany zákazníků: když zruším potvrzenou rezervaci nebo nedorazím, vrátí se zákazníkovi zaplacená částka automaticky z mého Stripe účtu.</span>
          </label>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={accept}
            disabled={!checked || busy}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Potvrdit
          </button>
        </>
      )}
    </div>
  )
}
