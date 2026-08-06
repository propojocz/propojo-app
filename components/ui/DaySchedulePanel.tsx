'use client'
// components/ui/DaySchedulePanel.tsx
// Denní panel poskytovatele „kdo přijde a v kolik".
//
// Není to osa na pixely (ta byla v návrhu hezká, ale na mobilu se špatně čte) —
// je to čitelný seznam rezervací seřazený podle času. U každé: čas, úkon, jméno,
// stav zálohy, odznak „poprvé u vás", zaškrtávátko „dorazil". Plus blokace času.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, Check, Clock, Wallet, Ban, Loader2, Plus, X, Sparkles, User, ChevronLeft, ChevronRight, UserX, ArrowLeftRight,
} from 'lucide-react'
import { setAttendance, blockTime, unblockTime, type DayEntry, type Attendance } from '@/lib/actions/day-schedule'

interface Props {
  /** 'YYYY-MM-DD' zobrazeného dne */
  date: string
  entries: DayEntry[]
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function dayTitle(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  const today = new Date()
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(today)
  const tmrStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date(today.getTime() + 86400000))
  const long = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)
  if (dateStr === todayStr) return `Dnes — ${long}`
  if (dateStr === tmrStr) return `Zítra — ${long}`
  return long
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function DaySchedulePanel({ date, entries }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showBlock, setShowBlock] = useState(false)
  const [blockFrom, setBlockFrom] = useState('')
  const [blockTo, setBlockTo] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [error, setError] = useState('')

  const goDay = (delta: number) => {
    router.push(`/dashboard/terminy?den=${shiftDate(date, delta)}`)
  }

  const pickAttendance = (orderId: string, value: Attendance) => {
    setBusyId(orderId)
    startTransition(async () => {
      const res = await setAttendance(orderId, value)
      setBusyId(null)
      if (!res.success) { setError(res.error); return }
      router.refresh()
    })
  }

  const removeBlock = (blockId: string) => {
    setBusyId(blockId)
    startTransition(async () => {
      await unblockTime(blockId)
      setBusyId(null)
      router.refresh()
    })
  }

  const submitBlock = () => {
    if (!blockFrom || !blockTo) { setError('Vyplňte čas od–do.'); return }
    setError('')
    startTransition(async () => {
      const res = await blockTime({ date, from: blockFrom, to: blockTo, reason: blockReason || undefined })
      if (!res.success) { setError(res.error); return }
      setShowBlock(false); setBlockFrom(''); setBlockTo(''); setBlockReason('')
      router.refresh()
    })
  }

  const bookings = entries.filter((e) => e.kind === 'booking')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Hlavička + přepínání dnů */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          <h2 className="font-black text-slate-900">{dayTitle(date)}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => goDay(-1)} aria-label="Předchozí den"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => router.push('/dashboard/terminy')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
            Dnes
          </button>
          <button type="button" onClick={() => goDay(1)} aria-label="Další den"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {bookings.length === 0 && entries.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          Na tento den zatím nemáte žádné rezervace.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => {
            if (e.kind === 'block') {
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <Ban className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-slate-500">
                    {fmtTime(e.start)}–{fmtTime(e.end)}
                  </span>
                  <span className="flex-1 text-sm text-slate-500">{e.title}</span>
                  <button type="button" onClick={() => removeBlock(e.id)} disabled={busyId === e.id}
                    aria-label="Zrušit blokaci"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50">
                    {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </button>
                </li>
              )
            }

            const paying = e.depositStatus === 'pending' && e.holdUntil
            const paid = e.depositStatus === 'paid'
            return (
              <li key={e.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 sm:flex-nowrap ${
                paying ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'
              }`}>
                <span className="shrink-0 whitespace-nowrap text-sm font-black tabular-nums text-slate-800">
                  {fmtTime(e.start)}–{fmtTime(e.end)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-bold text-slate-900">{e.customerName}</span>
                    {e.firstVisit && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-600">
                        <Sparkles className="h-3 w-3" /> poprvé u vás
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-slate-500">{e.title}</p>
                </div>

                {/* Stav platby */}
                {paying ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                    <Clock className="h-3 w-3" /> platí se…
                  </span>
                ) : paid ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                    <Wallet className="h-3 w-3" /> {e.depositAmount ? `${e.depositAmount.toLocaleString('cs-CZ')} Kč` : 'zaplaceno'}
                  </span>
                ) : null}

                {/* Dorazil? — jen u zaplacených, ať se neodškrtává rozdělaná platba */}
                {paid && (() => {
                  const a = e.attendance ?? null
                  const btn = (val: Attendance, label: string, Icon: any, onCls: string, offCls: string) => (
                    <button
                      type="button"
                      onClick={() => e.orderId && pickAttendance(e.orderId, val)}
                      disabled={busyId === e.orderId}
                      title={label}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${a === val ? onCls : offCls}`}
                    >
                      {busyId === e.orderId && a === val
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Icon className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  )
                  return (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {btn('dorazil', 'Dorazil', Check,
                        'border-emerald-300 bg-emerald-50 text-emerald-700',
                        'border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700')}
                      {btn('jinak', 'Domluvili jsme se jinak', ArrowLeftRight,
                        'border-blue-300 bg-blue-50 text-blue-700',
                        'border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600')}
                      {btn('nedorazil', 'Nedorazil', UserX,
                        'border-red-300 bg-red-50 text-red-700',
                        'border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-600')}
                    </div>
                  )
                })()}
              </li>
            )
          })}
        </ul>
      )}

      {/* Blokace času */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        {showBlock ? (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-700">Zablokovat čas ({dayTitle(date).split(' — ')[0].toLowerCase()})</p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="time" value={blockFrom} onChange={(e) => setBlockFrom(e.target.value)}
                aria-label="Od" className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm tabular-nums" />
              <span className="text-slate-400">–</span>
              <input type="time" value={blockTo} onChange={(e) => setBlockTo(e.target.value)}
                aria-label="Do" className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm tabular-nums" />
              <input type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Důvod (nepovinné)" maxLength={60}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={submitBlock} disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Zablokovat
              </button>
              <button type="button" onClick={() => { setShowBlock(false); setError('') }}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
                Zrušit
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowBlock(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <Plus className="h-4 w-4" /> Zablokovat čas (dovolená, zákazník z ulice…)
          </button>
        )}
        {error && !showBlock && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}