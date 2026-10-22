// lib/booking/texts.ts
// Texty rekapitulace před platbou (model v2 §15, §17) na jednom místě.
//
// OPEN – LEGAL (model §20, body 5, 11 a 13): znění pravidel zrušení a žádosti o plnění
// před uplynutím lhůty pro odstoupení potvrdí právnička. Po jejím stanovisku se mění jen
// tento soubor a RECAP_DOCUMENT_VERSION (ukládá se k souhlasu do booking_consents).

import { BOOKING_POLICY, type OfferKind } from './policy'

/** Verze znění rekapitulace a souhlasu. Při každé změně textů zvýšit. */
export const RECAP_DOCUMENT_VERSION = 'recap-2026-10-22-v9' // + doprava podle km u výjezdu

// Podle pracovních VOP (v4.1, 3. 10. 2026), čl. 9:
//  A služba – zákazník může od Rezervační smlouvy odstoupit do 14 dnů. U termínu do 14 dní navíc výslovná
//    žádost o provedení před uplynutím lhůty (§ 1837 písm. a OZ) – provedením služby právo zaniká
//    (Matej 15. 10. 2026, LEGAL_REVIEW_NEEDED: VOP 4.1 u služby počítá jen s poučením). Termín za víc než
//    14 dní: jen poučení, lhůta skončí dřív, než služba proběhne.
//  B výjezd – výslovná žádost o provedení před uplynutím lhůty + poučení o zániku práva (čl. 9.6).
//  C výrobek na míru – právo odstoupit nevzniká; zákazník to musí před odesláním potvrdit (čl. 9.2, 9.3).

// Lhůta pro odstoupení běží od potvrzení (stržení), ne od platby – poskytovatel může potvrzovat až
// confirmationWindowHours. Proto se k 14 dnům přičítá i lhůta k potvrzení (jinak by u termínu za ~14,5 dne
// mohla lhůta skončit až po službě, aniž by zákazník o provedení požádal).
const WITHDRAWAL_WINDOW_MS = (14 * 24 + BOOKING_POLICY.confirmationWindowHours) * 3600_000

/**
 * Služba: termín může začít dřív, než uplyne 14denní lhůta pro odstoupení → je potřeba žádost o provedení.
 * Neznámý termín se bere jako blízký (raději pole ukázat, než ho na serveru nečekaně vyžadovat).
 */
export function serviceNeedsEarlyRequest(start: Date | string | null | undefined, now = new Date()): boolean {
  if (!start) return true
  const t = new Date(start).getTime()
  return Number.isNaN(t) || t - now.getTime() < WITHDRAWAL_WINDOW_MS
}

/** Zaškrtávací pole před odesláním (null = u tohoto typu se nic nepotvrzuje) */
export function recapCheckbox(kind: OfferKind, start?: Date | string | null): string | null {
  if (kind === 'A') {
    return serviceNeedsEarlyRequest(start)
      ? 'Chci, aby služba proběhla v tomto termínu, i když je to dřív než za 14 dní. Beru na vědomí, že provedením služby právo odstoupit zaniká.'
      : null
  }
  if (kind === 'B') {
    return 'Chci, aby výjezd proběhl v tomto termínu, i když je to dřív než za 14 dní. Beru na vědomí, že provedením výjezdu právo odstoupit zaniká.'
  }
  if (kind === 'C') return 'Beru na vědomí, že u výrobku na míru nemám právo od rezervace odstoupit.'
  return null
}

/** Rozbalovací „Proč?“ u zaškrtávacího pole */
export function recapCheckboxWhy(kind: OfferKind, start?: Date | string | null): string | null {
  if (kind === 'A') {
    return serviceNeedsEarlyRequest(start)
      ? 'Ze zákona máte 14 dní na odstoupení. Bez této žádosti by služba mohla proběhnout až po nich. Do začátku termínu můžete rezervaci zrušit a poplatek se vám vrátí.'
      : null
  }
  if (kind === 'B') {
    return 'Ze zákona máte 14 dní na odstoupení. Bez této žádosti by výjezd mohl proběhnout až po nich. Když odstoupíte po zahájení výjezdu, platíte jeho poměrnou část.'
  }
  if (kind === 'C') return 'Výrobek se zhotovuje podle vašeho zadání, proto zákon právo odstoupit nedává (§ 1837 občanského zákoníku).'
  return null
}

