// lib/cancellation.ts
// Sdílený číselník storno politik. Používá formulář služby i detail služby,
// ať je znění na jednom místě.

export type CancellationKey = 'zadna' | 'mirna' | 'standardni' | 'prisna'

export interface CancellationLevel {
  key: CancellationKey
  label: string          // krátký název (do posuvníku)
  short: string          // jednořádkové shrnutí
  detail: string         // plné znění pro zákazníka
}

// Pořadí odpovídá posuvníku (0 = žádné … 3 = přísné)
export const CANCELLATION_LEVELS: CancellationLevel[] = [
  {
    key: 'zadna',
    label: 'Žádné',
    short: 'Bez storno podmínek',
    detail: 'Pro tuto službu nejsou nastaveny žádné storno podmínky.',
  },
  {
    key: 'mirna',
    label: 'Mírné',
    short: 'Zrušení 24 h předem zdarma',
    detail: 'Zrušení více než 24 hodin předem: záloha se vrací v plné výši. Méně než 24 hodin předem: záloha propadá poskytovateli.',
  },
  {
    key: 'standardni',
    label: 'Standardní',
    short: 'Zrušení 48 h předem zdarma',
    detail: 'Zrušení více než 48 hodin předem: záloha se vrací v plné výši. Mezi 24 a 48 hodinami: vrací se polovina zálohy. Méně než 24 hodin předem: záloha propadá poskytovateli.',
  },
  {
    key: 'prisna',
    label: 'Přísné',
    short: 'Zrušení jen 7 dní předem zdarma',
    detail: 'Zrušení více než 7 dní předem: záloha se vrací v plné výši. Méně než 7 dní předem: záloha propadá poskytovateli.',
  },
]

export function getCancellation(key?: string | null): CancellationLevel {
  return CANCELLATION_LEVELS.find((l) => l.key === key) ?? CANCELLATION_LEVELS[0]
}

export function cancellationIndex(key?: string | null): number {
  const i = CANCELLATION_LEVELS.findIndex((l) => l.key === key)
  return i < 0 ? 0 : i
}