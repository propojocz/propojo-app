'use client'
// components/ui/ObecChooser.tsx
// Stejnojmenné obce (20. 10. 2026, Matej: „několik Bystřic a Stříteží“): když zákazník napíše obec,
// která je v ČR víckrát, a nevybere ji z našeptávače, marketplace nabídne upřesnění okresu (?okres=…).

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { MapPin } from 'lucide-react'

export default function ObecChooser({ obec, okresy, current }: { obec: string; okresy: string[]; current: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const pick = (okres: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('okres', okres)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
      <span>{obec} je v ČR víckrát{current ? '' : ' – myslíte'}:</span>
      {okresy.map((o) => (
        <button key={o} type="button" onClick={() => pick(o)}
          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
            current === o ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-800 hover:border-amber-500'
          }`}>
          okres {o}
        </button>
      ))}
    </div>
  )
}
