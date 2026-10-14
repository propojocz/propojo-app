// components/ui/ConnectBanner.tsx
// Banner pro poskytovatele bez napojeného Stripe účtu – zobrazí se v dashboardu.
// Bez napojeného účtu od něj zákazníci nemohou platit zálohy.
// Server komponenta: sama si načte profil přihlášeného uživatele.
//
// NEZOBRAZUJE se na stránkách, kde je ta samá výzva hlavním obsahem:
//   /dashboard/vyplaty    — napojení účtu je tam celý obsah stránky
//   /dashboard/predplatne — „Krok 2 · Napojte účet pro platby"
// Jinak by nad sebou stály dvě stejné výzvy a člověk neví, která platí.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Landmark, ArrowRight } from 'lucide-react'
import HideOnPath from '@/components/ui/HideOnPath'
import { adminDb, getProviderAccount } from '@/lib/booking/payments'

export default async function ConnectBanner() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_provider')
    .eq('id', user.id)
    .single() as { data: { is_provider: boolean | null } | null }

  // Jen poskytovatel, jehož Standard účet ještě nemůže přijímat platby (stripe_accounts,
  // čte se přes service role po kontrole, že jde o jeho vlastní účet).
  if (profile?.is_provider !== true) return null
  const account = await getProviderAccount(adminDb(), user.id)
  if (account.blocks.length === 0) return null
  // Stripe je v pořádku, chybí jen pokyn k vracení peněz / ověřené IČO → jiný text (vrstva 4)
  const stripeOk = account.blocks.every((b) => b === 'missing_refund_instruction' || b === 'ico_unverified')

  return (
    <HideOnPath paths={['/dashboard/vyplaty', '/dashboard/predplatne']}>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Landmark className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-black text-amber-900">{stripeOk ? 'Dokončete nastavení plateb' : 'Napojte si účet pro platby'}</p>
              <p className="mt-1 text-sm text-amber-800">
                {stripeOk
                  ? 'Stripe účet máte napojený. Ještě je potřeba odsouhlasit pokyn k automatickému vracení peněz (případně ověřit IČO) – do té doby si u vás zákazníci nemohou rezervovat termín s platbou.'
                  : 'Dokud nemáte napojený a ověřený Stripe účet, zákazníci si u vás nemohou rezervovat termín s platbou. Napojení zabere pár minut.'}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/vyplaty"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700"
          >
            {stripeOk ? 'Dokončit' : 'Napojit účet'} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </HideOnPath>
  )
}