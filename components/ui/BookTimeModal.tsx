'use client'
// components/ui/BookTimeModal.tsx
// Rezervace konkrétního času vygenerovaného z otevírací doby karty.
//
// Záměrně samostatný modal vedle OrderItemModal: ten řeší poptávky bez termínu
// a vypsaná last-minute okna, tenhle jen „vyberu čas → zaplatím". Míchat obojí
// do jednoho by z něj udělalo nepřehlednou změť podmínek.
//
// Po potvrzení vzniká objednávka se zámkem na 10 minut a zákazník jde rovnou
// na platební bránu. Nezaplatí-li, termín se sám vrátí mezi volné.

import { useState, useMemo, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, Wallet, Loader2, MapPin, Store, Lock, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ServiceItem } from '@/types/database'
import type { FreeDay } from '@/lib/actions/free-times'
import { reserveTime } from '@/lib/actions/reserve-time'
import { createDepositCheckout } from '@/lib/actions/deposit'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'

interface Props {
  item: ServiceItem
  serviceId: string
  isLoggedIn: boolean
  locationType?: string | null
  /** Dny s volnými časy pro tento úkon (z getFreeTimesForCard). */
  days: FreeDay[]
  /** Čas, na který zákazník klikl v ceníku (ISO). */
  initialStart?: string | null
  /** Předvyplněné město z profilu zákazníka. */
  defaultCity?: string
  onClose: () => void
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

const fmtLong = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

export default function BookTimeModal({
  item, serviceId, isLoggedIn, locationType = 'u_zakaznika',
  days, initialStart = null, defaultCity = '', onClose,
}: Props) {
  const router = useRouter()

  // Den, ve kterém leží vybraný čas — ať modal otevře rovnou ten správný.
  const initialDayIdx = useMemo(() => {
    if (!initialStart) return 0
    const i = days.findIndex((d) => d.times.some((t) => t.start === initialStart))
    return i >= 0 ? i : 0
  }, [days, initialStart])

  const [dayIdx, setDayIdx] = useState(initialDayIdx)
  const [selected, setSelected] = useState<string | null>(initialStart)
  const [city, setCity] = useState(defaultCity)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const atCustomer = locationType !== 'u_poskytovatele'
  const deposit = Number(item.deposit_amount ?? 0)
  const day = days[dayIdx]

  const submit = async () => {
    if (!selected) { setError('Vyberte prosím termín.'); return }
    if (atCustomer && !city.trim()) { setError('Zadejte prosím město nebo obec.'); return }

    setBusy(true); setError('')

    const res = await reserveTime({
      service_id: serviceId,
      service_item_id: item.id,
      start: selected,
      message: message.trim() || undefined,
      location_city: atCustomer ? city.trim() : undefined,
    })

    if (!res.success) {
      setError(res.error)
      setBusy(false)
      router.refresh()   // termíny se mezitím mohly změnit
      return
    }

    // Bez zálohy je hotovo hned. Se zálohou jdeme na platební bránu —
    // dokud se nezaplatí, termín drží zámek jen 10 minut.
    if (!res.needsPayment) {
      router.push(`/dashboard/objednavky/${res.id}`)
      return
    }

    const pay = await createDepositCheckout(res.id)
    if (pay.success) {
      window.location.href = pay.url
    } else {
      // Objednávka existuje, jen se nepovedlo spustit platbu — pošleme
      // zákazníka na detail, kde platbu zkusí znovu.
      setError(pay.error)
      setBusy(false)
      router.push(`/dashboard/objednavky/${res.id}`)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          onClick={(e: MouseEvent) => e.stopPropagation()}
          className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Rezervace termínu</p>
              <h3 className="mt-0.5 truncate text-lg font-black text-slate-900">{item.name}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Zavřít"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {!isLoggedIn ? (
            <div className="space-y-3">
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Pro rezervaci termínu se přihlaste — ať víme, komu termín patří.
              </p>
              <Link href={`/prihlasit?next=/sluzby/${serviceId}`} className="btn-primary w-full">
                Přihlásit se a rezervovat
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Rekapitulace */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-slate-900">
                    {item.price != null && item.price > 0
                      ? `${Number(item.price).toLocaleString('cs-CZ')} Kč`
                      : 'Cena dohodou'}
                  </span>
                  {item.duration_minutes ? (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5 text-slate-400" /> {item.duration_minutes} min
                    </span>
                  ) : null}
                </div>
                {deposit > 0 ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
                    <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    Teď zaplatíte zálohu {deposit.toLocaleString('cs-CZ')} Kč, zbytek na místě.
                    Záloha se započítá do konečné ceny.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-emerald-700">Bez zálohy — termín se potvrdí hned.</p>
                )}
              </div>

              {/* Výběr dne */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5 text-emerald-600" /> Termín *
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((d, i) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setDayIdx(i)}
                      className={`flex-none rounded-xl border px-3 py-2 text-center transition ${
                        i === dayIdx
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                      }`}
                    >
                      <span className="block text-sm font-bold">{d.label}</span>
                      <span className={`block text-[11px] ${i === dayIdx ? 'text-slate-300' : 'text-slate-400'}`}>
                        {d.count === 1 ? '1 termín' : d.count < 5 ? `${d.count} termíny` : `${d.count} termínů`}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(day?.times ?? []).map((t) => {
                    const isSel = selected === t.start
                    if (t.locked) {
                      return (
                        <span key={t.start}
                          title="Někdo si tenhle čas právě rezervuje. Když platbu nedokončí, vrátí se mezi volné."
                          className="cursor-not-allowed rounded-xl bg-slate-100 px-2 py-2.5 text-center text-sm font-semibold text-slate-400">
                          <Lock className="mx-auto mb-0.5 h-3 w-3" />
                          {fmtTime(t.start)}
                        </span>
                      )
                    }
                    return (
                      <button
                        key={t.start}
                        type="button"
                        onClick={() => { setSelected(t.start); setError('') }}
                        className={`rounded-xl border px-2 py-2.5 text-center text-sm font-bold tabular-nums transition ${
                          isSel
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        {fmtTime(t.start)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Místo */}
              {atCustomer ? (
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> Město nebo obec *
                  </label>
                  <SearchAutocomplete
                    mode="obce"
                    defaultValue={city}
                    placeholder="Začněte psát a vyberte obec…"
                    onPickObec={(picked) => setCity(picked.obec)}
                    onFreeText={(text) => setCity(text)}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Stačí obec — přesnou adresu doplníte po rezervaci.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>Přijdete za živnostníkem — adresu najdete na jeho kartě a v potvrzení.</span>
                </div>
              )}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Zpráva pro živnostníka (volitelné)…"
                rows={2}
                maxLength={500}
                className="form-input resize-none text-sm"
              />

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                type="button"
                onClick={submit}
                disabled={busy || !selected}
                className="btn-primary w-full py-3 text-base disabled:opacity-60"
              >
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Rezervuji…</>
                  : deposit > 0
                    ? `Rezervovat a zaplatit ${deposit.toLocaleString('cs-CZ')} Kč`
                    : 'Rezervovat termín'}
              </button>

              {selected && (
                <p className="text-center text-[11px] leading-relaxed text-slate-400">
                  {fmtLong(selected)}
                  {deposit > 0 && ' · na dokončení platby máte 10 minut, pak se termín uvolní ostatním'}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}