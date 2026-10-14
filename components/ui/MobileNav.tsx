'use client'
// components/ui/MobileNav.tsx
// Univerzální menu ☰ — mobil i desktop. Od 13. 10. 2026 jediné menu účtu (dashboard už levé
// menu nemá), včetně odznaků a Admin panelu. Drawer renderovaný přes React Portal přímo
// do <body>, aby ho neovlivnil backdrop-blur na rodičovském <header>.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, X, Home, ShoppingBag, PlusCircle, LogIn, LogOut, User,
  LayoutDashboard, Package, CalendarDays, Inbox, Star, CreditCard,
  Landmark, Heart, ShieldCheck, Megaphone, Building2, QrCode,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface MobileNavProps {
  user: { id: string; email?: string } | null
  displayName?: string
  avatarUrl?: string | null
  isProvider?: boolean
  isAdmin?: boolean
  unansweredReviews?: number
  disputeCount?: number
  /** Objednávky čekající na akci zákazníka (platba, potvrzení). */
  todoCount?: number
  /** Výplaty: poskytovatel zatím nemůže přijímat rezervace s platbou (Stripe / pokyn / IČO) */
  payoutsWarn?: boolean
}

export default function MobileNav({
  user, displayName, avatarUrl, isProvider, isAdmin,
  unansweredReviews = 0, disputeCount = 0, todoCount = 0, payoutsWarn = false,
}: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])
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

  const initial = displayName?.charAt(0)?.toUpperCase() ?? 'U'

  const NAV_LINKS = [
    { href: '/', label: 'Domů', icon: Home },
    { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
    { href: '/poptavky', label: 'Poptávky', icon: Megaphone },
  ]

  // Jediné menu účtu (od 13. 10. 2026 bez levého menu v dashboardu) – všude stejné, i s odznaky.
  // Skupiny podle toho, co člověk dělá: objednávky a poptávky → moje podnikání → účet a platby.
  type AccountLink = { href: string; label: string; icon: any; badge?: number; warn?: boolean }
  const ACCOUNT_GROUPS: { title: string; items: AccountLink[] }[] = user ? [
    {
      title: 'Objednávky a poptávky',
      items: [
        { href: '/dashboard/objednavky', label: 'Objednávky', icon: Inbox, badge: todoCount },
        { href: '/dashboard/poptavky', label: 'Moje poptávky', icon: Megaphone },
        { href: '/dashboard/oblibene', label: 'Oblíbené', icon: Heart },
      ],
    },
    ...(isProvider ? [{
      title: 'Moje podnikání',
      items: [
        { href: '/dashboard/nabidky', label: 'Moje nabídky', icon: Package },
        { href: '/dashboard/terminy', label: 'Termíny', icon: CalendarDays },
        { href: '/dashboard/recenze', label: 'Moje recenze', icon: Star, badge: unansweredReviews },
        { href: '/dashboard/znacka', label: 'Značka', icon: Building2 },
        { href: '/dashboard/qr', label: 'QR kód', icon: QrCode },
      ],
    }] : []),
    {
      title: 'Účet a platby',
      items: [
        ...(isProvider ? [{ href: '/dashboard/vyplaty', label: 'Výplaty', icon: Landmark, warn: payoutsWarn }] : []),
        ...(isProvider ? [{ href: '/dashboard/predplatne', label: 'Předplatné', icon: CreditCard }] : []),
        { href: '/dashboard/profil', label: 'Můj profil', icon: User },
      ],
    },
  ] : []
  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(href + '/'))

  const totalBadge = unansweredReviews + todoCount + (isAdmin ? disputeCount : 0) + (payoutsWarn ? 1 : 0)

  const drawer = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[9998]"
            style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-0 top-0 z-[9999] flex h-full w-full max-w-[360px] flex-col shadow-2xl"
            style={{ backgroundColor: '#ffffff' }}
          >
            {/* Hlavička */}
            <div className="flex items-center gap-3 border-b border-slate-100 p-4">
              {user ? (
                <>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-base font-bold text-emerald-700">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{displayName}</p>
                    <p className="text-xs text-slate-500">{isProvider ? '🔧 Živnostník' : '👤 Zákazník'}</p>
                  </div>
                </>
              ) : (
                <p className="flex-1 text-lg font-bold text-slate-900">Menu</p>
              )}
              <button onClick={() => setOpen(false)} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Zavřít menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {user && (
                <div className="px-3 pb-1 pt-2">
                  <Link
                    href="/pridat-sluzbu"
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                      isProvider ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <PlusCircle className="h-4 w-4" />
                    {isProvider ? 'Přidat nabídku' : 'Nabídnout službu'}
                  </Link>
                </div>
              )}

              <p className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Navigace</p>
              {NAV_LINKS.map((item) => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
                      active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}>
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}

              {user && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <Link href="/dashboard"
                    className={`flex items-center gap-3 px-5 py-4 text-base font-bold transition-colors ${isActive('/dashboard') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-900 hover:bg-slate-50'}`}>
                    <LayoutDashboard className="h-6 w-6 shrink-0" />
                    <span className="flex-1">Přehled</span>
                  </Link>
                  {ACCOUNT_GROUPS.map((group) => (
                    <div key={group.title} className="mt-1">
                      <p className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-slate-400">{group.title}</p>
                      {group.items.map((item) => (
                        <Link key={item.href} href={item.href}
                          className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${isActive(item.href) ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                          <item.icon className="h-5 w-5 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {!!item.badge && item.badge > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                              {item.badge}
                            </span>
                          )}
                          {item.warn && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-black text-white" title="Dokončete nastavení plateb">!</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {isAdmin && (
                <div className="mt-2 px-3">
                  <Link href="/admin" className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">
                    <ShieldCheck className="h-4 w-4" />
                    Admin panel
                    {disputeCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {disputeCount}
                      </span>
                    )}
                  </Link>
                  <p className="mt-1.5 text-center text-[11px] text-slate-400">Zobrazuje se jen administrátorům</p>
                </div>
              )}
            </nav>

            <div className="border-t border-slate-100 p-4">
              {user ? (
                <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
                  <LogOut className="h-5 w-5 shrink-0" /> Odhlásit se
                </button>
              ) : (
                <div className="space-y-2">
                  <Link href="/prihlasit" className="btn-secondary w-full justify-center">
                    <LogIn className="h-4 w-4" /> Přihlásit se
                  </Link>
                  <Link href="/registrace" className="btn-primary w-full justify-center">
                    Začít zdarma
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-2 rounded-full border border-slate-200 py-1.5 pl-3 pr-1.5 text-slate-600 transition-colors hover:bg-slate-50"
        aria-label="Otevřít menu"
      >
        <Menu className="h-5 w-5" />
        {user && (
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : initial}
          </span>
        )}
        {totalBadge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </button>

      {mounted && createPortal(drawer, document.body)}
    </>
  )
}