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
  const hideChrome =
    pathname.startsWith('/prihlasit') ||
    pathname.startsWith('/registrace')

  return (
    <>
      {!hideChrome && navbar}
      <div className="flex-1">{children}</div>
      {!hideChrome && footer}
    </>
  )
}