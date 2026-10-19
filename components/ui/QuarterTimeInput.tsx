'use client'
// components/ui/QuarterTimeInput.tsx
// Výběr času po 15 minutách (19. 10. 2026, Matej): hodina + minuta 00 / 15 / 30 / 45. Nahrazuje <input type="time">
// tam, kde poskytovatel zadává čas, který si pak rezervuje zákazník (bleskový termín, Termíny, návrhy termínu,
// „nemohu dodržet“). Pole času krok na iPhonu ignoruje – tady jinou minutu vybrat nejde.
// Hodnota je 'HH:MM' jako u <input type="time">; prázdná = nic nevybráno.

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

export default function QuarterTimeInput({ value, onChange, className = '', ariaLabel }: {
  value: string
  onChange: (value: string) => void
  /** Třídy obalu (okraj, zaoblení…) – selecty uvnitř jsou bez okraje */
  className?: string
  ariaLabel?: string
}) {
  const [h, m] = value ? value.slice(0, 5).split(':') : ['', '']
  // Starší hodnota mimo čtvrthodinu se jen zobrazí (nic se tiše nemění)
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES
  const set = (nh: string, nm: string) => onChange(nh ? `${nh}:${nm || '00'}` : '')

  return (
    <span className={`inline-flex items-center gap-0.5 bg-white tabular-nums ${className}`} role="group" aria-label={ariaLabel}>
      <select value={h} onChange={(e) => set(e.target.value, m)} aria-label="Hodina"
        className="cursor-pointer appearance-none bg-transparent px-1 text-center outline-none">
        {!h && <option value="">--</option>}
        {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-slate-400">:</span>
      <select value={m} onChange={(e) => set(h || '00', e.target.value)} aria-label="Minuta"
        className="cursor-pointer appearance-none bg-transparent px-1 text-center outline-none">
        {!m && <option value="">--</option>}
        {minutes.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  )
}
