'use client'
// components/ui/HideOnPath.tsx
// Schová obsah na vyjmenovaných stránkách. Slouží serverovým komponentám,
// které samy nevědí, na jaké adrese se vykreslují — třeba upozorňovací
// bannery v layoutu, které na své vlastní cílové stránce jen zdvojují text.

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export default function HideOnPath({
  paths, children,
}: {
  /** Cesty, kde se obsah NEMÁ zobrazit. Porovnává se začátek adresy. */
  paths: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  if (paths.some(p => pathname.startsWith(p))) return null
  return <>{children}</>
}