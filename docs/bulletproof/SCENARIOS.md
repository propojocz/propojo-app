# Scénáře – master matice

Jediná matice scénářů. Pravidla a rozhodnutí jsou jen v `docs/model-v2.md` (sloupec „model §“ na ně odkazuje).
Stavy: NOT_TESTED, PASSED, FAILED, BLOCKED, LAWYER_PENDING, ACCOUNTANT_PENDING, TECH_PENDING.
Priority: BLOCKER, HIGH, MEDIUM, LOW.

Ostatní oblasti (BOOK, PAY, CANCEL, RESCHED, NOSHOW, MB, MC, REF, WH, ACCT, RECON, SEC, GDPR, DAC7, TIME, NOTIF, JOB, ADMIN, TRUST, REVIEW)
se doplní v bulletproof kroku – včetně ručních testů vrstvy 2 a 3a (28. 9. – 2. 10. 2026).

## HANDOFF – zákazníkem schválená změna poskytovatele

Rezervovaná rodina. Celá je BLOCKED do odpovědi právničky (model §20, OPEN – LEGAL bod 14 a HANDOFF-001).
Očekávané výsledky se doplní až po stanovisku; do té doby se nic neimplementuje ani netestuje.

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
