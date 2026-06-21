// components/ui/SuspendedBanner.tsx
// Banner pro pozastaveného uživatele – zobrazí se v dashboardu.
// Server komponenta: sama si načte profil přihlášeného uživatele.
import { createClient } from '@/lib/supabase/server'
import { AlertTriangle } from 'lucide-react'

export default async function SuspendedBanner() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_suspended, suspend_reason')
    .eq('id', user.id)
    .single() as { data: { is_suspended: boolean | null; suspend_reason: string | null } | null }

  if (profile?.is_suspended !== true) return null

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="font-bold text-red-800">Váš profil byl pozastaven</p>
          <p className="mt-1 text-sm text-red-700">
            Váš profil i služby jsou momentálně skryté z webu a nelze u vás objednat.
            {profile.suspend_reason ? <> Důvod: <strong>{profile.suspend_reason}</strong></> : null}
          </p>
          <p className="mt-2 text-sm text-red-700">
            Pokud si myslíte, že jde o omyl, kontaktujte nás na{' '}
            <a href="mailto:podpora@propojo.cz" className="font-bold underline">podpora@propojo.cz</a>.
          </p>
        </div>
      </div>
    </div>
  )
}