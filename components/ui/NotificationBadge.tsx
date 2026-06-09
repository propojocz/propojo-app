'use client'
// components/ui/NotificationBadge.tsx
// Červená tečka s počtem notifikací – polling každých 30 sekund

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'

export default function NotificationBadge() {
  const [count, setCount] = useState(0)

  const fetchCount = async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const data = await res.json()
      setCount(data.count ?? 0)
    } catch {}
  }

  useEffect(() => {
    fetchCount()
    // Polling každých 30 sekund
    const interval = setInterval(fetchCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Link
      href="/dashboard/objednavky"
      className="relative ml-1 rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100"
      title="Dashboard"
    >
      <LayoutDashboard className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
