// components/ui/PageBlobs.tsx
// Barevné kruhy v barvách loga v pozadí stránky (20. 10. 2026; úvodní stránka a marketplace): střídavě vlevo
// a vpravo po celé výšce, jen barevný přechod (žádný blur filtr), za obsahem, neklikací. Pomalu se vznášejí
// (globals.css: propojo-drift-a/b, 40–70 s, každý jinak; při omezení animací stojí). Rodič musí mít `relative isolate`.

// drift = dráha (a/b), dur = délka jedné cesty v s, delay = záporné zpoždění, ať nezačínají naráz
const BLOBS: { side: 'l' | 'r'; top: string; color: string; drift: 'a' | 'b'; dur: number; delay: number }[] = [
  { side: 'l', top: '4%', color: 'rgba(59,130,246,.16)', drift: 'a', dur: 52, delay: -8 },
  { side: 'r', top: '14%', color: 'rgba(249,115,22,.14)', drift: 'b', dur: 64, delay: -20 },
  { side: 'l', top: '28%', color: 'rgba(16,185,129,.14)', drift: 'b', dur: 46, delay: -31 },
  { side: 'r', top: '42%', color: 'rgba(59,130,246,.16)', drift: 'a', dur: 70, delay: -12 },
  { side: 'l', top: '56%', color: 'rgba(249,115,22,.14)', drift: 'a', dur: 58, delay: -40 },
  { side: 'r', top: '70%', color: 'rgba(16,185,129,.14)', drift: 'b', dur: 42, delay: -5 },
  { side: 'l', top: '84%', color: 'rgba(59,130,246,.16)', drift: 'b', dur: 66, delay: -27 },
]

export default function PageBlobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {BLOBS.map((b, i) => (
        <span
          key={i}
          className={`propojo-blob absolute h-[300px] w-[300px] rounded-full md:h-[460px] md:w-[460px] ${
            b.side === 'l' ? '-left-[170px] md:-left-[230px]' : '-right-[170px] md:-right-[230px]'
          }`}
          style={{
            top: b.top,
            background: `radial-gradient(circle, ${b.color} 0%, transparent 70%)`,
            animationName: `propojo-drift-${b.drift}`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
