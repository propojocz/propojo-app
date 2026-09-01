// lib/product-confirmation.ts
// Kdy musí objednávku výrobku nejdřív potvrdit poskytovatel, než zákazník zaplatí.
//
// PROČ: „zákazník zaplatil dort na čtvrtek, cukrář je nemocný a Propojo se
// tváří, že je potvrzeno" je nejhorší možný scénář. Proto se u všeho, co není
// bezpečně automatické, provider musí vyjádřit dřív, než dojde na peníze.
//
// Provider ŽÁDNÝ technický přepínač nevyplňuje — odvozuje se z odpovědí, které
// už dal v editoru (dostupnost + způsob a čas převzetí).
//
// Sdílené mezi serverem (product-order.ts) a UI, aby zákazník viděl dopředu
// totéž, co pak systém opravdu udělá.

export type ConfirmationInput = {
  stock_mode?: string | null
  pickup_mode?: string | null
  pickup_timing?: string | null
}

/**
 * Pravidlo:
 *   made_to_order                     → vždy potvrzuje provider (teprve se vyrábí)
 *   doručení                          → potvrzuje provider (musí naplánovat cestu)
 *   osobní odběr po domluvě           → potvrzuje provider (musí být doma/v dílně)
 *   skladem + odběr v otevírací době  → automaticky, bez čekání
 *   unlimited                         → řídí se způsobem převzetí, stejně jako sklad
 */
export function vyzadujePotvrzeni(item: ConfirmationInput): boolean {
  const rezim = item.stock_mode ?? 'stock'

  // Teprve se vyrábí — provider musí říct, že to na daný termín zvládne.
  if (rezim === 'made_to_order') return true

  // Doručení znamená, že se někam musí vypravit — nelze slíbit automaticky.
  if (item.pickup_mode === 'delivery') return true

  // „Po domluvě" je doslova domluva: bez providera se nedá určit, kdy si zákazník přijde.
  if (item.pickup_timing === 'by_agreement') return true

  // Zbývá: skladem (nebo bez omezení) + odběr v otevírací době provozovny.
  // Zboží fyzicky je, provozovna má otevřeno — čekat na potvrzení nemá smysl.
  return false
}

/** Kolik hodin má provider na vyjádření, než objednávka propadne. */
export const CONFIRMATION_HOURS = 24
/** Minimální okno na reakci. Není to prodloužení lhůty — je to podmínka, aby
 *  se den dodání vůbec dal nabídnout (viz nejdrivejsiDenDodani). */
export const MIN_CONFIRMATION_HOURS = 2

/**
 * Nejzazší okamžik, kdy má potvrzení ještě smysl: den dodání minus předstih,
 * který si provider sám nastavil jako „tolik času potřebuji".
 */
function nejzazsiPotvrzeni(neededAt: string, leadTimeDays?: number | null): Date {
  const cil = new Date(`${neededAt}T00:00:00`)
  const predstih = Math.max(0, Number(leadTimeDays ?? 0))
  return new Date(cil.getTime() - predstih * 24 * 3600_000)
}

/**
 * Do kdy musí provider odpovědět.
 *
 * Základ je 24 hodin, ale NIKDY nesmí přesáhnout okamžik „den dodání minus
 * předstih". Kdyby přesáhl, provider by mohl přijmout objednávku ve chvíli, kdy
 * už deklarovaný předstih nestíhá — přesně to, co má předstih zaručovat.
 *
 * Proto se tu žádné minimum nedopočítává. To, že provider dostane rozumné okno
 * na reakci, se zajišťuje DŘÍV: nejdrivejsiDenDodani nedovolí objednat den,
 * u kterého by na odpověď zbývalo míň než MIN_CONFIRMATION_HOURS.
 */
export function confirmationDeadline(
  neededAt?: string | null,
  leadTimeDays?: number | null,
  from: Date = new Date(),
): Date {
  const zaklad = new Date(from.getTime() + CONFIRMATION_HOURS * 3600_000)
  if (!neededAt) return zaklad

  const nejzazsi = nejzazsiPotvrzeni(neededAt, leadTimeDays)
  if (isNaN(nejzazsi.getTime())) return zaklad

  return nejzazsi.getTime() < zaklad.getTime() ? nejzazsi : zaklad
}

/**
 * Nejbližší den dodání, který jde nabídnout (formát YYYY-MM-DD).
 *
 * Nestačí „dnes + předstih": u objednávky podané pozdě večer by na potvrzení
 * zbývaly minuty. Posouváme proto na první den, u kterého na odpověď zbývá
 * aspoň MIN_CONFIRMATION_HOURS — jinak by se buď porušil předstih, nebo by
 * objednávka propadla dřív, než se k ní provider dostane.
 */
export function nejdrivejsiDenDodani(
  leadTimeDays?: number | null,
  from: Date = new Date(),
  vyzadujePotvrzeniObjednavky = true,
): string {
  const predstih = Math.max(0, Number(leadTimeDays ?? 0))
  const den = new Date(from)
  den.setHours(0, 0, 0, 0)
  den.setDate(den.getDate() + predstih)

  if (vyzadujePotvrzeniObjednavky) {
    const minimum = from.getTime() + MIN_CONFIRMATION_HOURS * 3600_000
    // Posouvej po dnech, dokud na potvrzení nezbývá dost času.
    for (let i = 0; i < 14; i++) {
      const kandidat = new Date(den)
      kandidat.setDate(kandidat.getDate() + i)
      const iso = kandidat.toISOString().slice(0, 10)
      if (nejzazsiPotvrzeni(iso, predstih).getTime() >= minimum) return iso
    }
  }

  return den.toISOString().slice(0, 10)
}