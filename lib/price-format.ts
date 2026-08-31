// lib/price-format.ts
// Jediné místo, které skládá cenu s jednotkou. Používá ho ceník poskytovatele,
// veřejný ceník i objednávkový modal — jinak by se ta tři místa časem rozešla
// a zákazník by na každé obrazovce viděl cenu jinak.
//
// Model: jednotka + KOLIK jí je. "100 g" není jednotka, ale množství:
//     price = 45,  price_unit = 'g',   price_unit_quantity = 100  ->  "45 Kč / 100 g"
//     price = 129, price_unit = 'kus', price_unit_quantity = 1    ->  "129 Kč / ks"

import { PRICE_UNIT_LABELS, type PriceUnit } from '@/types/database'

// Krátký tvar jednotky pro zápis za lomítkem ("/ 100 g", "/ ks").
// PRICE_UNIT_LABELS má tvar "za kus", což se za lomítko nehodí.
const UNIT_SHORT: Record<string, string> = {
  hod: 'hod',
  ukon: 'úkon',
  projekt: 'projekt',
  den: 'den',
  osoba: 'osobu',
  kus: 'ks',
  baleni: 'balení',
  sada: 'sadu',
  porce: 'porci',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  litr: 'l',
  metr: 'm',
  m2: 'm²',
  bm: 'bm',
  m3: 'm³',
  sto_g: '100 g',
}

export function unitShort(unit: string | null | undefined): string {
  if (!unit) return ''
  return UNIT_SHORT[unit] ?? PRICE_UNIT_LABELS[unit as PriceUnit]?.replace(/^za /, '') ?? unit
}

/** "100 g", "ks", "500 ml" — jednotka i s množstvím, bez ceny. */
export function unitLabel(
  unit: string | null | undefined,
  quantity?: number | null,
): string {
  const mnozstvi = Number(quantity ?? 1)
  const zkratka = unitShort(unit)
  if (!zkratka) return ''
  return mnozstvi > 1 ? `${mnozstvi.toLocaleString('cs-CZ')} ${zkratka}` : zkratka
}

type PriceLike = {
  price?: number | null
  price_max?: number | null
  price_type?: string | null
  price_unit?: string | null
  price_unit_quantity?: number | null
  payment_model?: string | null
}

/**
 * Kompletní popisek ceny včetně jednotky:
 *   "129 Kč / ks", "45 Kč / 100 g", "1 200 – 1 800 Kč", "Cena dohodou"
 */
export function formatItemPrice(it: PriceLike): string {
  if (it.payment_model === 'B') return 'Nacenění na místě'
  if (it.price_type === 'on_agreement') return 'Cena dohodou'

  const jednotka = unitLabel(it.price_unit, it.price_unit_quantity)

  if (it.price_type === 'range' && it.price != null && it.price_max != null) {
    const rozsah = `${it.price.toLocaleString('cs-CZ')} – ${it.price_max.toLocaleString('cs-CZ')} Kč`
    return jednotka ? `${rozsah} / ${jednotka}` : rozsah
  }

  if (it.price != null && it.price > 0) {
    const castka = `${it.price.toLocaleString('cs-CZ')} Kč`
    return jednotka ? `${castka} / ${jednotka}` : castka
  }

  return 'Cena dohodou'
}

/** "Balení obsahuje: 500 g" — jen když to poskytovatel vyplnil. */
export function packageLabel(
  packageQuantity: number | null | undefined,
  packageUnit: string | null | undefined,
): string | null {
  if (packageQuantity == null || !packageUnit) return null
  const mnozstvi = Number(packageQuantity)
  if (!mnozstvi || mnozstvi <= 0) return null
  return `${mnozstvi.toLocaleString('cs-CZ')} ${unitShort(packageUnit)}`
}