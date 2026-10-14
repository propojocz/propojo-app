// app/dashboard/layout.tsx
// Rozvržení dashboardu. Od 13. 10. 2026 bez levého menu – celá nabídka účtu (Přehled, Objednávky,
// Moje nabídky, Výplaty…) je všude stejně v menu ☰ v horní liště (components/ui/MobileNav.tsx),
// i s odznaky a Admin panelem. Tady zůstávají jen bannery nad obsahem.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SuspendedBanner from '@/components/ui/SuspendedBanner'
import ConnectBanner from '@/components/ui/ConnectBanner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard')

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <main className="min-w-0 space-y-4">
          {/* Bannery: pozastavení + výzva k dokončení plateb */}
          <SuspendedBanner />
          <ConnectBanner />
          {children}
        </main>
      </div>
    </div>
  )
}
