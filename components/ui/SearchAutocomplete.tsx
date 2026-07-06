'use client'
// components/ui/SearchAutocomplete.tsx
// Vyhledávací pole s našeptáváním. Dva režimy:
//  mode="obory" → nabízí kategorie + podkategorie (klik nastaví ?category / ?subcats)
//  mode="obce"  → nabízí obce z číselníku (klik nastaví ?city)
// Volný text (Enter / bez výběru) se propíše jako fallback (?q nebo ?city).

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, MapPin, Tag, Layers, Loader2, X } from 'lucide-react'

type OborItem = { type: 'category' | 'subcategory'; value: string; label: string }
type ObecItem = { obec: string; okres: string; psc: string; latitude: number; longitude: number }

export default function SearchAutocomplete({
  mode,
  defaultValue = '',
  placeholder,
  onPickObor,
  onPickObec,
  onFreeText,
  className = '',
}: {
  mode: 'obory' | 'obce'
  defaultValue?: string
  placeholder: string
  onPickObor?: (item: OborItem) => void
  onPickObec?: (item: ObecItem) => void
  onFreeText: (text: string) => void
  className?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [obory, setObory] = useState<OborItem[]>([])
  const [obce, setObce] = useState<ObecItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const freeTextRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Zavření při kliknutí mimo
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setObory([]); setObce([]); setOpen(false); return }
    setLoading(true)
    try {
      if (mode === 'obory') {
        const res = await fetch(`/api/obory?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setObory(data.obory ?? [])
        setOpen((data.obory ?? []).length > 0)
      } else {
        const res = await fetch(`/api/obce?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setObce(data.obce ?? [])
        setOpen((data.obce ?? []).length > 0)
      }
    } catch {
      setObory([]); setObce([])
    }
    setLoading(false)
    setActive(-1)
  }, [mode])

  const handleChange = (v: string) => {
    setValue(v)
    // Našeptávání (debounce 200 ms)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 200)
    // Volný text jako fallback (debounce 500 ms) – kdyby nic nevybral
    if (freeTextRef.current) clearTimeout(freeTextRef.current)
    freeTextRef.current = setTimeout(() => onFreeText(v), 500)
  }

  const pickObor = (item: OborItem) => {
    setValue(item.label)
    setOpen(false)
    onPickObor?.(item)
  }
  const pickObec = (item: ObecItem) => {
    setValue(item.obec)
    setOpen(false)
    onPickObec?.(item)
  }

  const clear = () => {
    setValue('')
    setObory([]); setObce([])
    setOpen(false)
    onFreeText('')
  }

  const items = mode === 'obory' ? obory : obce
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      if (mode === 'obory') pickObor(obory[active])
      else pickObec(obce[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {mode === 'obory'
        ? <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        : <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (items.length > 0) setOpen(true) }}
        onKeyDown={onKeyDown}
        className="form-input pl-9 pr-9"
        autoComplete="off"
      />
      {loading
        ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        : value
          ? <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          : null}

      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {mode === 'obory'
            ? obory.map((item, i) => (
                <button
                  key={`${item.type}-${item.value}`}
                  onClick={() => pickObor(item)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${active === i ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  {item.type === 'category'
                    ? <Tag className="h-4 w-4 shrink-0 text-emerald-600" />
                    : <Layers className="h-4 w-4 shrink-0 text-slate-400" />}
                  <span className="font-medium text-slate-700">{item.label}</span>
                  <span className="ml-auto text-xs text-slate-400">{item.type === 'category' ? 'obor' : 'úkon'}</span>
                </button>
              ))
            : obce.map((item, i) => (
                <button
                  key={`${item.obec}-${item.psc}`}
                  onClick={() => pickObec(item)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${active === i ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-medium text-slate-700">{item.obec}</span>
                  <span className="ml-auto text-xs text-slate-400">{item.okres}</span>
                </button>
              ))}
        </div>
      )}
    </div>
  )
}