// app/dashboard/qr/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getQrCile } from '@/lib/actions/qr'
import QrManager from '@/components/ui/QrManager'

export const metadata = { title: 'QR kód' }
export const dynamic = 'force-dynamic'

export default async function QrPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/qr')

  const cile = await getQrCile()

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Váš QR kód
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Vytiskněte, nalepte, rozdejte. Kdo ho načte, uvidí váš ceník a volné termíny — a objedná se sám.
        </p>
      </div>

      <QrManager cile={cile} />
    </div>
  )
}