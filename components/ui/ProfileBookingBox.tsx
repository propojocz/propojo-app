'use client'
// components/ui/ProfileBookingBox.tsx
// Sticky box na profilu poskytovatele: nejbližší volné termíny napříč jeho
// službami. Klik → rezervace přes reserveSlot (samoobsluha). Redirect na objednávku.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Loader2, CheckCircle2, LogIn } from 'lucide-react'
import { reserveSlot } from '@/lib/actions/slots'

type Slot = { id: string; starts_at: string; ends_at: string; service_id: string; service_title: string }

export default function ProfileBookingBox({
  providerId,
  slots,
  isLoggedIn,
}: {
  providerId: string
  slots: Slot[]
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(slots[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  const chosen = slots.find((s) => s.id === selected)

  const book = async () => {
    if (!chosen) return
    setBusy(true); setErr('')
    const res = await reserveSlot({ slot_id: chosen.id, service_id: chosen.service_id })
    if (res.success) {
      setDone(true)
      setTimeout(() => router.push(`/dashboard/objednavky/${res.id}`), 1000)
    } else {
      setErr(res.error)
      router.refresh()
      setSelected(null)
    }
    setBusy(false)
  }

  return (
    <div className="sticky top-24 rounded-2xl border-2 border-emerald-100 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
        <CalendarDays className="h-4 w-4 text-emerald-600" /> Nejbližší volné termíny
      </h3>

      {slots.length === 0 ? (
        <>
          {/* Hlídání termínů (waitlist) je Fáze 2 — tlačítko bylo jen vizuální slib
              bez funkce, tak ho skrýváme, dokud waitlist nepostavíme. */}
          <p className="mt-2 text-sm text-slate-500">Zrovna tu nejsou volné termíny.</p>
          <p className="mt-1 text-[11px] text-slate-400">Zkuste se podívat později — poskytovatel termíny průběžně doplňuje.</p>
        </>
      ) : done ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="font-bold text-emerald-800">Rezervováno!</p>
          <p className="text-xs text-emerald-700">Přesměrováváme…</p>
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-slate-400">Klikni a termín je tvůj — bez čekání na potvrzení.</p>
          <div className="mt-3 flex flex-col gap-2">
            {slots.map((s) => {
              const sel = selected === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelected(s.id); setErr('') }}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                    sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <span className={sel ? 'font-bold text-emerald-700' : 'text-slate-700'}>{fmt(s.starts_at)}</span>
                  <span className="text-xs text-slate-400">{s.service_title}</span>
                </button>
              )
            })}
          </div>

          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

          {isLoggedIn ? (
            <button onClick={book} disabled={busy || !chosen} className="btn-primary mt-3 w-full justify-center disabled:opacity-60">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Rezervuji…</> : <>Rezervovat {chosen ? fmt(chosen.starts_at) : ''} →</>}
            </button>
          ) : (
            <Link href={`/prihlasit?next=/profil/${providerId}`} className="btn-primary mt-3 w-full justify-center">
              <LogIn className="h-4 w-4" /> Přihlásit a rezervovat
            </Link>
          )}

        </>
      )}
    </div>
  )
}