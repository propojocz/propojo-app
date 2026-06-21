// components/ui/SuspendedTopBar.tsx
// Tenký varovný pruh nahoře pro pozastaveného uživatele. Svítí na každé stránce,
// dokud trvá pozastavení. Klik vede na dashboard k detailu (banner s důvodem).
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'

export default async function SuspendedTopBar() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_suspended')
    .eq('id', user.id)
    .single() as { data: { is_suspended: boolean | null } | null }

  if (profile?.is_suspended !== true) return null

  return (
    <Link
      href="/dashboard"
      className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-red-700"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>Váš účet byl pozastaven – zobrazit detail</span>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </Link>
  )
}