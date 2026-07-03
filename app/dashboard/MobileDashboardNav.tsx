'use client'
// app/dashboard/MobileDashboardNav.tsx

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Package, ShoppingBag, User,
  PlusCircle, LogOut, Menu, X, ChevronRight,
  CalendarDays, CreditCard, Landmark
} from 'lucide-react'
import { logout } from '@/lib/actions/auth'

const ICONS: Record<string, any> = {
  LayoutDashboard, Package, ShoppingBag, User,
  CalendarDays, CreditCard, Landmark,
}

interface NavItem {
  href: string
  label: string
  icon: string
}

interface Props {
  nav: NavItem[]
  isProvider: boolean
  profileName: string
}

export default function MobileDashboardNav({ nav, isProvider, profileName }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Zavři při navigaci
  useEffect(() => { setOpen(false) }, [pathname])

  // Zablokuj scroll když je menu otevřené
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Mobilní header */}
      <div className="sticky top-16 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {profileName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-bold text-slate-900">
            {nav.find(n => n.href === pathname)?.label ?? 'Dashboard'}
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Menu className="h-4 w-4" />
          Menu
        </button>
      </div>

      {/* Overlay + drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
            />

            {/* Drawer zprava */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl lg:hidden"
            >
              {/* Header draweru */}
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-base font-black text-indigo-700">
                    {profileName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{profileName}</p>
                    <p className="text-xs text-slate-500">{isProvider ? '🔧 Živnostník' : '👤 Zákazník'}</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Přidat nabídku */}
              {isProvider && (
                <div className="p-4 border-b border-slate-100">
                  <Link href="/pridat-sluzbu" className="btn-primary w-full justify-center text-sm">
                    <PlusCircle className="h-4 w-4" /> Přidat nabídku
                  </Link>
                </div>
              )}

              {/* Navigace */}
              <nav className="flex-1 overflow-y-auto py-2">
                {nav.map((item) => {
                  const Icon = ICONS[item.icon]
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5 shrink-0" />}
                      {item.label}
                      {isActive && <ChevronRight className="ml-auto h-4 w-4 text-indigo-400" />}
                    </Link>
                  )
                })}
              </nav>

              {/* Odhlášení */}
              <div className="border-t border-slate-100 p-4">
                <form action={logout}>
                  <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                    <LogOut className="h-5 w-5 shrink-0" />
                    Odhlásit se
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spodní tab bar pro rychlou navigaci na mobilu */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-around px-2 py-2">
          {nav.slice(0, 4).map((item) => {
            const Icon = ICONS[item.icon]
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {Icon && (
                  <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                )}
                {item.label.split(' ')[0]}
                {isActive && <div className="h-1 w-1 rounded-full bg-indigo-600" />}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Padding pro tab bar na mobilu */}
      <div className="h-16 lg:hidden" />
    </>
  )
}