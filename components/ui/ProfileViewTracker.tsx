'use client'
import { useEffect, useRef } from 'react'
import { incrementProfileView } from '@/lib/actions/views'

// Neviditelná komponenta. Po načtení profilu jednou zaznamená zhlédnutí.
export default function ProfileViewTracker({ providerId }: { providerId: string }) {
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    incrementProfileView(providerId)
  }, [providerId])

  return null
}