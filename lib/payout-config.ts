// lib/payout-config.ts
// Lhůty výplat na jednom místě.
//
// PROČ SAMOSTATNÝ SOUBOR: payout.ts je 'use server', takže z něj nejde
// exportovat konstanty do klientských komponent — smí exportovat jen async
// funkce. Texty v UI se proto dřív psaly ručně a rozešly se s kódem:
// tlačítko slibovalo „automaticky do 2 dnů", zatímco kód čekal 7 dní.

/**
 * Za jak dlouho se platba uvolní poskytovateli sama, když zákazník nepotvrdí
 * ani nenamítá.
 *
 * POZOR: počítá se od okamžiku, kdy poskytovatel zakázku uzavřel (stav
 * 'ceka_potvrzeni' a completed_at) — NE od termínu služby ani od zaplacení.
 * Dokud poskytovatel neuzavře, automat neběží vůbec.
 */
export const AUTO_RELEASE_DAYS = 7

/** „7 dní" / „2 dny" — správný tvar do textu. */
export function dnyText(pocet: number): string {
  if (pocet === 1) return '1 den'
  if (pocet < 5) return `${pocet} dny`
  return `${pocet} dní`
}