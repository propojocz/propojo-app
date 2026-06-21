// app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Inbox, Users, AlertTriangle, ShieldCheck } from 'lucide-react'

export const metadata = { title: 'Admin | Propojo' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/admin')

  // Ochrana: dovnitř jen admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single() as { data: { is_admin: boolean } | null }

  if (profile?.is_admin !== true) redirect('/dashboard')

  const NAV = [
    { href: '/admin/poptavky', label: 'Poptávky', icon: 'Inbox', ready: true },
    { href: '/admin/uzivatele', label: 'Uživatelé', icon: 'Users', ready: true },
    { href: '/admin/spory', label: 'Spory', icon: 'AlertTriangle', ready: false },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black text-slate-900">Admin</p>
                <p className="text-xs text-slate-500">Propojo</p>
              </div>
            </div>

            <nav className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {NAV.map((item) => (
                item.ready ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition-colors last:border-0 hover:bg-slate-50"
                  >
                    {item.icon === 'Inbox' && <Inbox className="h-4 w-4 shrink-0 text-slate-400" />}
                    {item.icon === 'Users' && <Users className="h-4 w-4 shrink-0 text-slate-400" />}
                    {item.label}
                  </Link>
                ) : (
                  <div
                    key={item.href}
                    className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-300 last:border-0"
                  >
                    {item.icon === 'AlertTriangle' && <AlertTriangle className="h-4 w-4 shrink-0" />}
                    {item.label}
                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">brzy</span>
                  </div>
                )
              ))}
            </nav>
          </aside>

          {/* Obsah */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}