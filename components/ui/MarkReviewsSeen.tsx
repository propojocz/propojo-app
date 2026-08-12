'use client'
// components/ui/MarkReviewsSeen.tsx
// Neviditelná komponenta — po otevření stránky s recenzemi zapíše,
// že je poskytovatel viděl, a odznak v menu zhasne.
//
// Použití: na stránce /dashboard/recenze stačí vložit <MarkReviewsSeen />

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { markReviewsSeen } from '@/lib/actions/reviews-seen'

export default function MarkReviewsSeen() {
  const router = useRouter()

  useEffect(() => {
    let zive = true
    markReviewsSeen().then(res => {
      // Překreslíme menu, ať odznak zhasne hned a ne až po dalším načtení.
      if (zive && res.success) router.refresh()
    })
    return () => { zive = false }
  }, [router])

  return null
}