'use client'
// components/ui/PropojoMap.tsx
// Mapy M1 (20. 10. 2026, docs/plan-mapy.md): společná mapa Propoja. Podklad Mapy.com (raster „basic“, bez
// úprav stylu, povinné logo a atribuce), vykreslení přes Leaflet načtený až v prohlížeči (SSR-safe).
// Víc špendlíků → mapa se sama přiblíží tak, aby byly vidět všechny; po kliknutí okénko s názvem a odkazem.
// Vlastní špendlíky v barvách rolí: oranžová = poskytovatel / provozovna, zelená = zákazník / místo zakázky,
// modrá = Propojo (obecné místo). Na dotykovém zařízení se mapa nepřetahuje jedním prstem (stránka se dá
// rolovat), přiblížení a posun dvěma prsty. Bez klíče / platných souřadnic / při chybě se nevykreslí (null).

import { useEffect, useRef, useState } from 'react'

export type MapPinKind = 'provider' | 'customer' | 'place'

export type MapPin = {
  lat: number
  lng: number
  kind?: MapPinKind
  /** Text v okénku po kliknutí (název karty, adresa…) */
  label?: string
  /** Odkaz v okénku („Zobrazit →“) */
  href?: string
}

const MAPY_KEY = process.env.NEXT_PUBLIC_MAPY_API_KEY

const PIN_COLOR: Record<MapPinKind, string> = {
  provider: '#f97316', // oranžová – poskytovatel
  customer: '#10b981', // zelená – zákazník
  place: '#3b82f6', // modrá – Propojo / obecné místo
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/** Špendlík Propoja jako SVG (kapka s bílým kroužkem), bez obrázků z CDN */
function pinSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">
    <path d="M15 39c-.6 0-1.1-.3-1.4-.8C8.7 30.6 2 22.6 2 15A13 13 0 0 1 28 15c0 7.6-6.7 15.6-11.6 23.2-.3.5-.8.8-1.4.8z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="5.5" fill="#fff"/>
  </svg>`
}

const validPin = (p: MapPin) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)

export default function PropojoMap({ pins, zoom = 16, className, heightClass = 'h-56', showLink = true }: {
  pins: MapPin[]
  /** Přiblížení u jednoho špendlíku (u víc se mapa přiblíží sama) */
  zoom?: number
  className?: string
  /** Výška mapy (Tailwind třída) */
  heightClass?: string
  /** Odkaz „Otevřít v Mapy.cz →“ pod mapou (jen u jednoho špendlíku) */
  showLink?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const [failed, setFailed] = useState(false)
  const valid = pins.filter(validPin)
  // Klíč pro efekt – mapa se překreslí jen při změně špendlíků, ne při každém renderu
  const pinsKey = valid.map((p) => `${p.lat},${p.lng},${p.kind ?? ''},${p.label ?? ''},${p.href ?? ''}`).join('|')

  useEffect(() => {
    let cancelled = false
    if (!MAPY_KEY || valid.length === 0 || !containerRef.current) return

    const init = async () => {
      try {
        const L = (await import('leaflet')).default
        // CSS Leafletu – přidáme jednou (bez importu ze stylu, ať to nezáleží na bundleru)
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link')
          link.id = 'leaflet-css'
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }
        if (cancelled || !containerRef.current) return
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

        const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
        const map = L.map(containerRef.current, {
          center: [valid[0].lat, valid[0].lng],
          zoom,
          scrollWheelZoom: false,
          // Na dotyku jedním prstem roluje stránka, mapa se posouvá a přibližuje dvěma prsty
          dragging: !touch,
          touchZoom: true,
          attributionControl: true,
        })
        mapRef.current = map

        // Dlaždice Mapy.com (sada „basic“) s atribucí podle podmínek Mapy.com
        L.tileLayer(`https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${MAPY_KEY}`, {
          minZoom: 0,
          maxZoom: 19,
          attribution: '<a href="https://mapy.cz/" target="_blank" rel="noopener">Mapy.cz</a>',
        }).addTo(map)

        for (const p of valid) {
          const icon = L.divIcon({
            html: pinSvg(PIN_COLOR[p.kind ?? 'provider']),
            className: 'propojo-pin',
            iconSize: [30, 40],
            iconAnchor: [15, 39],
            popupAnchor: [0, -34],
          })
          const marker = L.marker([p.lat, p.lng], { icon, title: p.label ?? '' }).addTo(map)
          if (p.label || p.href) {
            const text = p.label ? `<strong style="font-size:13px">${escapeHtml(p.label)}</strong>` : ''
            const link = p.href ? `<br/><a href="${escapeHtml(p.href)}" style="font-weight:600;color:#047857">Zobrazit →</a>` : ''
            marker.bindPopup(text + link)
          }
        }

        // Víc špendlíků: přiblížit tak, aby byly vidět všechny
        if (valid.length > 1) {
          map.fitBounds(L.latLngBounds(valid.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: zoom })
        }

        // Povinné logo Mapy.com v rohu (podmínka použití API)
        const LogoControl = L.Control.extend({
          options: { position: 'bottomleft' },
          onAdd: function () {
            const c = L.DomUtil.create('div')
            c.style.pointerEvents = 'none'
            c.innerHTML = '<img src="https://api.mapy.cz/img/api/logo.svg" alt="Mapy.cz" style="height:18px" />'
            return c
          },
        })
        map.addControl(new LogoControl())
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    init()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // pinsKey zastupuje pole špendlíků
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, zoom])

  if (!MAPY_KEY || valid.length === 0 || failed) return null

  const single = valid.length === 1 ? valid[0] : null
  const mapyUrl = single ? `https://mapy.cz/zakladni?x=${single.lng}&y=${single.lat}&z=${zoom}&source=coor&id=${single.lng},${single.lat}` : null

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={`${heightClass} w-full overflow-hidden rounded-2xl border border-slate-200`}
        style={{ background: '#e2e8f0' }}
      />
      {showLink && mapyUrl && (
        <a href={mapyUrl} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-emerald-600 hover:underline">
          Otevřít v Mapy.cz →
        </a>
      )}
    </div>
  )
}
