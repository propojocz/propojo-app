// app/poptavky/[requestId]/page.tsx
// Detail jedné poptávky. Obsah je sdílená karta RequestDetailCard – stejnou ukazuje i okno
// „Detail“ na nástěnce poptávek (data z loadRequestDetail).
// Kontakt zákazníka se tu nikde nezobrazuje.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import RequestDetailCard from '@/components/ui/RequestDetailCard'
import { loadRequestDetail } from '@/lib/request-detail'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Detail poptávky | Propojo' }

export default async function PoptavkaDetailPage({
  params,
}: {
  params: { requestId: string }
}) {
  const d = await loadRequestDetail(params.requestId)
  if (!d) notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/poptavky" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Zpět na poptávky
      </Link>
      <RequestDetailCard d={d} />
    </div>
  )
}
