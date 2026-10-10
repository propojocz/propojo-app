# Scénáře – master matice

Jediná matice scénářů. Pravidla a rozhodnutí jsou jen v `docs/model-v2.md` (sloupec „model §“ na ně odkazuje).
Stavy: NOT_TESTED, PASSED, FAILED, BLOCKED, LAWYER_PENDING, ACCOUNTANT_PENDING, TECH_PENDING.
Priority: BLOCKER, HIGH, MEDIUM, LOW.

Ostatní oblasti (BOOK, PAY, CANCEL, RESCHED, NOSHOW, MB, MC, REF, WH, ACCT, RECON, SEC, GDPR, DAC7, TIME, NOTIF, JOB, ADMIN, TRUST, REVIEW)
se doplní v bulletproof kroku – včetně ručních testů vrstvy 2 a 3a (28. 9. – 2. 10. 2026).

## HANDOFF – zákazníkem schválená změna poskytovatele

Rezervovaná rodina, MIMO MVP (stanovisko právničky 2. 10. 2026, model §20 HANDOFF-001 a OPEN – LEGAL bod 14).
Celá zůstává BLOCKED, dokud se k funkci po stabilizaci základního transakčního modelu nevrátíme.
Stav LAWYER_PENDING u řádků znamená: otázky se znovu otevřou až s návratem k funkci.

| ID | scénář | očekávaný výsledek | stav | test | model § | priorita |
|---|---|---|---|---|---|---|
| HANDOFF-01 | Provider navrhne kolegu (e-mail) | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | HIGH |
| HANDOFF-02 | Navržený kolega není registrován | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | HIGH |
| HANDOFF-03 | Kolega dokončí onboarding včetně Stripe Standard účtu | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001, §13 | HIGH |
| HANDOFF-04 | Kolega převzetí odmítne | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | MEDIUM |
| HANDOFF-05 | Zákazník změnu přijme | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | BLOCKER |
| HANDOFF-06 | Zákazník změnu odmítne → původní Rezervace beze změny | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | HIGH |
| HANDOFF-07 | Zákazník nereaguje | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | HIGH |
| HANDOFF-08 | Původní rezervace jen předautorizovaná | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001, §4 | BLOCKER |
| HANDOFF-09 | Původní rezervace už captured | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001, §7, §11 | BLOCKER |
| HANDOFF-10 | Refund původní rezervace pending / failed | – | BLOCKED / LAWYER_PENDING | – | §11 | BLOCKER |
| HANDOFF-11 | Nová předautorizace u nového providera selže | – | BLOCKED / LAWYER_PENDING | – | §4 | HIGH |
| HANDOFF-12 | Nový provider mezitím ztratí Stripe capability | – | BLOCKED / LAWYER_PENDING | – | §13 | HIGH |
| HANDOFF-13 | Ochrana údajů před schválením: navržený provider nevidí jméno, telefon, e-mail ani přesnou adresu | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001, §17 | BLOCKER |
| HANDOFF-14 | Zpřístupnění údajů novému providerovi až po schválení a nové rekapitulaci | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001, §15, §17 | BLOCKER |
| HANDOFF-15 | Race: původní provider mezitím rezervaci zruší | – | BLOCKED / LAWYER_PENDING | – | §7 | HIGH |
| HANDOFF-16 | Race: zákazník přijme handoff a původní provider současně refunduje | – | BLOCKED / LAWYER_PENDING | – | §11 | BLOCKER |
| HANDOFF-17 | Race: nový provider mezitím termín obsadí | – | BLOCKED / LAWYER_PENDING | – | §20 HANDOFF-001 | HIGH |

### GDPR – údaje navrženého náhradního providera (pending k HANDOFF-LEGAL-001)

| ID | údaje | kdy | stav | model § |
|---|---|---|---|---|
| GDPR-HANDOFF-PRE | PRE_APPROVAL DATA: typ práce, termín / okno, obec nebo přibližná lokalita, Rezervační poplatek / Cena výjezdu | před schválením zákazníkem | LAWYER_PENDING | §20 HANDOFF-001, §17 |
| GDPR-HANDOFF-POST | POST_APPROVAL DATA: jméno, kontakt a přesná adresa zákazníka – jen údaje potřebné k vyřízení rezervace | až po schválení zákazníkem a nové rekapitulaci | LAWYER_PENDING | §20 HANDOFF-001, §17 |

## OFFER – nepředaná Závazná nabídka (REF-OFFER-001, AUTOREF-006)

Model C a Model A s povinností předat Závaznou nabídku (model §21). Implementace ve vrstvě 7 (Model C) a s refund enginem (vrstva 4).
Race conditions: rozhoduje serverový čas a podmíněný přechod stavu případu (první úspěšný zápis vyhrává, druhý se odmítne).

