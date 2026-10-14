# Plán vrstvy 4 – refundy, zrušení po zaplacení, ochrana proti podvodu

Stav: SCHVÁLENO 13. 10. 2026 (stavba po částech: 1) strop, limity, štítky, upozornění, pokyn; 2) zrušení + refund + odstoupení; 3) „nemohu dodržet“ + Stripe Dashboard). Model §7, §8, §10, §11, §13, §21 (katalog AUTOREF), stanovisko AK body 2, 4, 5, 7.
Navazuje na vrstvu 1: `lib/booking/rules.ts` (decideAutoRefund, stavy refundu), tabulky `order_refunds`,
`order_reschedules`, `booking_consents`, `withdrawals` a webhook `refund.*` (už synchronizuje `order_refunds`).

## Zásady
- Peníze se vrací vždy z účtu poskytovatele přes Stripe (Direct Charge); Propojo jen zadá refund podle předem
  odsouhlaseného pokynu. Provize se nevrací (`refund_application_fee: false`).
- Spouštěče jen z uzavřeného katalogu AUTOREF-001 až 006 (model §21). Nic mimo něj.
- Stav refundu jen podle Stripe (requested → pending → succeeded / failed). UI: „Vrácení částky bylo zahájeno“ ≠ „Částka byla vrácena“.
- Selže-li refund: oznámení zákazníkovi i poskytovateli, povinnost vrátit zůstává poskytovateli (Poznámka k refundům AK).

## A. Pokyn poskytovatele k automatickým refundům
- Na stránce Výplaty (a v průvodci napojením účtu) samostatné zaškrtávací pole s přesným zněním pokynu
  (příkaz poskytovatele, aby Provozovatel jeho jménem zadal plný refund v případech AUTOREF-001…006,
  včetně věty, že u zrušení zákazníkem nese refund celé částky, provizi i poplatek Stripe).
- Uloží se do `booking_consents` (kind `provider_auto_refund_instruction`, `scope` = katalog, verze pokynu,
  verze podmínek, IP, prohlížeč, čas) + nové sloupce `text_snapshot` (přesné znění) a `catalog_version`.
- Bez pokynu poskytovatel **nepřijímá nové rezervace** (nová blokace v `getAccountBlocks` → stejné chování
  jako bez Stripe účtu: štítek „Zatím nepřijímá online rezervace“). Stávající poskytovatelé uvidí banner.
- Nová verze katalogu = nový výslovný souhlas (starý souhlas platí jen pro svůj rozsah).

## B. Zrušení potvrzené rezervace
- **Poskytovatel** „Zrušit rezervaci“ + důvod → stav `cancelled` (provider_cancelled) → plný refund (AUTOREF-001),
  oznámení zákazníkovi. Termín se uvolní.
- **Zákazník** „Zrušit rezervaci“ → `customerCancellationOutcome` (rules.ts):
  - před hranicí (A/C: před začátkem a před předáním závazné nabídky; B: před začátkem a bez check-inu)
    → plný refund (AUTOREF-004);
  - za hranicí → automaticky nic; text: „Automatické vrácení už nejde. Domluvte se s poskytovatelem,
    případně využijte odstoupení od smlouvy.“
  - Před potvrzením (jen blokace) funguje už dnes – blokace se uvolní.
- **Odstoupení od smlouvy (VOP 9.1)** – samostatná funkce dostupná 14 dní od vzniku rezervace, i po předání
  nabídky: záznam do `withdrawals`, potvrzení e-mailem s datem a časem, oznámení poskytovateli.
  Peníze automaticky nehýbe – vrací je poskytovatel sám (VOP 9.4). „Zrušit rezervaci“ nesmí být jediná cesta.

## C. „Původní termín nemohu dodržet“ (poskytovatel)
- Poskytovatel navrhne nový termín (`order_reschedules`, kind `cannot_keep_original`), expirace = dřívější
  z 24 h a začátku původního termínu; připomínka zákazníkovi v polovině lhůty (u krátkých hodinu před koncem).
- Zákazník: přijme → mění se jen termín rezervace; odmítne nebo nereaguje → plný refund (AUTOREF-002).
- „Navrhnout alternativní termín“ (bez prohlášení, že původní neplatí) nic nemění; poskytovatel je vázán
  původním termínem.

## D. Úkony ve Stripe Dashboardu
- Capture po uplynutí lhůty k potvrzení → rezervace nevznikla → plný refund (AUTOREF-005).
- Částečný / jiný capture (`amount_received` ≠ blokovaná částka) → záznam + upozornění adminovi.
- Potvrzení e-mailem zákazníkovi (VOP 8.3) i při capture ve Stripe a při automatickém potvrzení.

## E. Refund engine (`lib/booking/refunds.ts`)
- `runAutoRefund(order, trigger)`: ověří pokyn (scope) → `decideAutoRefund` → záznam `order_refunds` (requested)
  → `stripe.refunds.create({ payment_intent }, { stripeAccount, idempotencyKey: autoref-<order>-<trigger> })`
  → stav ze Stripe; dál webhook `refund.updated` / `charge.refunded` (už existuje).
- Cron `booking-tick` navíc: expirace přeplánování, opakování refundů ve stavu requested (Stripe nedostupný),
  připomínky.
- V detailu objednávky blok „Vrácení peněz“ se stavem pro obě strany.

