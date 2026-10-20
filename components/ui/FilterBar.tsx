'use client'
// components/ui/FilterBar.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Loader2, LocateFixed, MapPin, SlidersHorizontal, Star, Zap } from 'lucide-react'
import SearchAutocomplete from './SearchAutocomplete'

interface FilterBarProps {
  currentCity?: string
  currentSort?: string
  currentQ?: string
}

// „Nejdřív volno" je první a výchozí — zákazník se rozhoduje podle toho,
// kdo ho vezme nejdřív, ne podle toho, kdo se přidal naposled.
const SORT_OPTIONS = [
  { value: 'volno', label: 'Nejdřív volno', icon: 'zap' },
  { value: 'nejnovejsi', label: 'Nejnovější' },
  { value: 'nejlevnejsi', label: 'Nejlevnější' },
  { value: 'nejdrazsi', label: 'Nejdražší' },
  { value: 'hodnoceni', label: 'Hodnocení', icon: 'star' },
  // M2: jen když je zadaná obec (vzdálenost se počítá od ní)
  { value: 'nejblize', label: 'Nejblíž', icon: 'pin' },
]

const MAPY_KEY = process.env.NEXT_PUBLIC_MAPY_API_KEY

export default function FilterBar({ currentCity, currentSort = 'volno', currentQ }: FilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      startTransition(() => { router.push(`${pathname}?${params.toString()}`) })
    },
    [router, pathname, searchParams]
  )

  // „Použít moji polohu“ (M2): prohlížeč zjistí polohu, Mapy.com z ní v prohlížeči určí obec a na server
  // Propoja jde jen název obce – přesná poloha se k nám nedostane a nikam se neukládá.
  const locateMe = () => {
    setLocError('')
    if (!('geolocation' in navigator) || !MAPY_KEY) { setLocError('Polohu se nepodařilo zjistit – napište obec.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords
        const res = await fetch(`https://api.mapy.cz/v1/rgeocode?lon=${longitude}&lat=${latitude}&lang=cs&apikey=${encodeURIComponent(MAPY_KEY)}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        const item = (data.items ?? [])[0]
        const obec: string | null = item?.type === 'regional.municipality'
          ? (item.name ?? null)
          : ((item?.regionalStructure ?? []).find((r: any) => r?.type === 'regional.municipality')?.name ?? null)
        if (!obec) throw new Error('bez obce')
        // Okres kvůli stejnojmenným obcím, když ho Mapy.com vrátí („okres Vsetín“)
        const okresRaw: string | null = ((item?.regionalStructure ?? []).find((r: any) => typeof r?.name === 'string' && /^okres /i.test(r.name))?.name) ?? null
        const okres = okresRaw ? okresRaw.replace(/^okres\s+/i, '') : null
        // Ve městě i část obce (Žižkov, Poruba) – jen když ji známe, jinak obec
        const part: string | null = (item?.regionalStructure ?? []).find((r: any) => r?.type === 'regional.municipality_part' && r?.name && r.name !== obec)?.name ?? null
        let city = obec
        if (part) {
          const known = await fetch(`/api/obce?q=${encodeURIComponent(part)}&casti=1`).then((r) => r.json()).catch(() => null)
          if ((known?.obce ?? []).some((o: any) => o?.obec === part && o?.parent === obec)) city = part
        }
        updateParams({ city, okres })
      } catch {
        setLocError('Obec se nepodařilo určit – napište ji prosím.')
      } finally {
        setLocating(false)
      }
    }, () => {
      setLocating(false)
      setLocError('Přístup k poloze není povolený – napište obec.')
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 })
  }

  return (
    // Karta s hledáním podle mockupu (20. 10. 2026): hledání, obec, Filtry (jen mobil – na počítači jsou
    // filtry vlevo u nabídek), řazení jako pilulky (na mobilu posuvné)
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className={`rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm transition ${isPending ? 'opacity-70' : ''}`}>
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          {/* Hledání služby/oboru s našeptáváním */}
          <SearchAutocomplete
            mode="obory"
            defaultValue={currentQ}
            placeholder="Hledat službu nebo obor…"
            className="flex-1"
            onPickObor={(item) => {
              // Kategorie → ?category=slug (zruší q i subcats), podkategorie → ?subcats=id
              if (item.type === 'category') {
                updateParams({ category: item.value, subcats: null, q: null })
              } else {
                updateParams({ subcats: item.value, q: null })
              }
            }}
            onFreeText={(text) => updateParams({ q: text || null })}
          />

          {/* Město s našeptáváním obcí + Filtry (mobil) */}
          <div className="flex gap-2.5 lg:w-72">
            <SearchAutocomplete
              syncValue
              parts
              mode="obce"
              defaultValue={currentCity}
              placeholder="Město…"
              className="min-w-0 flex-1"
              // Okres kvůli stejnojmenným obcím (Bystřice, Střítež…)
              onPickObec={(item) => updateParams({ city: item.obec, okres: item.okres })}
              onFreeText={(text) => updateParams({ city: text || null, okres: null })}
            />
            <button type="button" onClick={locateMe} disabled={locating}
              title="Použít moji polohu – najde vaši obec, polohu nikam neukládáme"
              aria-label="Použít moji polohu"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => window.dispatchEvent(new Event('propojo:open-filters'))}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-emerald-300 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filtry
            </button>
          </div>

          {/* Řazení */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 lg:mx-0 lg:px-0" style={{ scrollbarWidth: 'none' }}>
            {SORT_OPTIONS.filter((opt) => opt.value !== 'nejblize' || !!currentCity).map((opt) => {
              const on = currentSort === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => updateParams({ sort: opt.value })}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all ${
                    on ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  {opt.icon === 'zap' && <Zap className={`h-4 w-4 ${on ? 'fill-white' : 'fill-orange-400 text-orange-500'}`} />}
                  {opt.icon === 'star' && <Star className={`h-4 w-4 ${on ? 'fill-white' : 'fill-amber-400 text-amber-400'}`} />}
                  {opt.icon === 'pin' && <MapPin className={`h-4 w-4 ${on ? 'text-white' : 'text-sky-500'}`} />}
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
        {locError && <p className="mt-2 px-1 text-xs text-amber-700">{locError}</p>}
      </div>
    </div>
  )
}