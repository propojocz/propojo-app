'use client'
// components/ui/RecentlyViewed.tsx
// „Naposledy prohlížené“ (20. 10. 2026, Matej: ať se zákazník snadno vrátí). Seznam karet, které si
// zákazník otevřel, se drží jen v jeho prohlížeči (localStorage – na tomhle zařízení, nic na serveru).
// RememberViewed se vkládá na detail karty a zapisuje; RecentlyViewed na marketplace ukazuje pás.

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { getRecentServices } from '@/lib/actions/recent-services'
import MarketCarousel from '@/components/ui/MarketCarousel'
import MiniServiceCard, { type MiniCard } from '@/components/ui/MiniServiceCard'

const KEY = 'propojo:recent-services'
const MAX = 12

function readIds(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Na detailu karty: zapamatovat, že si ji zákazník prohlédl (nejnovější první) */
export function RememberViewed({ serviceId }: { serviceId: string }) {
  useEffect(() => {
    try {
      const next = [serviceId, ...readIds().filter((x) => x !== serviceId)].slice(0, MAX)
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch { /* prohlížeč ukládání nepovolil – nic se neděje */ }
  }, [serviceId])
  return null
}

export default function RecentlyViewed() {
  const [cards, setCards] = useState<MiniCard[]>([])

  useEffect(() => {
    const ids = readIds()
    if (ids.length === 0) return
    let cancelled = false
    getRecentServices(ids).then((r) => { if (!cancelled) setCards(r) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (cards.length === 0) return null
  return (
    <MarketCarousel title="Naposledy prohlížené" icon={<Clock className="h-6 w-6 text-sky-500" />} count={cards.length}>
      {cards.map((c) => <MiniServiceCard key={c.id} card={c} />)}
    </MarketCarousel>
  )
}
