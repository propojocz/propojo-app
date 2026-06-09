// app/not-found.tsx

import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 text-8xl">🔨</div>
      <h1 className="mb-2 text-3xl font-black text-slate-900">
        Stránka nenalezena
      </h1>
      <p className="mb-8 max-w-sm text-slate-500">
        Tato stránka neexistuje nebo byla přesunuta. Zkuste prohledat tržiště.
      </p>
      <div className="flex gap-3">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Search className="h-4 w-4" />
          Přejít na tržiště
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Domů
        </Link>
      </div>
    </main>
  )
}
