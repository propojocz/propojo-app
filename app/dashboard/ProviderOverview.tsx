'use client'
// app/dashboard/ProviderOverview.tsx
// Přehled poskytovatele K3 (19. 10. 2026, docs/plan-kalendar.md) – widgety ve stylu iOS:
// Dnes (nejbližší rezervace, další v pořadí, největší volno s ⚡), Čeká na vás (potvrzení s lhůtou),
// Tento týden (sloupce rezervací Po–Ne), Zaplaceno přes Propojo (tento měsíc) a Hodnocení.
// Dnešek a týden jsou stejná data jako Kalendář (getCalendarDay), zbytek lib/actions/overview.ts.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays, CheckCircle2, ChevronRight, Clock, Hourglass, MapPin, Star, Wallet, Zap,
} from 'lucide-react'
import type { CalBooking, CalendarDay, CalGap } from '@/lib/actions/calendar'
import type { ProviderOverviewData } from '@/lib/actions/overview'
import { cas, datum, denKratce } from '@/lib/format'
import { QuickSlotModal } from '@/components/ui/QuickSlotButton'
import type { QuickSlotInitial } from '@/components/ui/QuickSlotForm'
import { WEEKDAYS, bookingStatus, bookingsText, durationText, quickFromGap } from './kalendar/shared'

// Barvu pozadí a okraje dává každá karta zvlášť (bílá, nebo žlutá u „Čeká na vás“)
const SHELL = 'rounded-3xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-18px_rgba(15,23,42,0.18)] sm:p-6'
const CARD = `${SHELL} border-slate-200/80 bg-white`

function kc(halere: number): string {
  return `${(halere / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} Kč`
}

function Label({ icon: Icon, color, children }: { icon: any; color: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500">
      <Icon className={`h-4 w-4 ${color}`} /> {children}
    </p>
  )
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-emerald-700 transition hover:text-emerald-800">
      {children} <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  )
}

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  const full = Math.round(value)
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} z 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= full ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'}`} />
      ))}
    </span>
  )
}

