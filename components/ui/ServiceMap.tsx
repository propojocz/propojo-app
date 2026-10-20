'use client'
// components/ui/ServiceMap.tsx
// Mapa s jedním špendlíkem (adresa provozovny, místo zakázky…). Od M1 (20. 10. 2026, docs/plan-mapy.md)
// jen tenký obal nad společnou PropojoMap – podklad Mapy.com, vlastní špendlík Propoja v barvě role.
// Bez klíče NEXT_PUBLIC_MAPY_API_KEY nebo souřadnic se nevykreslí (null), takže stránka nespadne.

import PropojoMap, { type MapPinKind } from '@/components/ui/PropojoMap'

interface Props {
  lat: number
  lng: number
  /** Popisek špendlíku (název karty nebo adresa). */
  label?: string
  /** Odkaz „Otevřít v Mapy.cz" pod mapou. Default true. */
  showLink?: boolean
  className?: string
  /** Barva špendlíku: poskytovatel / provozovna (výchozí), zákazník, obecné místo */
  kind?: MapPinKind
}

export default function ServiceMap({ lat, lng, label, showLink = true, className, kind = 'provider' }: Props) {
  return <PropojoMap pins={[{ lat, lng, label, kind }]} showLink={showLink} className={className} />
}