| ID | scénář | očekávaný výsledek | stav | test | model § | priorita |
|---|---|---|---|---|---|---|
| OFFER-001 | Poskytovatel označí nabídku jako předanou před koncem lhůty | uloží se čas, aktér, zdroj; tlačítko „Nabídku jsem neobdržel“ se zákazníkovi neukáže; žádný pohyb peněz | NOT_TESTED | – | §21 REF-OFFER-001 | HIGH |
| OFFER-002 | Lhůta vyprší, poskytovatel nic neoznačí, zákazník nic nenahlásí | žádný refund, nic automaticky | NOT_TESTED | – | §21 | HIGH |
| OFFER-003 | Zákazník po lhůtě nahlásí nepředání, poskytovatel uzná | plný refund (AUTOREF-006), stav refundu podle webhooku | NOT_TESTED | – | §21 | BLOCKER |
| OFFER-004 | Zákazník nahlásí, poskytovatel rozporuje | žádný automatický refund; zákazník dostane informaci, že nárok řeší přímo s poskytovatelem | NOT_TESTED | – | §21 | BLOCKER |
| OFFER-005 | Zákazník nahlásí, poskytovatel 72 h nereaguje | plný refund po uplynutí 72 h od odeslání výzvy | NOT_TESTED | – | §21 | BLOCKER |
| OFFER-006 | Poskytovatel odpoví těsně před koncem 72 h | odpověď s časem serveru před koncem lhůty platí; cron refund nespustí (podmíněný přechod jen ze stavu „čeká na reakci“) | NOT_TESTED | – | §21 | HIGH |
| OFFER-007 | Připomínka se neodešle (chyba e-mailu) | lhůta běží dál od odeslání výzvy; hlášení je vidět v aplikaci; chyba připomínky se zaloguje | NOT_TESTED | – | §21 | MEDIUM |
| OFFER-008 | Poskytovatel označí nabídku jako předanou až po hlášení zákazníka | bere se jako rozporování → stop automatiky; obojí se eviduje | NOT_TESTED | – | §21 | HIGH |
| OFFER-009 | Poskytovatel označí předání ve stejné chvíli, kdy vyprší 72 h | vyhrává první úspěšný přechod stavu; odpověď s časem ≥ konec lhůty se odmítne („lhůta uplynula“) a refund proběhne | NOT_TESTED | – | §21 | HIGH |
| OFFER-010 | Refund ve Stripe proběhne, zápis do DB selže | idempotency key na případ; webhook `refund.*` dorovná `order_refunds`; opakování nic nezdvojí | NOT_TESTED | – | §11, §21 | BLOCKER |
| OFFER-011 | Refund čeká (zůstatek / stav účtu poskytovatele) | stav „čeká“, UI „Vrácení částky bylo zahájeno.“; konec podle webhooku | NOT_TESTED | – | §11 | HIGH |
| OFFER-012 | Stripe účet poskytovatele v době refundu nedostupný | refund „selhalo“, oznámení oběma stranám, povinnost vrátit zůstává poskytovateli; případ zůstane otevřený k opakování | NOT_TESTED | – | §11, §13 | HIGH |
| OFFER-013 | Zákazník chce hlásit před koncem lhůty | nejde (tlačítko není, server odmítne) | NOT_TESTED | – | §21 | MEDIUM |
| OFFER-014 | Zákazník hlásí opakovaně u stejné rezervace | jeden aktivní případ (unikátní index), další pokus vrátí ten existující | NOT_TESTED | – | §21 | HIGH |
| OFFER-015 | Model C: lhůta k předání blízko termínu zhotovení | lhůta končí přiměřenou dobu před termínem (parametr); když se do termínu nevejde, termín nejde rezervovat | TECH_PENDING | – | §21, AK bod 9 | MEDIUM |
| OFFER-016 | Model A se Závaznou nabídkou v textové podobě | stejný mechanismus jako u C, jen u Nabídek s touto povinností | NOT_TESTED | – | §21 | MEDIUM |

## FIN – finance a daně

| ID | scénář | očekávaný výsledek | stav | test | model § | priorita |
|---|---|---|---|---|---|---|
| FIN-VAT-001 | Sledovat obrat z provizí a upozornit na účetní kontrolu dřív, než bude relevantní povinné plátcovství DPH | administrativní monitoring (přehled obratu z `commission_ledger`), žádná zákonná hranice natvrdo v business logice | ACCOUNTANT_PENDING | – | §21 VAT-001 | MEDIUM |
| FIN-VAT-002 | Provize neplátce: application fee = provize bez DPH | 200 Kč → 29 Kč, 590 Kč → 59 Kč, 1 500 Kč → 89 Kč, 5 450 Kč → 138 Kč | NOT_TESTED | `lib/booking/commission.ts` | §3, §21 | HIGH |
