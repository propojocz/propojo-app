// app/not-found.tsx

import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-3 text-3xl font-black text-slate-900">
        Tuhle stránku jsme nenašli
      </h1>
      <p className="mb-8 max-w-sm text-slate-500">
        Nejspíš byla přesunutá nebo už neexistuje. Zkuste najít, co potřebujete, v Marketplace.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/marketplace" className="btn-primary justify-center">
          <Search className="h-4 w-4" />
          Prohlédnout nabídky
        </Link>
        <Link href="/" className="btn-secondary justify-center">
          <ArrowLeft className="h-4 w-4" />
          Domů
        </Link>
      </div>
    </main>
  )
}