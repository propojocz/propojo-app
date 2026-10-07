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
// ─── Místo, se kterým poskytovatel počítal (pojistka automatického potvrzení, 7. 10. 2026) ───
// Termín navržený / vypsaný poskytovatelem se potvrzuje automaticky jen tehdy, když výsledná
// adresa zákazníka leží tam, kde poskytovatel počítal: do ~15 km od obce v objednávce, nebo
// v dosahu karty. Jinak rezervaci potvrdí ručně (zákazník mohl ve shrnutí zadat jiné místo).

export const KNOWN_PLACE_TOLERANCE_KM = 15

export type KnownPlace = {
  /** Služba u zákazníka (jinak se adresa neřeší) */
  atCustomer: boolean
  /** Obec z objednávky – tu poskytovatel viděl, když termín nabízel */
  obec: { lat: number; lng: number } | null
  /** Výchozí místo karty a její obvyklý dosah */
  base: { lat: number; lng: number } | null
  radiusKm: number | null
}

export function isPlaceKnown(k: KnownPlace, lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (!k.atCustomer || lat == null || lng == null) return true
  if (k.obec && haversineKm(k.obec.lat, k.obec.lng, lat, lng) <= KNOWN_PLACE_TOLERANCE_KM) return true
  if (k.base && k.radiusKm && haversineKm(k.base.lat, k.base.lng, lat, lng) <= k.radiusKm) return true
  // Není s čím porovnat → automatické potvrzení neblokovat.
  return !k.obec && !(k.base && k.radiusKm)
}

/** Vzdálenost adresy od obce z objednávky (jinak od místa karty), zaokrouhleně v km */
export function distanceFromKnownKm(k: KnownPlace, lat: number | null | undefined, lng: number | null | undefined): number | null {
  if (lat == null || lng == null) return null
  const ref = k.obec ?? k.base
  return ref ? Math.round(haversineKm(ref.lat, ref.lng, lat, lng)) : null
}
