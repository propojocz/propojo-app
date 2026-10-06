'use client'
// components/ui/ProfileNameLink.tsx
// Klikací jméno poskytovatele → jeho veřejný profil (odtud jde rovnou znovu objednat).
// Funguje i uvnitř karty, která sama je odkazem (seznam objednávek, kalendářový panel):
// vnořený <a> HTML nedovoluje, proto span s navigací, která nepustí klik do karty.

import { useRouter } from 'next/navigation'
import type { ReactNode, MouseEvent, KeyboardEvent } from 'react'

export default function ProfileNameLink({
  id,
  children,
  className = '',
  onNavigate,
}: {
  id: string
  children: ReactNode
  className?: string
  /** Např. zavřít panel, ze kterého se odchází */
  onNavigate?: () => void
}) {
  const router = useRouter()
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onNavigate?.()
    router.push(`/profil/${id}`)
  }
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter') go(e) }}
      title="Zobrazit profil poskytovatele"
      className={`cursor-pointer font-semibold text-emerald-700 underline-offset-2 hover:underline ${className}`}
    >
      {children}
    </span>
  )
}
