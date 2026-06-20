// app/dashboard/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Package, ShoppingBag, User, LogOut, ChevronRight } from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import MobileDashboardNav from './MobileDashboardNav'
import Avatar from '@/components/ui/Avatar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, is_provider')
    .eq('id', user.id)
    .single() as { data: { full_name: string; avatar_url: string | null; is_provider: boolean } | null }

  const isProvider = profile?.is_provider === true

  const NAV = [
    { href: '/dashboard', label: 'Přehled', icon: 'LayoutDashboard' },
    ...(isProvider ? [{ href: '/dashboard/nabidky', label: 'Moje nabídky', icon: 'Package' }] : []),
    { href: '/dashboard/objednavky', label: isProvider ? 'Poptávky' : 'Objednávky', icon: 'ShoppingBag' },
    { href: '/dashboard/profil', label: 'Profil', icon: 'User' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobilní navigace */}
      <MobileDashboardNav
        nav={NAV}
        isProvider={isProvider}
        profileName={profile?.full_name ?? 'Uživatel'}
      />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-8">

          {/* Desktop sidebar */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Avatar name={profile?.full_name} url={profile?.avatar_url} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{profile?.full_name ?? 'Uživatel'}</p>
                  <p className="text-xs text-slate-500">{isProvider ? '🔧 Živnostník' : '👤 Zákazník'}</p>
                </div>
              </div>
            </div>

            <nav className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-100 last:border-0">
                  {item.icon === 'LayoutDashboard' && <LayoutDashboard className="h-4 w-4 shrink-0" />}
                  {item.icon === 'Package' && <Package className="h-4 w-4 shrink-0" />}
                  {item.icon === 'ShoppingBag' && <ShoppingBag className="h-4 w-4 shrink-0" />}
                  {item.icon === 'User' && <User className="h-4 w-4 shrink-0" />}
                  {item.label}
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
                </Link>
              ))}
              <form action={logout}>
                <button type="submit" className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 border-t border-slate-100">
                  <LogOut className="h-4 w-4 shrink-0" /> Odhlásit se
                </button>
              </form>
            </nav>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}