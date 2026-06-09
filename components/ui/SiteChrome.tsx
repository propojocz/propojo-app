'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export default function SiteChrome({
  navbar,
  footer,
  children,
}: {
  navbar: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()

  // Stránky s vlastním celostránkovým designem – bez appkové hlavičky a patičky.
  // Až budeme předělávat registraci/onboarding podle mockupů, přidáme je sem.
  const hideChrome =
    pathname === '/' ||
    pathname.startsWith('/prihlasit')

  return (
    <>
      {!hideChrome && navbar}
      <div className="flex-1">{children}</div>
      {!hideChrome && footer}
    </>
  )
}