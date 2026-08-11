// app/dashboard/qr/tisk/page.tsx
// Tiskové šablony — vizitka, samolepka, stojánek, plakát.
// Tiskne se přes prohlížeč (Ctrl+P), kde jde i „Uložit jako PDF".
// Rozměry jsou v milimetrech, takže z tiskárny vyleze správná velikost.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTiskUdaje, siteUrl } from '@/lib/actions/qr'
import PrintTemplates from '@/components/ui/PrintTemplates'

export const metadata = { title: 'Šablony k tisku' }
export const dynamic = 'force-dynamic'

export default async function TiskPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/qr')

  const token = searchParams.token
  if (!token) redirect('/dashboard/qr')

  const { jmeno, mesto } = await getTiskUdaje()
  const url = `${siteUrl()}/q/${token}`

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/qr"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Zpět na QR kód
      </Link>

      <PrintTemplates url={url} jmeno={jmeno} mesto={mesto} />
    </div>
  )
}