'use client'
// components/ui/ViewTracker.tsx
// Zaznamenává zobrazení služby - volá se při načtení detail stránky

import { useEffect } from 'react'

export default function ViewTracker({ serviceId }: { serviceId: string }) {
  useEffect(() => {
    // Odešle view po 2 sekundách (aby se nepočítaly bounces)
    const timeout = setTimeout(() => {
      fetch('/api/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId }),
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(timeout)
  }, [serviceId])

  return null
}