export default function ProviderOverview({ cal, ov, serverNow, rating, reviewCount }: {
  cal: CalendarDay
  ov: ProviderOverviewData
  /** Čas vykreslení na serveru – do načtení v prohlížeči, ať se stav rezervací neliší */
  serverNow: number
  rating: number | null
  reviewCount: number
}) {
  const [now, setNow] = useState(serverNow)
  const [quick, setQuick] = useState<QuickSlotInitial | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // ── Dnes ──
  const today = cal.days.find((d) => d.date === cal.today)
  const todayBookings = (today?.items ?? []).filter((i): i is CalBooking => i.type === 'booking')
  const upcoming = todayBookings.filter((b) => new Date(b.end).getTime() > now)
  const next = upcoming[0] ?? null
  const later = upcoming.slice(1, 4)
  const todayGaps = today?.gaps.all ?? []
  const bestGap = todayGaps.reduce<CalGap | null>((best, g) => (!best || g.minutes > best.minutes ? g : best), null)
  const todayFree = todayGaps.reduce((s, g) => s + g.minutes, 0)

  // ── Týden ──
  const week = cal.days.map((d) => ({
    date: d.date,
    count: d.items.filter((i) => i.type === 'booking').length,
    free: (d.gaps.all ?? []).reduce((s, g) => s + g.minutes, 0),
  }))
  const weekTotal = week.reduce((s, d) => s + d.count, 0)
  const weekFree = week.reduce((s, d) => s + d.free, 0)
  const weekMax = Math.max(1, ...week.map((d) => d.count))

  // ── Peníze ──
  const monthName = new Intl.DateTimeFormat('cs-CZ', { month: 'long', timeZone: 'UTC' }).format(new Date(`${ov.money.month}T12:00:00Z`))

  // ── Hodnocení ──
  const hasRating = rating != null && reviewCount > 0

  const hasAwaiting = ov.awaiting.length > 0

  return (
    <div className="grid gap-4 md:grid-cols-6">
      {/* ── Dnes ── */}
      <section className={`${CARD} md:col-span-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label icon={CalendarDays} color="text-emerald-500">Dnes</Label>
            <p className="mt-1 text-sm text-slate-500">
              {bookingsText(todayBookings.length)}
              {todayFree > 0 && <> · volno {durationText(todayFree)}</>}
            </p>
          </div>
          <MoreLink href="/dashboard/kalendar">Kalendář</MoreLink>
        </div>

        {next ? (
          <Link href={`/dashboard/objednavky/${next.id}`}
            className="mt-4 flex items-center gap-4 rounded-2xl bg-slate-50 p-4 transition hover:bg-emerald-50/60">
            <div className="shrink-0 text-center">
              <p className="text-3xl font-black tabular-nums tracking-tight text-slate-900">{cas(next.start)}</p>
              <p className="text-xs tabular-nums text-slate-400">do {cas(next.end)}</p>
            </div>
            <div className="min-w-0 flex-1 border-l border-slate-200 pl-4">
              {(() => {
                const st = bookingStatus(next, now)
                return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span>
              })()}
              <p className="mt-1 truncate text-base font-bold text-slate-900">{next.customer}</p>
              <p className="truncate text-sm text-slate-600">{next.title}{next.arrivalWindow ? ' · okno příjezdu' : ''}</p>
              {next.placeLabel && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0 text-slate-400" /> <span className="truncate">{next.placeLabel}</span>
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
          </Link>
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center">
            <p className="font-bold text-slate-700">
              {todayBookings.length > 0 ? 'Dnešní rezervace máte za sebou' : 'Dnes žádná rezervace'}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {bestGap ? 'Volný čas můžete nabídnout jako bleskový termín.' : 'Zítřek a další dny najdete v kalendáři.'}
            </p>
          </div>
        )}

        {later.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {later.map((b) => (
              <li key={b.id}>
                <Link href={`/dashboard/objednavky/${b.id}`} className="flex items-center gap-3 py-2 text-sm transition hover:text-emerald-700">
                  <span className="w-12 shrink-0 font-black tabular-nums text-slate-900">{cas(b.start)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{b.customer} · {b.title}</span>
                  {b.state === 'awaiting' && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">čeká</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {bestGap && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-emerald-300 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-slate-700">
              <span className="font-bold text-emerald-700">Největší volno</span>{' '}
              <span className="tabular-nums">{cas(bestGap.start)}–{cas(bestGap.end)}</span>{' '}
              <span className="text-slate-500">({durationText(bestGap.minutes)})</span>
            </p>
            <button type="button" onClick={() => setQuick(quickFromGap(cal.today, bestGap))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-orange-600">
              <Zap className="h-4 w-4" /> Vytvořit bleskový termín
            </button>
          </div>
        )}
      </section>

      {/* ── Čeká na vás ── (na mobilu nahoře, když něco čeká) */}
      <section className={`${SHELL} md:col-span-2 ${hasAwaiting ? 'order-first border-amber-200 bg-amber-50/60 md:order-none' : 'border-slate-200/80 bg-white'}`}>
        <Label icon={Hourglass} color="text-amber-500">Čeká na vás</Label>
        {hasAwaiting ? (
          <>
            <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-slate-900">{ov.awaiting.length}</p>
            <p className="text-sm text-slate-500">{ov.awaiting.length === 1 ? 'rezervace k potvrzení' : ov.awaiting.length < 5 ? 'rezervace k potvrzení' : 'rezervací k potvrzení'}</p>
            <ul className="mt-3 space-y-2">
              {ov.awaiting.slice(0, 3).map((a) => {
                const left = a.deadline ? new Date(a.deadline).getTime() - now : null
                const urgent = left != null && left < 2 * 3600_000
                return (
                  <li key={a.id}>
                    <Link href={`/dashboard/objednavky/${a.id}`} className="block rounded-2xl bg-white p-3 shadow-sm ring-1 ring-amber-100 transition hover:ring-amber-300">
                      <p className="truncate text-sm font-bold text-slate-900">{a.customer}</p>
                      <p className="truncate text-xs text-slate-600">{a.title}{a.start ? ` · ${denKratce(a.start)} ${cas(a.start)}` : ''}</p>
                      {a.deadline && (
                        <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${urgent ? 'text-red-600' : 'text-amber-700'}`}>
                          <Clock className="h-3 w-3" /> Potvrďte do {denKratce(a.deadline)} {cas(a.deadline)}
                        </p>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
            {ov.awaiting.length > 3 && <div className="mt-2"><MoreLink href="/dashboard/objednavky">Všechny</MoreLink></div>}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <p className="mt-2 font-bold text-slate-800">Vše vyřízeno</p>
            <p className="mt-0.5 text-sm text-slate-500">Nic nečeká na vaše potvrzení.</p>
          </div>
        )}
      </section>

      {/* ── Tento týden ── */}
      <section className={`${CARD} md:col-span-3`}>
        <div className="flex items-start justify-between gap-3">
          <Label icon={CalendarDays} color="text-sky-500">Tento týden</Label>
          <MoreLink href="/dashboard/kalendar?pohled=tyden">Týden</MoreLink>
        </div>
        <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-slate-900">{weekTotal}</p>
        <p className="text-sm text-slate-500">
          {weekTotal === 1 ? 'rezervace' : weekTotal > 1 && weekTotal < 5 ? 'rezervace' : 'rezervací'}
          {weekFree > 0 && <> · volno ještě {durationText(weekFree)}</>}
        </p>
        <div className="mt-4 grid grid-cols-7 items-end gap-1.5">
          {week.map((d, i) => {
            const isT = d.date === cal.today
            const past = d.date < cal.today
            const pct = d.count > 0 ? Math.max(14, Math.round((d.count / weekMax) * 100)) : 0
            return (
              <Link key={d.date} href={d.date === cal.today ? '/dashboard/kalendar' : `/dashboard/kalendar?den=${d.date}`}
                title={`${WEEKDAYS[i]} ${Number(d.date.slice(8, 10))}.: ${bookingsText(d.count).toLowerCase()}`}
                className="group flex flex-col items-center gap-1">
                <span className={`text-[11px] font-bold tabular-nums ${d.count > 0 ? 'text-slate-700' : 'text-transparent'}`}>{d.count}</span>
                <div className="flex h-20 w-full items-end justify-center rounded-lg bg-slate-50">
                  <div
                    className={`w-full rounded-lg transition group-hover:opacity-80 ${
                      d.count === 0 ? 'h-1 bg-slate-200' : isT ? 'bg-emerald-500' : past ? 'bg-slate-300' : 'bg-emerald-200'
                    }`}
                    style={d.count > 0 ? { height: `${pct}%` } : undefined}
                  />
                </div>
                <span className={`text-[11px] font-semibold ${isT ? 'text-emerald-700' : 'text-slate-400'}`}>{WEEKDAYS[i]}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── Zaplaceno přes Propojo ── */}
      <section className={`${CARD} md:col-span-3`}>
        <div className="flex items-start justify-between gap-3">
          <Label icon={Wallet} color="text-emerald-500">Zaplaceno přes Propojo · {monthName}</Label>
          <MoreLink href="/dashboard/vyplaty">Výplaty</MoreLink>
        </div>
        <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-slate-900">{kc(ov.money.paidHalere)}</p>
        <p className="text-sm text-slate-500">
          {ov.money.count === 0 ? 'Tento měsíc zatím žádná platba' : ov.money.count === 1 ? 'z 1 rezervace' : `z ${ov.money.count} rezervací`}
        </p>
        {(ov.money.feeHalere > 0 || ov.money.refundedHalere > 0) && (
          <dl className="mt-4 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Provize Propoja</dt>
              <dd className="font-semibold tabular-nums text-slate-900">−{kc(ov.money.feeHalere)}</dd>
            </div>
            {ov.money.refundedHalere > 0 && (
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-slate-600">Vráceno zákazníkům</dt>
                <dd className="font-semibold tabular-nums text-slate-900">−{kc(ov.money.refundedHalere)}</dd>
              </div>
            )}
          </dl>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Rezervační poplatky a Ceny výjezdu stržené tento měsíc. Peníze jdou rovnou na váš účet u Stripe, poplatek Stripe tu není započtený.
        </p>
      </section>

      {/* ── Hodnocení ── */}
      <section className={`${CARD} md:col-span-6`}>
        <div className="flex items-start justify-between gap-3">
          <Label icon={Star} color="text-amber-400">Hodnocení</Label>
          <MoreLink href="/dashboard/recenze">Moje recenze</MoreLink>
        </div>
        {hasRating ? (
          <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
            <div className="md:pr-6">
              <p className="text-5xl font-black tabular-nums tracking-tight text-slate-900">
                {Number(rating).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
              <Stars value={Number(rating)} />
              <p className="mt-1 text-sm text-slate-500">
                {reviewCount === 1 ? 'z 1 hodnocení' : `z ${reviewCount} hodnocení`}
              </p>
            </div>
            {ov.reviews.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {ov.reviews.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-slate-50 p-4">
                    <Stars value={r.rating} size="h-3.5 w-3.5" />
                    {r.comment
                      ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-700">„{r.comment}“</p>
                      : <p className="mt-2 text-sm italic text-slate-400">Bez komentáře</p>}
                    <p className="mt-2 text-xs text-slate-500">{r.name} · {datum(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Zatím žádné hodnocení. Ohodnotit vás můžou zákazníci po rezervaci přes Propojo.
          </p>
        )}
      </section>

      <QuickSlotModal open={quick !== null} onClose={() => setQuick(null)} initial={quick ?? undefined} />
    </div>
  )
}
