'use client'
// components/ui/ServiceMap.tsx
// Statická mapa se špendlíkem na adrese provozovny. Dlaždice z Mapy.cz,
// vykreslení přes Leaflet načtený dynamicky (SSR-safe — Leaflet sahá na window).
//
// Klíč: NEXT_PUBLIC_MAPY_API_KEY (stejný, jaký pohání našeptávač adres).
// Když souřadnice nebo klíč chybí, komponenta se prostě nevykreslí (vrací null),
// takže detail karty nespadne.

import { useEffect, useRef, useState } from 'react'

interface Props {
  lat: number
  lng: number
  /** Popisek špendlíku (název karty nebo adresa). */
  label?: string
  /** Odkaz „Otevřít v Mapy.cz" pod mapou. Default true. */
  showLink?: boolean
  className?: string
}

const MAPY_KEY = process.env.NEXT_PUBLIC_MAPY_API_KEY

export default function ServiceMap({ lat, lng, label, showLink = true, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!MAPY_KEY || !lat || !lng || !containerRef.current) return

    const init = async () => {
      try {
        // Leaflet i jeho CSS načteme až v prohlížeči.
        const L = (await import('leaflet')).default
        // CSS Leafletu — přidáme jednou (bez importu ze stylu, ať to nezáleží na bundleru)
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link')
          link.id = 'leaflet-css'
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }

        if (cancelled || !containerRef.current) return
        // Kdyby se komponenta remountla, starou mapu zahodíme.
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

        const map = L.map(containerRef.current, {
          center: [lat, lng],
          zoom: 16,
          scrollWheelZoom: false,
          attributionControl: true,
        })
        mapRef.current = map

        // Dlaždice Mapy.cz (sada „basic"), s povinným logem a atribucí dle podmínek Mapy.cz.
        L.tileLayer(`https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${MAPY_KEY}`, {
          minZoom: 0,
          maxZoom: 19,
          attribution: '<a href="https://mapy.cz/" target="_blank" rel="noopener">Mapy.cz</a>',
        }).addTo(map)

        // Špendlík. Ikonu Leafletu bereme z CDN, ať neřešíme cesty k obrázkům v Next.
        const icon = L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        })
        const marker = L.marker([lat, lng], { icon }).addTo(map)
        if (label) marker.bindPopup(label)

        // Povinné logo Mapy.cz v rohu (podmínka použití API).
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
      } catch (e) {
        if (!cancelled) setFailed(true)
      }
    }

    init()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [lat, lng, label])

  // Bez klíče, souřadnic nebo při chybě mapu vůbec nevykreslíme.
  if (!MAPY_KEY || !lat || !lng || failed) return null

  const mapyUrl = `https://mapy.cz/zakladni?x=${lng}&y=${lat}&z=16&source=coor&id=${lng},${lat}`

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-2xl border border-slate-200"
        style={{ background: '#e2e8f0' }}
      />
      {showLink && (
        <a
          href={mapyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-emerald-600 hover:underline"
        >
          Otevřít v Mapy.cz →
        </a>
      )}
    </div>
  )
}