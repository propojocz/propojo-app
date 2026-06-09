// components/ui/Navbar.tsx
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { PlusCircle, LogIn } from 'lucide-react'
import NavUserMenu from './NavUserMenu'
import NotificationBadge from './NotificationBadge'
import MobileNav from './MobileNav'
 
export default async function Navbar() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
 
  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, is_provider')
      .eq('id', user.id)
      .single()
    profile = data
  }
 
  return (
    <header className="sticky top-0 z-50 border-b border-[#7ab937]/20 bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
 
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/propojo-logo.png" alt="Propojo" width={120} height={40} className="h-9 w-auto object-contain" priority />
        </Link>
 
        {/* Desktop navigace */}
        <div className="hidden items-center gap-1 sm:flex">
          <Link href="/marketplace" className="rounded-lg px-3 py-2 text-sm font-medium text-[#7ab937] transition-colors hover:bg-[#7ab937]/10 hover:text-[#7ab937]">
            Tržiště
          </Link>
          <Link href="/jak-to-funguje" className="rounded-lg px-3 py-2 text-sm font-medium text-[#7ab937] transition-colors hover:bg-[#7ab937]/10 hover:text-[#7ab937]">
            Jak to funguje
          </Link>
        </div>
 
        {/* Pravá část */}
        <div className="flex items-center gap-1">
          {user ? (
            <>
              {/* Desktop tlačítka */}
              <Link href="/pridat-sluzbu" className="btn-primary hidden sm:inline-flex">
                <PlusCircle className="h-4 w-4" />
                Přidat službu
              </Link>
              <NotificationBadge />
              <NavUserMenu
                name={profile?.full_name ?? user.email ?? 'Uživatel'}
                avatarUrl={profile?.avatar_url ?? null}
                userId={user.id}
              />
            </>
          ) : (
            <>
              {/* Desktop přihlášení */}
              <Link href="/prihlasit" className="btn-secondary hidden sm:inline-flex">
                <LogIn className="h-4 w-4" />
                Přihlásit se
              </Link>
              <Link href="/registrace" className="btn-primary hidden sm:inline-flex">
                Začít zdarma
              </Link>
            </>
          )}
 
          {/* Mobilní hamburger */}
          <MobileNav
            user={user ? { id: user.id, email: user.email } : null}
            profileName={profile?.full_name ?? user?.email}
            isProvider={profile?.is_provider ?? false}
          />
        </div>
      </nav>
    </header>
  )
}

