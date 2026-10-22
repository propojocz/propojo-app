// lib/booking/travel.ts
// Vrstva 6 (22. 10. 2026): doprava u výjezdu (Model B, VOP 11 / podklad A9).
// Poskytovatel u položky zvolí: doprava v Ceně výjezdu, nebo „zdarma do X km, pak Y Kč za každý další km“.
// Km = silniční vzdálenost JEDNOU CESTOU od adresy karty (jinak z profilu, jinak střed obce karty)
// k přesné adrese zákazníka – plánovač tras Mapy.com na serveru (MAPY_SERVER_API_KEY).
// Když plánovač nefunguje: odhad = vzdušná vzdálenost × 1,3 (Matej 22. 10. 2026), zákazník ho vidí jako odhad.
// Doprava se připočte k Ceně výjezdu před platbou; po zablokování platby se nemění (snapshot v orders).
// U ceny upravené poskytovatelem (agreed_charge_halere) se nic nepřipočítává – je to dohodnutá celková částka.

import { haversineKm } from '@/lib/geo'
import type { Db } from './payments'

/** Odhad silniční vzdálenosti ze vzdušné, když plánovač tras nejde */
export const ROAD_FACTOR_ESTIMATE = 1.3

export type TravelTerms = { freeKm: number; pricePerKmKc: number }

export type TravelQuote = {
  /** Vzdálenost jednou cestou (km, na 1 desetinné místo) */
  km: number
  /** Placené km (nad bezplatnou hranicí, zaokrouhlené na celé km) */
  billableKm: number
  feeHalere: number
  /** true = odhad ze vzdušné vzdálenosti (plánovač tras nefungoval) */
  estimated: boolean
  terms: TravelTerms
}

/** Doprava podle km? (null = doprava je v Ceně výjezdu) */
export function travelTermsOf(item: { price_per_km?: number | string | null; free_km?: number | string | null } | null | undefined): TravelTerms | null {
  const price = Number(item?.price_per_km ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  const free = Math.max(0, Math.floor(Number(item?.free_km ?? 0) || 0))
  return { freeKm: free, pricePerKmKc: price }
}

export function travelFee(terms: TravelTerms, km: number): { billableKm: number; feeHalere: number } {
  const billableKm = Math.max(0, Math.round(km - terms.freeKm))
  return { billableKm, feeHalere: Math.round(billableKm * terms.pricePerKmKc * 100) }
}

type LatLng = { lat: number; lng: number }

/** Silniční vzdálenost autem (km) přes Mapy.com; při chybě odhad ze vzdušné čáry */
export async function roadKm(from: LatLng, to: LatLng): Promise<{ km: number; estimated: boolean }> {
  const key = process.env.MAPY_SERVER_API_KEY
  if (key) {
    try {
      const url = `https://api.mapy.cz/v1/routing/route?start=${from.lng},${from.lat}&end=${to.lng},${to.lat}&routeType=car_fast&lang=cs&apikey=${encodeURIComponent(key)}`
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
      if (res.ok) {
        const data = (await res.json()) as { length?: number }
        if (typeof data.length === 'number' && data.length >= 0) return { km: Math.round(data.length / 100) / 10, estimated: false }
      } else {
        console.error('[travel] Mapy.com routing:', res.status)
      }
    } catch (err) {
      console.error('[travel] Mapy.com routing:', err)
    }
  }
  return { km: Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng) * ROAD_FACTOR_ESTIMATE * 10) / 10, estimated: true }
}

/** Podmínky dopravy a výchozí bod pro objednávku (null = u objednávky se doprava nepočítá) */
export async function travelSetupOf(db: Db, orderId: string): Promise<{ terms: TravelTerms; origin: LatLng } | null> {
  const { data } = await db
    .from('orders')
    .select('offer_kind, provider_id, agreed_charge_halere, service_items(offer_kind, price_per_km, free_km), services(address_lat, address_lng, city_lat, city_lng)')
    .eq('id', orderId)
    .maybeSingle()
  const o = data as {
    offer_kind: string | null
    provider_id: string
    agreed_charge_halere: number | null
    service_items: { offer_kind: string | null; price_per_km: number | null; free_km: number | null } | null
    services: { address_lat: number | null; address_lng: number | null; city_lat: number | null; city_lng: number | null } | null
  } | null
  if (!o) return null
  const kind = o.service_items?.offer_kind ?? o.offer_kind
  if (kind !== 'B' || o.agreed_charge_halere != null) return null
  const terms = travelTermsOf(o.service_items)
  if (!terms) return null

  let origin: LatLng | null = o.services?.address_lat != null && o.services?.address_lng != null
    ? { lat: Number(o.services.address_lat), lng: Number(o.services.address_lng) }
    : null
  if (!origin) {
    // Karta bez vlastní adresy přebírá adresu z profilu
    const { data: p } = await db.from('profiles').select('address_lat, address_lng').eq('id', o.provider_id).maybeSingle()
    const pp = p as { address_lat: number | null; address_lng: number | null } | null
    if (pp?.address_lat != null && pp?.address_lng != null) origin = { lat: Number(pp.address_lat), lng: Number(pp.address_lng) }
  }
  if (!origin && o.services?.city_lat != null && o.services?.city_lng != null) {
    origin = { lat: Number(o.services.city_lat), lng: Number(o.services.city_lng) }
  }
  if (!origin) return null
  return { terms, origin }
}

/** Doprava k adrese zákazníka (null = u objednávky se doprava nepočítá nebo chybí adresa) */
export async function travelQuoteFor(db: Db, orderId: string, to: { lat: number | null; lng: number | null }): Promise<TravelQuote | null> {
  if (to.lat == null || to.lng == null || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return null
  const setup = await travelSetupOf(db, orderId)
  if (!setup) return null
  const { km, estimated } = await roadKm(setup.origin, { lat: Number(to.lat), lng: Number(to.lng) })
  const { billableKm, feeHalere } = travelFee(setup.terms, km)
  return { km, billableKm, feeHalere, estimated, terms: setup.terms }
}

/** Text dopravy pro zákazníka („zdarma do 10 km, pak 12 Kč/km“) */
export function travelTermsText(terms: TravelTerms | null): string {
  if (!terms) return 'doprava v ceně'
  const price = `${terms.pricePerKmKc.toLocaleString('cs-CZ')} Kč/km`
  return terms.freeKm > 0 ? `doprava zdarma do ${terms.freeKm} km, dál ${price}` : `doprava ${price}`
}
