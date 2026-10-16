// lib/obec-from-address.ts
// Obec z textu adresy z našeptávače: „Moravská 1568, Rožnov pod Radhoštěm, Česko“ → „Rožnov pod Radhoštěm“.
// Bez 'use server' – používá chat jednání (adresa zákazníka) i soukromá poptávka (obec z profilu).

export function obecFromAddress(text: string | null | undefined): string | null {
  if (!text) return null
  const parts = text.split(',')
    .map((p) => p.trim().replace(/^\d{3}\s?\d{2}\s*/, '').trim())
    .filter((p) => p && !/^(česko|czechia|česká republika|czech republic)$/i.test(p))
  if (parts.length === 0) return null
  // „Ulice číslo, Obec“ → obec; jen jedna část bez čísla domu → to je obec
  if (parts.length === 1) return /\d/.test(parts[0]) ? null : parts[0]
  return parts[parts.length - 1]
}
