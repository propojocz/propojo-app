'use client'
// components/ui/InboxButton.tsx
// Ikona zpráv v horní liště (část B, 9. 10. 2026): počet nepřečtených a výsuvný přehled všech
// rozjednaných chatů – objednávky i jednání o poptávkách, nejnovější nahoře.
// Panel se vykresluje přes portál do <body> (horní lišta má rozmazané pozadí a ořízla by ho).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageCircle, X } from 'lucide-react'
import { getInbox, type InboxThread } from '@/lib/actions/inbox'

function kdy(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return new Intl.DateTimeFormat('cs-CZ', sameDay
    ? { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }
    : { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' }).format(d)
}

export default function InboxButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [threads, setThreads] = useState<InboxThread[] | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => setMounted(true), [])

  // Počet nepřečtených: při načtení, změně stránky (otevřený chat se označí jako přečtený) a každou minutu
  useEffect(() => {
    let cancelled = false
    const load = () => getInbox().then((r) => { if (!cancelled) setUnread(r.unread) }).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [pathname])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setThreads(null)
    getInbox().then((r) => { if (!cancelled) { setThreads(r.threads); setUnread(r.unread) } })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { cancelled = true; document.body.style.overflow = prev }
  }, [open])

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="inbox-overlay"
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
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-black text-slate-900">Zprávy</p>
                  <p className="text-xs text-slate-500">Objednávky i jednání o poptávkách</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label="Zavřít">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {threads === null ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
                </div>
              ) : threads.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
                    <MessageCircle className="h-7 w-7" />
                  </span>
                  <p className="mt-4 font-bold text-slate-700">Zatím žádné zprávy</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Jakmile si s někým napíšete, najdete chat tady.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {threads.map((t) => (
                    <Link
                      key={t.key}
                      href={t.href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-2xl border px-4 py-3 transition hover:border-emerald-200 hover:bg-white ${
                        t.unread > 0 ? 'border-emerald-200 bg-white shadow-sm' : 'border-transparent'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-sm ${t.unread > 0 ? 'font-black text-slate-900' : 'font-semibold text-slate-800'}`}>{t.counterpart}</p>
                        <span className="shrink-0 text-[11px] text-slate-400">{kdy(t.lastAt)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {t.kind === 'request' && <span className="mr-1 rounded bg-sky-50 px-1 py-0.5 text-[10px] font-semibold text-sky-700">jednání</span>}
                        {t.subject}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${t.unread > 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                          {t.lastFromMe ? 'Vy: ' : ''}{t.lastText}
                        </p>
                        {t.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{t.unread}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
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
        className="relative flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10 text-slate-600 transition hover:bg-slate-100"
        aria-label="Zprávy"
        title="Zprávy"
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {mounted && createPortal(panel, document.body)}
    </>
  )
}
