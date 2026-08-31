// lib/product-storno.ts
// Kolik procent zálohy propadá při zrušení VÝROBKU NA OBJEDNÁVKU zákazníkem —
// čím blíž k termínu dodání/vyzvednutí, tím míň se vrací. Referenční okno je
// vlastní předstih poskytovatele (lead_time_days), který si sám nastavil jako
// "tolik dopředu potřebuji vědět" — přirozená stupnice, ne vymyšlené číslo:
//   • zrušeno s odstupem ≥ celého předstihu     → 0 %   propadá (100 % zpět)
//   • zrušeno s odstupem ≥ poloviny předstihu   → 50 %  propadá
//   • blíž, nebo už v den dodání/po něm         → 100 % propadá
// Bez nastaveného předstihu (lead_time_days = 0) se storno neřeší — chová se
// jako výrobek skladem, vždy plná vratka.
//
// SDÍLENÁ FUNKCE: stejný vzorec musí použít server (payout.ts — kde se peníze
// opravdu vrací) i klient (OrderDetailClient.tsx — kde zákazník vidí náhled
// PŘED kliknutím na Zrušit). Kdyby se ty dva výpočty rozešly, stránka by
// slibovala jinou částku, než jakou by server skutečně vrátil.
//
// Čistá funkce bez závislostí na serveru ani prohlížeči — bezpečná pro import
// z 'use client' i 'use server' souborů.

export function vyrobekStornoPodil(
  neededAt: string | null,
  leadTimeDays: number | null | undefined,
): number {
  const predstihDny = Number(leadTimeDays ?? 0)
  if (!neededAt || predstihDny <= 0) return 0
  const hodinDoTerminu = (new Date(`${neededAt}T00:00:00`).getTime() - Date.now()) / 3_600_000
  const potrebaHodin = predstihDny * 24
  if (hodinDoTerminu >= potrebaHodin) return 0
  if (hodinDoTerminu >= potrebaHodin / 2) return 0.5
  return 1
}