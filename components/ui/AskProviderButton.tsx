'use client'
// components/ui/AskProviderButton.tsx
// Kolečko s ikonou zprávy na kartě nabídky — otevře konverzaci s tímhle
// poskytovatelem o TÉHLE službě. Vlákno je jen jedno; při druhém kliknutí
// se otevře to původní, ať se domluva netříští.
//
// Nepřihlášeného pošleme na přihlášení a po něm zpátky sem.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Loader2 } from 'lucide-react'
import { zacniDotaz } from '@/lib/actions/inquiry'

export default function AskProviderButton({
  serviceId, isLoggedIn, variant = 'kolecko',
}: {
  serviceId: string
  isLoggedIn: boolean
  /** 'kolecko' = jen ikona; 'siroke' = tlačítko s popiskem */
  variant?: 'kolecko' | 'siroke'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const klik = async () => {
    if (!isLoggedIn) {
      router.push(`/prihlasit?next=/sluzby/${serviceId}`)
      return
    }
    setBusy(true); setErr(null)
    const res = await zacniDotaz(serviceId)
    setBusy(false)
    if (res.success) router.push(`/dashboard/objednavky/${res.orderId}`)
    else setErr(res.error)
  }

  if (variant === 'kolecko') {
    return (
      <div>
        <button
          onClick={klik}
          disabled={busy}
          title="Napsat poskytovateli"
          aria-label="Napsat poskytovateli"
          className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
        </button>
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={klik}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        Napsat poskytovateli
      </button>
      {err && <p className="mt-1.5 text-center text-xs text-red-600">{err}</p>}
    </div>
  )
}