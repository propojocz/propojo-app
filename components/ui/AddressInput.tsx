'use client'
// components/ui/AddressInput.tsx
// Našeptávač PŘESNÉ ADRESY přes Mapy.cz API (adresní místa z RÚIAN).
//
// Proč Mapy.cz: české adresy zná nejlíp (oficiální adresní registr),
// zdarma do 250 000 požadavků/měsíc, a Češi mapám od Seznamu věří.
//
// Potřebuje API klíč: NEXT_PUBLIC_MAPY_API_KEY v .env.local i ve Vercelu.
// Klíč získáš na developer.mapy.cz (zdarma, viz návod v chatu).
// Bez klíče komponenta funguje jako obyčejné textové pole (adresa se
// uloží bez souřadnic — špendlík na mapě pak nebude, ale nic se nerozbije).

import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

type Suggestion = {
  name: string          // „Dolní náměstí 1356"
  location: string      // „Vsetín, okres Vsetín"
  lat: number
  lng: number
}

export default function AddressInput({
  defaultValue,
  onPick,
  onFreeText,
  placeholder = 'Začněte psát adresu a vyberte ze seznamu…',
}: {
  defaultValue?: string | null
  /** Uživatel vybral adresu ze seznamu → máme text i souřadnice */
  onPick: (a: { address: string; lat: number; lng: number }) => void
  /** Uživatel psal volný text (nevybral) → adresa bez souřadnic */
  onFreeText: (text: string) => void
  placeholder?: string
}) {
  const apiKey = process.env.NEXT_PUBLIC_MAPY_API_KEY
  const [value, setValue] = useState(defaultValue ?? '')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Zavřít dropdown při kliknutí mimo
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const search = (q: string) => {
    setValue(q)
    onFreeText(q) // průběžně ukládáme text; souřadnice až po výběru
    if (timer.current) clearTimeout(timer.current)
    if (!apiKey || q.trim().length < 3) { setItems([]); setOpen(false); return }

    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url =
          `https://api.mapy.cz/v1/suggest?lang=cs&limit=6&type=regional.address` +
          `&apikey=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(q)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Mapy.cz ${res.status}`)
        const data = await res.json()
        const mapped: Suggestion[] = (data.items ?? [])
          .filter((i: any) => i?.position?.lat && i?.position?.lon)
          .map((i: any) => ({
            name: i.name ?? '',
            location: i.location ?? '',
            lat: i.position.lat,
            lng: i.position.lon,
          }))
        setItems(mapped)
        setOpen(mapped.length > 0)
      } catch (err) {
        console.error('[AddressInput] našeptávač:', err)
        setItems([]); setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  const pick = (s: Suggestion) => {
    const full = s.location ? `${s.name}, ${s.location}` : s.name
    setValue(full)
    setOpen(false)
    onPick({ address: full, lat: s.lat, lng: s.lng })
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => search(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="form-input pl-9 pr-9"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-300" />}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {items.map((s, i) => (
            <button
              key={`${s.lat}-${s.lng}-${i}`}
              type="button"
              onClick={() => pick(s)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-emerald-50"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{s.name}</span>
                {s.location && <span className="block truncate text-xs text-slate-500">{s.location}</span>}
              </span>
            </button>
          ))}
          <div className="border-t border-slate-100 px-3 py-1.5 text-right text-[10px] text-slate-400">
            Našeptávání adres: Mapy.cz
          </div>
        </div>
      )}

      {!apiKey && (
        <p className="mt-1 text-xs text-amber-600">
          Našeptávač adres není aktivní (chybí NEXT_PUBLIC_MAPY_API_KEY) — adresu můžete napsat ručně.
        </p>
      )}
    </div>
  )
}