## F. Ochrana proti podvodu (Matej 13. 10. 2026)
- **Strop na jednu rezervaci 5 000 Kč** (Rezervační poplatek / Cena výjezdu; dnes 20 000 Kč).
- **Limit otevřených zaplacených rezervací** nového poskytovatele: součet budoucích zaplacených rezervací
  nejvýš **3 × 5 000 = 15 000 Kč**; po prvních rezervacích „bez problémů“ **5 × 5 000 = 25 000 Kč**.
  Hlídá se před platbou; zákazník uvidí „Tento termín teď nejde zaplatit online – napište poskytovateli“,
  poskytovatel uvidí, že narazil na limit nového účtu. LEGAL_REVIEW_NEEDED (omezení podle P2B → do VOP).
- **Upozornění adminovi**, když poskytovatel nastaví 5 000 Kč (položka v ceníku, nabídka na poptávku, cena
  v návrhu termínu) – „začíná být podezřelý“.
- **Odpojení Stripe účtu** (`account.application.deauthorized`) → poskytovatel se automaticky pozastaví (nové
  rezervace), zákazníkům s budoucí zaplacenou rezervací odejde upozornění. Refund už přes API nejde (platforma
  ztratí přístup) → zákazník má chargeback u své banky; text to vysvětlí.
- **Smazání účtu** v Propoju zablokované, dokud má poskytovatel otevřené rezervace (VOP: účet funkční do konce
  poslední lhůty pro refund).
- **Štítek „Nový na Propoju“** u poskytovatelů bez dokončené rezervace.
- Ověřené IČO (ARES) jako podmínka přijímání rezervací – už dnes existuje `ico_verified`, zapojit do blokací.

## Kontrolní tabulka (Matej 13. 10. 2026 – hlídat u každého spouštěče)
Společné pro všechny řádky:
- **Pokyn:** poskytovatel jednou zaškrtne pokyn s přesným zněním a verzí katalogu (část A). Bez platného pokynu
  nepřijímá rezervace, takže každá zaplacená rezervace už je pokynem krytá. Refund se nespustí, pokud spouštěč
  není v `scope` uloženého souhlasu (`decideAutoRefund` → skip `not_covered_by_instruction`).
- **Zastavení kvůli sporu:** Stripe dispute ve stavu `needs_response`, `under_review` nebo `lost` → automatika
  nic nedělá (skip `disputed`), záznam do `order_events` (`refund_skipped`), oznámení oběma stranám, že se to
  řeší přes banku. Dotaz `warning_*` refund nezastaví. Stejně se zastaví, když už refund běží (skip `in_flight`)
  nebo když už je vše vráceno (skip `nothing_left`).
- **Peníze:** vrací se celá dosud nevrácená částka (Rezervační poplatek / Cena výjezdu) z účtu poskytovatele.
  **Provize Propoja se nevrací** (`refund_application_fee: false`, AK bod 1). **Poplatek Stripe** za původní
  platbu Stripe při refundu nevrací – nese ho poskytovatel (model §2). Nic z toho nejde z peněz Propoja.

| ID | Přesný spouštěč (systémová událost) | Kdo ho vyvolá a kdy | Část |
|---|---|---|---|
| AUTOREF-001 | Poskytovatel klikne „Zrušit rezervaci“ u potvrzené (stržené) rezervace | poskytovatel, kdykoli před začátkem termínu | 2 |
| AUTOREF-002 | Zákazník odmítne nový termín z „Nemohu dodržet“, nebo návrh vyprší (dřívější z 24 h a začátku původního termínu) | zákazník / cron | 3 |
| AUTOREF-003 | Poskytovatel uzná nahlášené nedostavení, nebo nereaguje 72 h od odeslání výzvy | poskytovatel / cron | vrstva 5 |
| AUTOREF-004 | Zákazník klikne „Zrušit rezervaci“ před hranicí (A/C: před začátkem a před předáním nabídky; B: před začátkem a bez check-inu) | zákazník | 2 |
| AUTOREF-005 | Stržení platby ve Stripe Dashboardu až po uplynutí lhůty k potvrzení (webhook) | poskytovatel ve Stripe | 3 |
| AUTOREF-006 | Poskytovatel uzná hlášení „Nabídku jsem neobdržel“, nebo nereaguje 72 h | poskytovatel / cron | vrstva 7 |

Co se NESMÍ rozbít (potvrzené chování): zrušení / odmítnutí před potvrzením jen uvolní blokaci (bez refundu);
automatické potvrzení termínu poskytovatele; stavy podle webhooků; provize vzniká capturem.

## SQL (aditivní)
- `booking_consents` + `text_snapshot text`, `catalog_version text`, `terms_version text`.
- Případně `orders.cancel_note text` (důvod zrušení) – ověřím schéma před psaním.

## Testy (výběr)
Zrušení poskytovatelem po potvrzení → refund succeeded; zákazník před/za hranicí; přeplánování přijato /
odmítnuto / expirováno; refund selže (účet bez prostředků) → oznámení; opakovaný webhook nic nezdvojí;
capture po lhůtě → refund; limit 15 000 Kč u nového účtu; upozornění při 5 000 Kč; odpojení Stripe → pozastavení.
Stripe CLI na Windows nefunguje → webhooky se ověří na produkci (testovací klíče) – stejně jako u vrstvy 3.

## Rozhodnutí Mateje (13. 10. 2026)
1. Strop 5 000 Kč na rezervaci platí pro všechny.
2. Limit = součet otevřených zaplacených rezervací: nový poskytovatel 15 000 Kč (3 × 5 000).
3. Po 5 dokončených rezervacích bez zrušení z jeho strany, nahlášeného nedostavení a sporu 25 000 Kč (5 × 5 000);
   po 20 dokončených limit zmizí a poskytovatel dostane štítek „Důvěryhodný“ (s vysvětlením kritérií –
   LEGAL_REVIEW_NEEDED: vlastní štítek Propoja, AK bod 10).
