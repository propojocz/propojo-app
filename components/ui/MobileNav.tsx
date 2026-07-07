'use client'
// components/ui/MobileNav.tsx

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Home, ShoppingBag, PlusCircle, LogIn, LayoutDashboard, User, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface MobileNavProps {
  user: { id: string; email?: string } | null
  profileName?: string
  isProvider?: boolean
}

export default function MobileNav({ user, profileName, isProvider }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const NAV_LINKS = [
    { href: '/', label: 'Domů', icon: Home },
    { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  ]

  return (
    <>
      {/* Rychlý odkaz na marketplace – jen na mobilu */}
      <Link
        href="/marketplace"
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:hidden"
        aria-label="Nabídky"
      >
        <ShoppingBag className="h-4 w-4" />
        Nabídky
      </Link>

      {/* Hamburger tlačítko – pouze na mobilu */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 sm:hidden"
        aria-label="Otevřít menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[55] bg-slate-900/60 sm:hidden"
              style={{ backgroundColor: 'rgba(15,23,42,0.6)' }}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-[60] flex h-full w-72 flex-col bg-white shadow-2xl sm:hidden"
              style={{ backgroundColor: '#ffffff', opacity: 1 }}
            >
              {/* Plná bílá podkladová vrstva – pojistka proti prosvítání během animace */}
              <div className="absolute inset-0 -z-10 bg-white" style={{ backgroundColor: '#ffffff' }} />
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <span className="text-lg font-black text-slate-900">Menu</span>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Profil (pokud přihlášen) */}
              {user && (
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-base font-black text-indigo-700">
                    {profileName?.charAt(0)?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{profileName}</p>
                    <p className="text-xs text-slate-500">{isProvider ? '🔧 Živnostník' : '👤 Zákazník'}</p>
                  </div>
                </div>
              )}

              {/* Hlavní navigace */}
              <nav className="flex-1 overflow-y-auto py-2">
                <p className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Navigace</p>
                {NAV_LINKS.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}

                {/* Přihlášený uživatel */}
                {user && (
                  <>
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <p className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Můj účet</p>
                      <Link href="/dashboard" className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <LayoutDashboard className="h-5 w-5 shrink-0" /> Dashboard
                      </Link>
                      <Link href={`/profil/${user.id}`} className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <User className="h-5 w-5 shrink-0" /> Veřejný profil
                      </Link>
                      {isProvider && (
                        <Link href="/pridat-sluzbu" className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
                          <PlusCircle className="h-5 w-5 shrink-0" /> Přidat nabídku
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </nav>

              {/* Spodní část */}
              <div className="border-t border-slate-100 p-4 space-y-2">
                {user ? (
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-5 w-5 shrink-0" /> Odhlásit se
                  </button>
                ) : (
                  <>
                    <Link href="/prihlasit" className="btn-secondary w-full justify-center">
                      <LogIn className="h-4 w-4" /> Přihlásit se
                    </Link>
                    <Link href="/registrace" className="btn-primary w-full justify-center">
                      Začít zdarma
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}