'use client'
// components/forms/ServiceHours.tsx
// Běžná dostupnost karty — týdenní mřížka. Z ní se generují volné termíny.
//
// Víc rozsahů v jednom dni = polední pauza (9:00–12:00 a 13:00–17:00).
// Vypnutý den = zavřeno. Prázdná celá tabulka = karta nemá otevírací dobu
// a objednávky chodí jako poptávky bez termínu (chování jako dosud).

import { useState, useTransition } from 'react'
import { Clock, Plus, X, Copy, Loader2, Check, AlertCircle, Truck, Users } from 'lucide-react'
import { saveServiceHours, saveCalendarSettings, type ServiceHour } from '@/lib/actions/service-hours'

type Range = { from: string; to: string }
type Week = Record<number, Range[]>

interface Props {
  serviceId: string
  /** Uložená otevírací doba (z DB). Prázdné = zavřeno každý den. */
  initialHours?: ServiceHour[]
  /** Rezerva na přejezd v minutách (services.travel_buffer_minutes). */
  initialTravelBuffer?: number
  /** services.separate_calendar — kartu obsluhuje někdo jiný. */
  initialSeparateCalendar?: boolean
  /** Jezdí se u téhle karty za zákazníkem? Podle toho se ukáže rezerva na přejezd. */
  isTravelCard?: boolean
  /** Má poskytovatel i jiné karty? U jediné karty nemá přepínač smysl. */
  hasOtherCards?: boolean
}

const DAYS: { n: number; short: string; long: string }[] = [
  { n: 1, short: 'Po', long: 'pondělí' },
  { n: 2, short: 'Út', long: 'úterý' },
  { n: 3, short: 'St', long: 'středa' },
  { n: 4, short: 'Čt', long: 'čtvrtek' },
  { n: 5, short: 'Pá', long: 'pátek' },
  { n: 6, short: 'So', long: 'sobota' },
  { n: 7, short: 'Ne', long: 'neděle' },
]

