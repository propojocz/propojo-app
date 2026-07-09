// components/ui/Navbar.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import Image from 'next/image'
import NotificationBadge from './NotificationBadge'
import MobileNav from './MobileNav'
import SuspendedTopBar from './SuspendedTopBar'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function Navbar() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, company_name, avatar_url, is_provider, is_admin')
      .eq('id', user.id)
      .single() as { data: any }
    profile = data
  }

  const isProvider = profile?.is_provider === true
  const isAdmin = profile?.is_admin === true
  const displayName = profile?.company_name || profile?.full_name || user?.email || 'Uživatel'

  // Odznaky s počty — jen pro přihlášené poskytovatele/adminy.
  let unansweredReviews = 0
  let disputeCount = 0
  if (isProvider || isAdmin) {
    const admin = getAdminClient()
    if (isProvider) {
      const { count } = await admin
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', user!.id)
        .is('provider_response', null)
        .is('reported_at', null)
      unansweredReviews = count ?? 0
    }
    if (isAdmin) {
      const { count } = await admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'spor')
      disputeCount = count ?? 0
    }
  }

  // Světlé postranní tlačítko (Poptávky, Objednávky) — stejný styl pro oba
  const sideBtn =
    'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100'

  return (
    <>
      <SuspendedTopBar />

      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <nav className="mx-auto grid h-[60px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">

          {/* VLEVO — logo (o kousek sytější) */}
          <div className="flex justify-start">
            <Link href="/" className="flex items-center">
              <Image
                src="/propojo-logo.png"
                alt="Propojo"
                width={120}
                height={40}
                priority
                className="h-9 w-auto object-contain [filter:saturate(1.25)]"
              />
            </Link>
          </div>

          {/* UPROSTŘED — Poptávky · Marketplace · Objednávky (jen desktop) */}
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/poptavky" className={sideBtn}>
              Poptávky
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md"
            >
              Marketplace
            </Link>
            <Link
              href={user ? '/dashboard/objednavky' : '/prihlasit?next=/dashboard/objednavky'}
              className={sideBtn}
            >
              Objednávky
            </Link>
          </div>

          {/* VPRAVO — zvoneček + pilulka ☰ profil */}
          <div className="flex items-center justify-end gap-1.5">
            {user && <NotificationBadge />}
            <MobileNav
              user={user ? { id: user.id, email: user.email } : null}
              displayName={displayName}
              avatarUrl={profile?.avatar_url ?? null}
              isProvider={isProvider}
              isAdmin={isAdmin}
              unansweredReviews={unansweredReviews}
              disputeCount={disputeCount}
            />
          </div>
        </nav>
      </header>
    </>
  )
}