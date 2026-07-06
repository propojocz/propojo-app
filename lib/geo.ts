// lib/geo.ts
// Vzdálenost mezi dvěma body na mapě (vzdušnou čarou) — Haversine vzorec.
// Používá se pro filtr "Jen v mém dosahu" na marketplace. Žádné externí API,
// žádné poplatky — čistý výpočet nad souřadnicemi z tabulky `obce`.

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // poloměr Země v km
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}