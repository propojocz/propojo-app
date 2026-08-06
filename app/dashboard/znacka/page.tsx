// app/dashboard/znacka/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyBrands, getBrand } from '@/lib/actions/brands'
import BrandManager from '@/components/ui/BrandManager'

export const dynamic = 'force-dynamic'

export default async function ZnackaPage({
  searchParams,
}: {
  searchParams: { id?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/prihlasit?next=/dashboard/znacka')

  const myBrands = await getMyBrands()

  // Aktivní značka: z ?id=, jinak první moje.
  const activeId = searchParams.id ?? myBrands[0]?.id ?? null
  const activeBrand = activeId ? await getBrand(activeId) : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Značka
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Spojte pod jedním jménem víc lidí. Každý má dál svou kartu, ceník i kalendář.
        </p>
      </div>

      <BrandManager
        myBrands={myBrands}
        activeBrand={activeBrand}
        currentUserId={user.id}
      />
    </div>
  )
}