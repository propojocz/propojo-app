'use client'
// components/ui/UpcomingDrawer.tsx
// Výsuvný panel z boku: nadcházející rezervace nového modelu pro obě role (zákazník i poskytovatel),
// seskupené po dnech, se stavem a přidáním do kalendáře. „Potvrzeno“ jen u stržené platby.
//
// Panel se vykresluje přes portál do <body>: horní lišta má rozmazané pozadí (backdrop-filter),
// a uvnitř ní by se „fixed“ panel ořízl na výšku lišty.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronRight, Loader2, MapPin, X, Zap } from 'lucide-react'
import { getUpcomingBookings, type UpcomingBooking } from '@/lib/actions/booking'
import { getQuickSlotCards } from '@/lib/actions/slots'
import QuickSlotForm from '@/components/ui/QuickSlotForm'
import ProfileNameLink from '@/components/ui/ProfileNameLink'
import AddToCalendarButtons from '@/components/ui/AddToCalendarButtons'

const TZ = 'Europe/Prague'

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  confirmed: { text: 'Potvrzeno', cls: 'bg-emerald-100 text-emerald-700' },
  awaiting_confirmation: { text: 'Čeká na potvrzení', cls: 'bg-amber-100 text-amber-700' },
  capture_in_progress: { text: 'Potvrzuje se', cls: 'bg-amber-100 text-amber-700' },
  pending_payment: { text: 'Čeká na platbu', cls: 'bg-slate-100 text-slate-600' },
}

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

function dayLabel(iso: string): string {
  const k = dayKey(iso)
  if (k === dayKey(new Date().toISOString())) return 'Dnes'
  if (k === dayKey(new Date(Date.now() + 24 * 3600_000).toISOString())) return 'Zítra'
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
}

function time(iso: string): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export default function UpcomingDrawer() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UpcomingBooking[] | null>(null)
  const [mounted, setMounted] = useState(false)
  // Poskytovatel: rychlé vypsání volného termínu přímo z panelu
  const [slotCards, setSlotCards] = useState<{ id: string; title: string }[] | null>(null)
  const [quickSlot, setQuickSlot] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setItems(null)
    setQuickSlot(false)
    getUpcomingBookings().then((r) => { if (!cancelled) setItems(r) })
    getQuickSlotCards().then((r) => { if (!cancelled) setSlotCards(r.isProvider ? r.cards : null) })
    // Za otevřeným panelem se stránka neroluje
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { cancelled = true; document.body.style.overflow = prev }
  }, [open])

  // Seskupení po dnech (pražské datum)
  const groups: { label: string; items: UpcomingBooking[] }[] = []
  for (const b of items ?? []) {
    const label = dayLabel(b.startIso)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(b)
    else groups.push({ label, items: [b] })
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="upcoming-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex justify-end bg-slate-900/30"
          onClick={() => setOpen(false)}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col bg-slate-50 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-black text-slate-900">Nadcházející rezervace</p>
                  <p className="text-xs text-slate-500">Jako zákazník i jako poskytovatel</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label="Zavřít">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {slotCards !== null && (
                <div className="mb-4">
                  {quickSlot ? (
                    <QuickSlotForm cards={slotCards} onClose={() => setQuickSlot(false)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setQuickSlot(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-300 bg-white px-4 py-3 text-sm font-bold text-orange-700 transition hover:border-orange-400 hover:bg-orange-50"
                    >
                      <Zap className="h-4 w-4 fill-orange-400 text-orange-500" /> Vypsat volný termín
                    </button>
                  )}
                </div>
              )}
              {items === null ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
                    <CalendarDays className="h-7 w-7" />
                  </span>
                  <p className="mt-4 font-bold text-slate-700">Žádné nadcházející rezervace</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Jakmile si něco zarezervujete nebo vám přijde rezervace, uvidíte ji tady.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.label}>
                      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">{g.label}</p>
                      <div className="space-y-2.5">
                        {g.items.map((b) => {
                          const st = STATE_LABEL[b.state] ?? { text: b.state, cls: 'bg-slate-100 text-slate-600' }
                          const potvrzeno = b.state === 'confirmed'
                          return (
                            <article
                              key={b.orderId}
                              className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${b.role === 'provider' ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-emerald-400'}`}
                            >
                              <Link
                                href={`/dashboard/objednavky/${b.orderId}`}
                                onClick={() => setOpen(false)}
                                className="flex items-start gap-3 p-3.5 transition hover:bg-slate-50"
                              >
                                <div className="w-14 shrink-0 text-center">
                                  <p className="text-base font-black leading-tight text-slate-900">{time(b.startIso)}</p>
                                  {b.endIso && b.arrivalWindow && (
                                    <p className="text-[11px] font-semibold text-slate-400">do {time(b.endIso)}</p>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate font-bold text-slate-900">{b.itemName}</p>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {b.role === 'provider' ? 'Zákazník' : 'Poskytovatel'}:{' '}
                                    {b.role === 'customer'
                                      ? <ProfileNameLink id={b.counterpartId} onNavigate={() => setOpen(false)}>{b.counterpart}</ProfileNameLink>
                                      : b.counterpart}
                                    {b.arrivalWindow ? ' · okno příjezdu' : ''}
                                  </p>
                                  {b.place && (
                                    <p className="mt-1 flex items-start gap-1 text-xs text-slate-600">
                                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                      <span className="line-clamp-2">{b.place}</span>
                                    </p>
                                  )}
                                </div>
                                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                              </Link>
                              {potvrzeno && (
                                <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
                                  <AddToCalendarButtons
                                    orderId={b.orderId}
                                    title={b.arrivalWindow && b.role === 'customer' ? `Přijede poskytovatel: ${b.itemName}` : b.itemName}
                                    startIso={b.startIso}
                                    endIso={b.endIso}
                                    place={b.place}
                                    arrivalWindow={b.arrivalWindow}
                                  />
                                </div>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-3 text-[11px] leading-relaxed text-slate-400">
              <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> jako zákazník</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> jako poskytovatel</span>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
        aria-label="Nadcházející rezervace"
        title="Nadcházející rezervace"
      >
        <CalendarDays className="h-5 w-5" />
      </button>
      {mounted && createPortal(panel, document.body)}
    </>
  )
}
