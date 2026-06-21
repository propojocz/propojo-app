'use client'
// app/admin/uzivatele/SearchBox.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

export default function SearchBox({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial)
  const router = useRouter()

  const submit = () => {
    router.push(`/admin/uzivatele${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <Search className="h-4 w-4 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="Hledat podle jména nebo firmy…"
        className="flex-1 text-sm outline-none"
      />
      <button onClick={submit} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">
        Hledat
      </button>
    </div>
  )
}