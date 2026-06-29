// components/ui/ConnectBanner.tsx
// Banner pro poskytovatele bez napojeného Stripe účtu – zobrazí se v dashboardu.
// Bez napojeného účtu od něj zákazníci nemohou platit zálohy.
// Server komponenta: sama si načte profil přihlášeného uživatele.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Landmark, ArrowRight } from 'lucide-react'

export default async function ConnectBanner() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider, stripe_payouts_enabled')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean | null; stripe_payouts_enabled: boolean | null } | null }

  // Jen poskytovatel, který ještě nemá napojené příjmy plateb
  if (profile?.is_provider !== true) return null
  if (profile?.stripe_payouts_enabled === true) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Landmark className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold text-amber-900">Napojte si bankovní účet</p>
            <p className="mt-1 text-sm text-amber-800">
              Dokud nemáte napojený účet, zákazníci u vás nemohou zaplatit zálohu a nemůžete přijímat platby.
              Napojení zabere pár minut.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/vyplaty"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700"
        >
          Napojit účet <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}