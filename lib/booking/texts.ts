// lib/booking/texts.ts
// Texty rekapitulace před platbou (model v2 §15, §17) na jednom místě.
//
// OPEN – LEGAL (model §20, body 5, 11 a 13): znění pravidel zrušení a žádosti o plnění
// před uplynutím lhůty pro odstoupení potvrdí právnička. Po jejím stanovisku se mění jen
// tento soubor a RECAP_DOCUMENT_VERSION (ukládá se k souhlasu do booking_consents).

import type { OfferKind } from './policy'

/** Verze znění rekapitulace a souhlasu. Při každé změně textů zvýšit. */
export const RECAP_DOCUMENT_VERSION = 'recap-2026-10-04-v4'

// Podle pracovních VOP (v4.1, 3. 10. 2026), čl. 9:
//  A služba – zákazník může od Rezervační smlouvy odstoupit do 14 dnů; nic se nezaškrtává, jen poučení.
//  B výjezd – výslovná žádost o provedení před uplynutím lhůty + poučení o zániku práva (čl. 9.6).
//  C výrobek na míru – právo odstoupit nevzniká; zákazník to musí před odesláním potvrdit (čl. 9.2, 9.3).

/** Zaškrtávací pole před odesláním (null = u tohoto typu se nic nepotvrzuje) */
export function recapCheckbox(kind: OfferKind): string | null {
  if (kind === 'B') {
    return 'Chci, aby výjezd proběhl v tomto termínu, i když je to dřív než za 14 dní. Beru na vědomí, že provedením výjezdu právo odstoupit zaniká.'
  }
  if (kind === 'C') return 'Beru na vědomí, že u výrobku na míru nemám právo od rezervace odstoupit.'
  return null
}

/** Rozbalovací „Proč?“ u zaškrtávacího pole */
export function recapCheckboxWhy(kind: OfferKind): string | null {
  if (kind === 'B') {
    return 'Ze zákona máte 14 dní na odstoupení. Bez této žádosti by výjezd mohl proběhnout až po nich. Když odstoupíte po zahájení výjezdu, platíte jeho poměrnou část.'
  }
  if (kind === 'C') return 'Výrobek se zhotovuje podle vašeho zadání, proto zákon právo odstoupit nedává (§ 1837 občanského zákoníku).'
  return null
}

/** Krátké poučení u služby (bez zaškrtávání) */
export function withdrawalNote(kind: OfferKind): string | null {
  return kind === 'A' ? 'Od rezervace můžete do 14 dnů odstoupit, poskytovatel vám pak poplatek vrátí.' : null
}

/** Text tlačítka: musí být jasné, že odesláním vzniká povinnost zaplatit, i s částkou (VOP čl. 7.9) */
export function submitLabel(amountKc: number): string {
  return `Rezervovat a zaplatit ${amountKc.toLocaleString('cs-CZ')} Kč`
}

/** Jedna věta o platbě pod částkou */
export const PAYMENT_SHORT = 'Strhne se až po potvrzení poskytovatelem. Do té doby můžete zdarma zrušit.'

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
  const co = kind === 'C' ? 'výrobku' : 'služby'
  return `Když se s poskytovatelem domluvíte, poplatek se odečte z ceny ${co}. Když k zakázce nedojde, poskytovatel vám ho vrátí do 14 dnů.`
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
export function cancellationRules(kind: OfferKind): string[] {
  const common = [
    'Částka se na kartě jen zablokuje. Strhne se až poté, co poskytovatel rezervaci potvrdí. Když ji nepotvrdí včas, blokace se uvolní.',
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

export const PAYMENT_NOTE =
  'Platba jde přímo poskytovateli přes Stripe, Propojo peníze nedrží. Na výpisu uvidíte údaje poskytovatele.'
