'use client'
// components/ui/SlotPicker.tsx
// Volné termíny u služby (Model A). Zákazník klikne na termín → rezervuje
// (vznikne objednávka s termínem, okno se zabere). Samoobsluha: první bere.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, Loader2, CheckCircle2, MapPin, Home, Store, LogIn } from 'lucide-react'
import Link from 'next/link'
import { reserveSlot } from '@/lib/actions/slots'

export type SlotOption = {
  id: string
  starts_at: string
  ends_at: string
}

export default function SlotPicker({
  serviceId,
  slots,
  isLoggedIn,
  locationType = 'u_zakaznika',
}: {
  serviceId: string
  slots: SlotOption[]
  isLoggedIn: boolean
  locationType?: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [city, setCity] = useState('')
  const [message, setMessage] = useState('')
  const [place, setPlace] = useState<'u_zakaznika' | 'u_poskytovatele'>(
    locationType === 'u_poskytovatele' ? 'u_poskytovatele' : 'u_zakaznika'
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  if (!slots || slots.length === 0) return null

  const isChoice = locationType === 'oboji'
  const atCustomer = isChoice ? place === 'u_zakaznika' : locationType === 'u_zakaznika'

  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso))
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  const confirm = async () => {
    if (!selected) return
    if (atCustomer && !city.trim()) {
      setErr('Zadejte prosím město nebo obec, kde se má služba provést.')
      return
    }
    setBusy(true)
    setErr('')
    const res = await reserveSlot({
      slot_id: selected,
      service_id: serviceId,
      message: message || undefined,
      location_city: atCustomer ? city.trim() : undefined,
      service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
    })
    if (res.success) {
      setDone(true)
      setTimeout(() => router.push(`/dashboard/objednavky/${res.id}`), 1200)
    } else {
      setErr(res.error)
      // Termín mohl být právě zabrán → obnov nabídku
      router.refresh()
      setSelected(null)
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="font-bold text-emerald-800">Termín rezervován!</p>
          <p className="text-xs text-emerald-700">Přesměrováváme na vaši objednávku…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
        <CalendarDays className="h-4 w-4 text-emerald-600" /> Volné termíny
      </h3>
      <p className="mb-3 text-xs text-slate-400">Klikněte a termín je váš — první bere.</p>

      {!isLoggedIn ? (
        <Link href={`/prihlasit?next=/sluzby/${serviceId}`} className="btn-primary w-full justify-center">
          <LogIn className="h-4 w-4" /> Přihlásit a rezervovat
        </Link>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => {
              const isSel = selected === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelected(isSel ? null : s.id); setErr('') }}
                  className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                    isSel
                      ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                  }`}
                >
                  <span className="font-semibold">{fmtDay(s.starts_at)}</span>{' '}
                  {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                </button>
              )
            })}
          </div>

          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 overflow-hidden pt-3"
              >
                {isChoice && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Kde chcete službu využít?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPlace('u_poskytovatele')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${place === 'u_poskytovatele' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <Store className="h-4 w-4" /> U poskytovatele
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlace('u_zakaznika')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${place === 'u_zakaznika' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <Home className="h-4 w-4" /> U mě
                      </button>
                    </div>
                  </div>
                )}

                {atCustomer && (
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> Město nebo obec *
                    </label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Např. Zubří"
                      className="form-input text-sm"
                      maxLength={100}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Přesnou adresu doplníte až po přijetí objednávky.</p>
                  </div>
                )}

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Zpráva pro živnostníka (volitelné)…"
                  rows={2}
                  className="form-input resize-none text-sm"
                  maxLength={500}
                />

                {err && <p className="text-xs text-red-600">{err}</p>}

                <button onClick={confirm} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
                  {busy
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Rezervuji…</>
                    : <><CalendarDays className="h-4 w-4" /> Rezervovat tento termín</>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {err && !selected && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  )
}