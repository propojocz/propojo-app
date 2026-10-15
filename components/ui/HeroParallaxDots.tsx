'use client'
// components/ui/HeroParallaxDots.tsx
// Barevné tečky v pozadí hero sekce úvodní stránky (zelená / modrá / oranžová) s jemným parallaxem.
//
// Dvě vnořené vrstvy, aby si nepřepisovaly transform:
//   .fpar  – parallax podle kurzoru (nastavuje JS přes requestAnimationFrame, bez React renderu),
//   .fdot  – samovolné plování (CSS keyframes v app/page.tsx), rozmazání se nemění.
// Parallax jen u myši (hover + jemný ukazatel), ne na dotykových zařízeních; při prefers-reduced-motion
// se vypne parallax i plování (CSS). Při skryté záložce se smyčka zastaví, při odstranění se vše uklidí.

import { useEffect, useRef } from 'react'

// Každá tečka jinou intenzitou a směrem (max. posun v px při kurzoru na okraji plochy)
const DOTS: Array<{ cls: string; pos: string; k: [number, number] }> = [
  { cls: 'g d1', pos: 'p1', k: [-28, -22] },
  { cls: 'b d2', pos: 'p2', k: [34, 18] },
  { cls: 'o d3', pos: 'p3', k: [-40, 30] },
  { cls: 'g d4', pos: 'p4', k: [22, -34] },
  { cls: 'b d5', pos: 'p5', k: [30, -26] },
  { cls: 'o d6', pos: 'p6', k: [-24, 36] },
]

// Jak rychle vrstva dohání kurzor (0–1 za snímek) – menší = větší zpoždění
const EASE = 0.07

const clamp = (v: number) => Math.max(-1, Math.min(1, v))

export default function HeroParallaxDots() {
  const boxRef = useRef<HTMLDivElement>(null)
  const layerRefs = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const box = boxRef.current
    const area = box?.parentElement
    if (!box || !area || typeof window.matchMedia !== 'function') return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mouse = window.matchMedia('(hover: hover) and (pointer: fine)')

    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    let raf = 0
    let active = false

    const apply = () => {
      layerRefs.current.forEach((el, i) => {
        if (!el) return
        const [kx, ky] = DOTS[i].k
        el.style.transform = `translate3d(${(cur.x * kx).toFixed(2)}px, ${(cur.y * ky).toFixed(2)}px, 0)`
      })
    }

    const tick = () => {
      raf = 0
      cur.x += (target.x - cur.x) * EASE
      cur.y += (target.y - cur.y) * EASE
      const done = Math.abs(target.x - cur.x) < 0.001 && Math.abs(target.y - cur.y) < 0.001
      if (done) {
        cur.x = target.x
        cur.y = target.y
      }
      apply()
      // Smyčka běží jen dokud se vrstvy hýbou; v klidu nic nepočítá
      if (!done && !document.hidden) raf = requestAnimationFrame(tick)
    }

    const start = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const r = area.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      target.x = clamp((e.clientX - r.left - r.width / 2) / (r.width / 2))
      target.y = clamp((e.clientY - r.top - r.height / 2) / (r.height / 2))
      start()
    }

    // Po opuštění plochy se vrstvy pozvolna vrátí do výchozí polohy
    const onLeave = () => {
      target.x = 0
      target.y = 0
      start()
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      } else {
        start()
      }
    }

    const enable = () => {
      area.addEventListener('pointermove', onMove, { passive: true })
      area.addEventListener('pointerleave', onLeave)
      document.addEventListener('visibilitychange', onVisibility)
      active = true
    }

    const disable = () => {
      area.removeEventListener('pointermove', onMove)
      area.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      target.x = target.y = cur.x = cur.y = 0
      layerRefs.current.forEach((el) => { if (el) el.style.transform = '' })
      active = false
    }

    // Zapnout jen u myši a bez omezení pohybu; reaguje i na změnu nastavení za běhu
    const sync = () => {
      const want = mouse.matches && !reduce.matches
      if (want && !active) enable()
      else if (!want && active) disable()
    }
    sync()
    reduce.addEventListener?.('change', sync)
    mouse.addEventListener?.('change', sync)

    return () => {
      disable()
      reduce.removeEventListener?.('change', sync)
      mouse.removeEventListener?.('change', sync)
    }
  }, [])

  return (
    <div ref={boxRef} className="hero-dots" aria-hidden="true">
      {DOTS.map((d, i) => (
        <span key={d.pos} ref={(el) => { layerRefs.current[i] = el }} className={`fpar ${d.pos}`}>
          <span className={`fdot ${d.cls}`} />
        </span>
      ))}
    </div>
  )
}
