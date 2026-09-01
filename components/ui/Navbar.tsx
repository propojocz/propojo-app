// components/ui/Navbar.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import NotificationBadge from './NotificationBadge'
import MobileNav from './MobileNav'
import SuspendedTopBar from './SuspendedTopBar'
import { getCustomerTodoCount, getProviderTodoCount } from '@/lib/actions/order-alerts'

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
      .select('full_name, company_name, avatar_url, is_provider, is_admin, reviews_seen_at')
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
      // Odznak ukazuje jen recenze, které přišly OD POSLEDNÍHO otevření
      // stránky s recenzemi — po návštěvě tedy zhasne.
      let dotaz = admin
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', user!.id)
        .is('reported_at', null)
      if (profile?.reviews_seen_at) {
        dotaz = dotaz.gt('created_at', profile.reviews_seen_at)
      }
      const { count } = await dotaz
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

  // Objednávky čekající na MOJI akci. Sčítá obě role: člověk bývá zároveň
  // zákazník i poskytovatel a obojí vede na stejnou stránku objednávek —
  // dvě čísla vedle sebe by jen mátla.
  //
  // Pro poskytovatele je to důležité hlavně u výrobků: čekající objednávka mu
  // po 24 h propadne a bez odznaku by o tom věděl jen z notifikace.
  const [customerTodo, providerTodo] = user
    ? await Promise.all([
        getCustomerTodoCount(),
        isProvider ? getProviderTodoCount() : Promise.resolve(0),
      ])
    : [0, 0]
  const todoCount = customerTodo + providerTodo

  // Světlé postranní tlačítko (Poptávky, Objednávky) — jen na desktopu
  const sideBtn =
    'hidden md:inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100'

  return (
    <>
      <SuspendedTopBar />

      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        {/* Mřížka o třech sloupcích na VŠECH velikostech.
            Prostřední sloupec je vždy vyplněný (na mobilu aspoň Marketplace),
            takže logo drží vlevo a zvoneček s pilulkou vpravo. */}
        <nav className="mx-auto grid h-[88px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-6 lg:px-8">

          {/* VLEVO — logo (vodorovná verze: symbol + nápis vedle sebe) */}
          <div className="flex justify-start">
            <Link href="/" className="flex items-center">
              { /* Obyčejný <img> — Next.js optimalizace tenhle obrázek
                   na produkci nenačítala. */ }
              <img
                src="/propojo-logo-full.png"
                alt="Propojo"
                className="h-14 w-auto object-contain md:h-16"
              />
            </Link>
          </div>

          {/* UPROSTŘED — Marketplace vždy (i na mobilu, i pro nepřihlášené).
              Poptávky a Objednávky se přidají až na desktopu. */}
          <div className="flex items-center justify-center gap-2">
            <Link href="/poptavky" className={sideBtn}>
              Poptávky
            </Link>

            <Link
              href="/marketplace"
              className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md"
            >
              Marketplace
            </Link>

            <Link
              href={user ? '/dashboard/objednavky' : '/prihlasit?next=/dashboard/objednavky'}
              className={`${sideBtn} relative`}
            >
              Objednávky
              {todoCount > 0 && (
                <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                  {todoCount}
                </span>
              )}
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
              todoCount={todoCount}
            />
          </div>
        </nav>
      </header>
    </>
  )
}