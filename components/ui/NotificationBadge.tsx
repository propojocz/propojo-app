'use client'
// components/ui/NotificationBadge.tsx
// Zvoneček s počtem nepřečtených + rozbalovací panel s náhledy.
// Polling každých 30 s. Po otevření panelu se nepřečtené označí jako přečtené.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, MessageSquare, RefreshCw, AlertTriangle } from 'lucide-react'
import { markAllNotificationsRead } from '@/lib/actions/notifications'

type NotifItem = {
  id: string
  type: string
  order_id: string | null
  title: string
  preview: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'právě teď'
  if (min < 60) return `před ${min} min`
  const hod = Math.floor(min / 60)
  if (hod < 24) return `před ${hod} h`
  const dny = Math.floor(hod / 24)
  return `před ${dny} d`
}

export default function NotificationBadge() {
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<NotifItem[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const data = await res.json()
      setCount(data.count ?? 0)
      setItems(data.items ?? [])
    } catch {}
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Zavření panelu při kliknutí mimo
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleOpen = async () => {
    const next = !open
    setOpen(next)
    // Při otevření označíme nepřečtené jako přečtené a vynulujeme počet
    if (next && count > 0) {
      setCount(0)
      await markAllNotificationsRead()
    }
  }

  // Cílový odkaz notifikace: objednávka → detail, pozastavení → dashboard
  const notifHref = (n: NotifItem): string | null => {
    if (n.order_id) return `/dashboard/objednavky/${n.order_id}`
    if (n.type === 'account_suspended') return '/dashboard'
    return null
  }

  return (
    <div ref={wrapRef} className="relative ml-1">
      <button
        onClick={toggleOpen}
        className="relative rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100"
        title="Oznámení"
        aria-label="Oznámení"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Oznámení</h3>
            <button onClick={fetchData} className="text-slate-400 hover:text-slate-600" title="Obnovit">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Žádná oznámení.</p>
            ) : (
              items.map((n) => {
                const suspended = n.type === 'account_suspended'
                const iconWrap = suspended
                  ? 'bg-red-100 text-red-600'
                  : n.type === 'new_message'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-emerald-100 text-emerald-600'

                const inner = (
                  <div className={`flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${n.read_at === null ? 'bg-emerald-50/50' : ''}`}>
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconWrap}`}>
                      {suspended ? <AlertTriangle className="h-4 w-4" /> : n.type === 'new_message' ? <MessageSquare className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                      {n.preview && <p className="truncate text-sm text-slate-500">{n.preview}</p>}
                      <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                )

                const href = notifHref(n)
                return href ? (
                  <Link key={n.id} href={href} onClick={() => setOpen(false)} className="block border-b border-slate-50 last:border-0">
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id} className="border-b border-slate-50 last:border-0">{inner}</div>
                )
              })
            )}
          </div>

          <Link
            href="/dashboard/objednavky"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-emerald-600 hover:bg-slate-50"
          >
            Zobrazit všechny objednávky
          </Link>
        </div>
      )}
    </div>
  )
}