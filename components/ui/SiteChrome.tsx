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
  const isLanding = pathname === '/'

  return (
    <>
      {!isLanding && navbar}
      <div className="flex-1">{children}</div>
      {!isLanding && footer}
    </>
  )
}