/** Krátké poučení u služby s termínem za víc než 14 dní (bez zaškrtávání) */
export function withdrawalNote(kind: OfferKind, start?: Date | string | null): string | null {
  return kind === 'A' && !serviceNeedsEarlyRequest(start)
    ? 'Od rezervace můžete do 14 dnů odstoupit, poskytovatel vám pak poplatek vrátí.'
    : null
}

/** Text tlačítka: musí být jasné, že odesláním vzniká povinnost zaplatit, i s částkou (VOP čl. 7.9) */
export function submitLabel(amountKc: number): string {
  return `Rezervovat a zaplatit ${amountKc.toLocaleString('cs-CZ')} Kč`
}

/** Jedna věta o platbě pod částkou */
export const PAYMENT_SHORT = 'Strhne se až po potvrzení poskytovatelem. Do té doby můžete zdarma zrušit.'

/** Termín nabídl sám poskytovatel (vypsané okno, jeho návrh) – rezervace se potvrdí hned po zaplacení */
export const PAYMENT_SHORT_AUTO = 'Termín nabídl sám poskytovatel, takže se rezervace po zaplacení hned potvrdí a částka se strhne.'

export const OFFER_KIND_TITLE: Record<OfferKind, string> = {
  A: 'Rezervace služby',
  B: 'Výjezd a nacenění',
  C: 'Výrobek na míru',
}

export function paymentLabel(kind: OfferKind): string {
  return kind === 'B' ? 'Cena výjezdu' : 'Rezervační poplatek'
}

/**
 * Jedna věta o tom, co platba znamená – zobrazí se přímo nad tlačítkem (VOP čl. 7.8, čl. 11).
 * A/C: poplatek se při objednání započte na cenu, jinak ho poskytovatel vrátí (VOP 11.1, 11.2).
 * B: podle volby poskytovatele u Nabídky výjezdu se Cena výjezdu započte, nebo ne (VOP 11.6, rozhodnutí 4. 10. 2026).
 */
export function paymentMeaning(kind: OfferKind, quoteFeeDeductible = false): string {
  if (kind === 'B') {
    return quoteFeeDeductible
      ? 'Cena výjezdu je platba za samotný výjezd (cesta, prohlídka, nacenění). Když přijmete nabídku poskytovatele, odečte vám ji z ceny zakázky. Po provedení výjezdu se nevrací.'
      : 'Cena výjezdu je platba za samotný výjezd (cesta, prohlídka, nacenění), do ceny zakázky se nezapočítává. Po provedení výjezdu se nevrací.'
  }
  if (kind === 'C') {
    return 'Když přijmete závaznou nabídku poskytovatele, poplatek se odečte z ceny výrobku. Když ji nepřijmete, poskytovatel vám ho vrátí do 14 dnů.'
  }
  return 'Při placení služby se vám poplatek odečte z ceny. Když se služba neuskuteční, poskytovatel vám ho vrátí do 14 dnů – kromě případu, kdy bez omluvy nepřijdete.'
}

/**
 * Viditelná věta o započtení Ceny výjezdu přímo nad tlačítkem (VOP 7.8, 11.6) – jen když ji poskytovatel slíbil.
 * Bez slibu se nezobrazuje (Cena výjezdu je samostatná služba, viz paymentMeaning pod ⓘ).
 */
export function quoteFeeDeductionNote(kind: OfferKind, quoteFeeDeductible: boolean): string | null {
  return kind === 'B' && quoteFeeDeductible
    ? 'Když přijmete nabídku poskytovatele, Cenu výjezdu vám odečte z ceny zakázky.'
    : null
}

/** Stručná pravidla zrušení podle modelu §7 a §8 (znění k potvrzení právničkou) */
export function cancellationRules(kind: OfferKind, autoConfirm = false): string[] {
  const common = autoConfirm
    ? [
        'Termín nabídl sám poskytovatel, rezervace se proto potvrdí a částka strhne hned po zaplacení.',
        'Když poskytovatel potvrzenou rezervaci zruší nebo nedorazí, peníze se vám vrátí celé.',
      ]
    : [
        'Částka se na kartě jen zablokuje. Strhne se až poté, co poskytovatel rezervaci potvrdí. Na potvrzení má 48 hodin od platby, nejpozději však do 2 hodin před začátkem termínu. Když ji nepotvrdí včas, blokace se uvolní a nic nezaplatíte.',
        'Než poskytovatel rezervaci potvrdí, můžete ji zrušit bez poplatku – blokace se uvolní.',
        'Když poskytovatel potvrzenou rezervaci zruší nebo nedorazí, peníze se vám vrátí celé.',
      ]
  if (kind === 'B') {
    return [
      ...common,
      'Po potvrzení můžete výjezd zrušit s vrácením celé částky do začátku okna příjezdu, pokud poskytovatel ještě není na místě.',
    ]
  }
  if (kind === 'C') {
    return [
      ...common,
      'Po potvrzení můžete rezervaci zrušit s vrácením celé částky, dokud vám poskytovatel nepředá Závaznou nabídku a nezačal termín.',
    ]
  }
  return [...common, 'Po potvrzení můžete rezervaci zrušit s vrácením celé částky do začátku termínu.']
}