// Časy po čtvrthodinách — stejná granularita, v jaké se pak nabízejí termíny.
const TIMES: string[] = (() => {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += 15) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
})()

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fromMin(m: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 45, m))
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`
}

function buildWeek(hours: ServiceHour[]): Week {
  const w: Week = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
  for (const h of hours) {
    if (!w[h.weekday]) w[h.weekday] = []
    w[h.weekday].push({ from: h.starts_at.slice(0, 5), to: h.ends_at.slice(0, 5) })
  }
  for (const d of Object.keys(w)) {
    w[Number(d)].sort((a, b) => toMin(a.from) - toMin(b.from))
  }
  return w
}

export default function ServiceHours({
  serviceId,
  initialHours = [],
  initialTravelBuffer = 0,
  initialSeparateCalendar = false,
  isTravelCard = false,
  hasOtherCards = false,
}: Props) {
  const [week, setWeek] = useState<Week>(() => buildWeek(initialHours))
  const [travel, setTravel] = useState<number>(initialTravelBuffer)
  const [separate, setSeparate] = useState<boolean>(initialSeparateCalendar)
  const [error, setError] = useState<string>('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const update = (fn: (w: Week) => Week) => {
    setWeek((prev) => fn({ ...prev }))
    setSaved(false)
    setError('')
  }

  const toggleDay = (d: number) => {
    update((w) => {
      w[d] = w[d].length > 0 ? [] : [{ from: '09:00', to: '17:00' }]
      return w
    })
  }

  // „+ pauza" udělá to, co člověk čeká: z jednoho úseku dva s dírou mezi nimi
  // (dopoledne + odpoledne s polední pauzou), ne další úsek přes ten stávající.
  // Přestávka se nezapisuje — je to ten prostor, který mezi rozsahy zbude.
  const addRange = (d: number) => {
    update((w) => {
      const list = w[d]

      // Nic ještě není → rovnou typický pracovní den s polední pauzou.
      if (list.length === 0) {
        w[d] = [{ from: '08:00', to: '12:00' }, { from: '13:00', to: '16:00' }]
        return w
      }

      // Jediný úsek → rozdělíme ho na dopoledne a odpoledne s pauzou v poledne.
      if (list.length === 1) {
        const f = toMin(list[0].from)
        const t = toMin(list[0].to)
        // Dost dlouhý na to, aby uprostřed mohla být hodinová pauza?
        if (t - f >= 180) {
          let gapFrom = 12 * 60
          let gapTo = 13 * 60
          // Nespadá-li poledne dovnitř, dáme pauzu doprostřed úseku.
          if (gapFrom <= f + 30 || gapTo >= t - 30) {
            const mid = Math.round((f + t) / 2 / 15) * 15
            gapFrom = mid - 30
            gapTo = mid + 30
          }
          w[d] = [
            { from: fromMin(f), to: fromMin(gapFrom) },
            { from: fromMin(gapTo), to: fromMin(t) },
          ]
          return w
        }
      }

      // Víc úseků → přidáme další za poslední, s hodinovou mezerou.
      const last = list[list.length - 1]
      const start = toMin(last.to) + 60
      if (start + 30 > 23 * 60 + 45) return w
      w[d] = [...list, { from: fromMin(start), to: fromMin(Math.min(start + 120, 23 * 60 + 45)) }]
      return w
    })
  }

  const removeRange = (d: number, i: number) => {
    update((w) => {
      w[d] = w[d].filter((_, idx) => idx !== i)
      return w
    })
  }

  const setTime = (d: number, i: number, key: 'from' | 'to', value: string) => {
    update((w) => {
      const copy = [...w[d]]
      const next = { ...copy[i], [key]: value }
      // Konec musí zůstat po začátku — jinak ho posuneme o čtvrthodinu dál.
      if (toMin(next.to) <= toMin(next.from)) {
        if (key === 'from') next.to = fromMin(toMin(next.from) + 15)
        else next.from = fromMin(toMin(next.to) - 15)
      }
      copy[i] = next
      w[d] = copy
      return w
    })
  }

  // Nejčastější případ: mám stejně otevřeno každý všední den.
  const copyToWeekdays = () => {
    update((w) => {
      const src = w[1]
      for (const d of [2, 3, 4, 5]) w[d] = src.map((r) => ({ ...r }))
      return w
    })
  }

  const handleSave = () => {
    // Překryv rozsahů by generoval termíny dvakrát.
    for (const { n, long } of DAYS) {
      const day = [...week[n]].sort((a, b) => toMin(a.from) - toMin(b.from))
      for (let i = 1; i < day.length; i++) {
        if (toMin(day[i].from) < toMin(day[i - 1].to)) {
          setError(`Rozsahy se překrývají — ${long}. Dva úseky v jednom dni znamenají přestávku mezi nimi (třeba 9:00–12:00 a 13:00–17:00), nesmí se prolínat.`)
          return
        }
      }
    }

    const rows: ServiceHour[] = []
    for (const { n } of DAYS) {
      for (const r of week[n]) rows.push({ weekday: n, starts_at: r.from, ends_at: r.to })
    }

    startTransition(async () => {
      const a = await saveServiceHours(serviceId, rows)
      if (!a.success) { setError(a.error); return }

      const b = await saveCalendarSettings(serviceId, {
        travel_buffer_minutes: isTravelCard ? travel : 0,
        separate_calendar: separate,
      })
      if (!b.success) { setError(b.error); return }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  const totalRanges = DAYS.reduce((sum, d) => sum + week[d.n].length, 0)

  // Překryv poznáme hned při psaní, ne až po kliknutí na Uložit.
  const hasOverlap = (ranges: Range[]): boolean => {
    const sorted = [...ranges].sort((a, b) => toMin(a.from) - toMin(b.from))
    for (let i = 1; i < sorted.length; i++) {
      if (toMin(sorted[i].from) < toMin(sorted[i - 1].to)) return true
    }
    return false
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Clock className="h-5 w-5 text-emerald-600" />
        <h3 className="font-bold text-slate-900">Běžná dostupnost</h3>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-slate-500">
        Nastavte dny a časy, kdy obvykle přijímáte zakázky. Podle nich nabídneme zákazníkům
        konkrétní volné termíny — a zabraný čas se hned zablokuje, takže se vám dvě zakázky
        nesejdou na stejnou hodinu.
        <span className="mt-1.5 block">
          Bez nastavené dostupnosti vás zákazníci mohou oslovit kdykoli a termín si domluvíte ručně v chatu.
        </span>
      </p>

      <div className="divide-y divide-slate-100">
        {DAYS.map(({ n, short, long }) => {
          const ranges = week[n]
          const open = ranges.length > 0
          const overlap = hasOverlap(ranges)
          return (
            <div key={n} className="flex flex-wrap items-start gap-3 py-3">
              <button
                type="button"
                onClick={() => toggleDay(n)}
                role="switch"
                aria-checked={open}
                aria-label={long}
                className={`relative mt-1 h-6 w-10 shrink-0 rounded-full transition-colors ${open ? 'bg-emerald-500' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${open ? 'left-[18px]' : 'left-0.5'}`} />
              </button>

              <span className="mt-1 w-8 shrink-0 text-sm font-bold text-slate-700">{short}</span>

              {open ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                      <select
                        value={r.from}
                        onChange={(e) => setTime(n, i, 'from', e.target.value)}
                        aria-label={`${long} — od`}
                        className="min-h-[36px] bg-transparent px-1 text-sm tabular-nums outline-none"
                      >
                        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-slate-300">–</span>
                      <select
                        value={r.to}
                        onChange={(e) => setTime(n, i, 'to', e.target.value)}
                        aria-label={`${long} — do`}
                        className="min-h-[36px] bg-transparent px-1 text-sm tabular-nums outline-none"
                      >
                        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRange(n, i)}
                          aria-label="Odebrat rozsah"
                          className="ml-0.5 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {ranges.length < 3 && (
                    <button
                      type="button"
                      onClick={() => addRange(n)}
                      title="Polední pauza = dva úseky s dírou mezi nimi (např. 9:00–12:00 a 13:00–17:00)"
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> pauza
                    </button>
                  )}
                  {overlap && (
                    <p className="basis-full text-xs font-semibold text-red-600">
                      Úseky se prolínají — přestávka je díra <em>mezi</em> nimi, ne další úsek uvnitř.
                    </p>
                  )}
                </div>
              ) : (
                <span className="mt-1.5 text-sm text-slate-400">zavřeno</span>
              )}
            </div>
          )
        })}
      </div>

      {week[1].length > 0 && (
        <button
          type="button"
          onClick={copyToWeekdays}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition active:scale-[.99] hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <Copy className="h-4 w-4" /> Zkopírovat pondělí do všedních dnů (Út–Pá)
        </button>
      )}

      {/* ── Doplňkové nastavení kalendáře ── */}
      {(isTravelCard || hasOtherCards) && (
        <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
          {isTravelCard && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                  <Truck className="h-4 w-4 text-slate-400" /> Rezerva na přejezd
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Přičte se mezi termíny, ať vám systém nenabídne dvě zakázky přes okres těsně za sebou.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={480}
                  step={5}
                  value={travel}
                  onChange={(e) => { setTravel(Number(e.target.value)); setSaved(false) }}
                  className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-emerald-400"
                />
                <span className="text-sm text-slate-400">min</span>
              </div>
            </div>
          )}

          {hasOtherCards && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                  <Users className="h-4 w-4 text-slate-400" /> Tuto kartu obsluhuje někdo jiný
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Vypnuto = vaše karty sdílejí jeden čas a termíny se hlídají napříč, ať vás nikdo nezarezervuje dvakrát.
                  Zapněte, když kartu vede kolega.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSeparate((v) => !v); setSaved(false) }}
                role="switch"
                aria-checked={separate}
                aria-label="Samostatný kalendář karty"
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${separate ? 'bg-emerald-500' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${separate ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="btn-primary disabled:opacity-60"
        >
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám…</>
            : saved ? <><Check className="h-4 w-4" /> Uloženo</>
            : 'Uložit dostupnost'}
        </button>
        <span className="text-xs text-slate-400">
          {totalRanges === 0
            ? 'Dostupnost není nastavena — termín domluvíte se zákazníkem ručně.'
            : `Dostupnost nastavena pro ${DAYS.filter((d) => week[d.n].length > 0).length} ${
                DAYS.filter((d) => week[d.n].length > 0).length === 1 ? 'den' : DAYS.filter((d) => week[d.n].length > 0).length < 5 ? 'dny' : 'dnů'
              } v týdnu.`}
        </span>
      </div>
    </div>
  )
}