/**
 * Služba s pevnou cenou za úkon: kolik zákazník doplatí poskytovateli na místě („400 Kč teď, zbytek 450 Kč na místě“).
 * Jen informace z ceníku – doplatek Propojo nevybírá ani neeviduje (model §19). Jinde (hodinová sazba,
 * rozmezí, cena dohodou, výjezd) přesnou částku dopředu neznáme → null.
 */
export function restOnSiteKc(
  kind: OfferKind,
  item: { price?: number | null; price_type?: string | null; price_unit?: string | null } | null | undefined,
  chargeKc: number,
): { totalKc: number; restKc: number } | null {
  if (kind !== 'A' || !item) return null
  if (item.price_type !== 'fixed' || item.price_unit !== 'ukon') return null
  const total = Number(item.price ?? 0)
  if (!(total > chargeKc)) return null
  return { totalKc: total, restKc: Math.round((total - chargeKc) * 100) / 100 }
}

export const PAYMENT_NOTE =
  'Platba jde přímo poskytovateli přes Stripe, Propojo peníze nedrží. Na výpisu uvidíte údaje poskytovatele.'

/**
 * Krátké shrnutí nabídky z poptávky / chatu: „Cena výjezdu 500 Kč · odečte se z ceny zakázky“.
 * Služba: poplatek se odečítá vždy (VOP 11.1). Výjezd: podle volby poskytovatele (VOP 11.6).
 */
export function offerSummary(kind: 'A' | 'B', chargeKc: number, quoteFeeDeductible = false): string {
  const castka = `${chargeKc.toLocaleString('cs-CZ')} Kč`
  if (kind === 'A') return `Rezervační poplatek ${castka} · odečte se z ceny služby`
  return quoteFeeDeductible
    ? `Cena výjezdu ${castka} · odečte se z ceny zakázky`
    : `Cena výjezdu ${castka} · do ceny zakázky se nezapočítává`
}

// ─── Pokyn poskytovatele k automatickým refundům (vrstva 4, AK bod 4, model §21) ─────────
// Přesné znění se ukládá do booking_consents.text_snapshot. Změna znění nebo katalogu = nová verze
// a nový výslovný souhlas všech poskytovatelů.
export const AUTOREF_CATALOG_VERSION = 'autoref-2026-10-13-v1'
export const TERMS_VERSION = 'VOP-4.1'
export const AUTOREF_INSTRUCTION_TEXT = [
  'Dávám provozovateli Propojo pokyn, aby mým jménem zadal poskytovateli platebních služeb Stripe plný refund částky, kterou mi zákazník zaplatil přes Propojo (Rezervační poplatek nebo Cena výjezdu), z mého platebního účtu – a to výhradně v těchto případech:',
  '1. zruším potvrzenou rezervaci;',
  '2. oznámím, že původní termín nemohu dodržet, a zákazník nový termín odmítne nebo na návrh včas nezareaguje;',
  '3. zákazník nahlásí, že jsem se nedostavil, a já to uznám nebo do 72 hodin od výzvy nezareaguji;',
  '4. zákazník zruší rezervaci včas podle podmínek (před začátkem termínu a před předáním Závazné nabídky, u Výjezdu bez platného check-inu);',
  '5. platbu stržením potvrdím až po uplynutí lhůty k potvrzení – rezervace tím nevznikla;',
  '6. zákazník nahlásí, že nedostal Závaznou nabídku, a já to uznám nebo do 72 hodin od výzvy nezareaguji.',
  'Beru na vědomí, že automatický refund je technickým důsledkem předem popsané události, nikoli rozhodnutím provozovatele o nároku zákazníka nebo mém. Provize Propojo a poplatek Stripe se při refundu nevracejí a nesu je já. Probíhá-li k platbě spor (chargeback), automatický refund se neprovede. Rozšíření tohoto výčtu vyžaduje můj nový výslovný souhlas.',
].join('\n')

