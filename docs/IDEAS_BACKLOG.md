# PROPOJO – IDEAS BACKLOG

Trvalé místo pro nápady, které nejsou součástí aktuálního MVP.
Pravidlo: nápad se nejdřív zapíše sem, neimplementuje se automaticky. Při plánování se přesune do konkrétního roadmap/backlog dokumentu.

Pořadí podle Mateje (7. 10. 2026): IDEA-001 ve verzi „Spolupráce V1“ po dokončení poptávek (část B po vrstvě 3), IDEA-002 někdy později.

## IDEA-001 — Propojo Parťáci / B2B spolupráce mezi poskytovateli

**Status:** PLANNED – V1 „Spolupráce“ po poptávkách (zadání: `docs/spoluprace-v1.md`, interně `PROVIDER_COLLABORATION_V1`)
**Priorita:** vysoký potenciál, ale neblokuje současné MVP

### Problém
Řemeslníci často nehledají jen nové zákazníky, ale také schopného člověka k sobě na konkrétní zakázku nebo dlouhodobější podnikatelskou spolupráci.

### Koncept
Druhá strana Capacity Match:

- **„Hledám parťáka“** – poskytovatel zadá, koho potřebuje, na jakou práci, kdy, přibližnou lokalitu a případně odměnu/cenové rozpětí.
- **„Jsem otevřený spolupráci“** – poskytovatel označí obory, ve kterých může pomáhat ostatním, oblast, dostupnost a typ spolupráce.
- Propojo páruje poptávku s vhodnými poskytovateli podle oboru, dostupnosti a lokality.

V1 je záměrně zjednodušená: jen stav na profilu + krátká poznámka + adresář poskytovatelů + chat (viz `docs/spoluprace-v1.md`). Párování, B2B poptávky a hodnocení až později.

### Zásadní hranice
Nejde o předání zákaznické rezervace. Původní poskytovatel zůstává smluvním partnerem zákazníka a další poskytovatel je jeho samostatný B2B spolupracovník / subdodavatel.

Pracovní místa a zaměstnávání nejsou součástí této funkce a řeší se případně v samostatném budoucím produktu po právním posouzení.

### Monetizace – pracovní varianty
1. MVP zdarma jako síťový efekt a retenční funkce pro poskytovatele.
2. Později součást placeného PRO balíčku nástrojů pro poskytovatele, nikoli placený organický ranking.
3. Premium nástroje: uložená síť kolegů, opakovaná spolupráce, hromadné oslovení, pokročilé filtry, plánování kapacity.
4. Případný B2B match/service fee až tehdy, pokud Propojo získá objektivní událost, na kterou lze poplatek navázat; neodvozovat z plnění mimo platformu bez spolehlivého signálu.

### Technická náročnost – předběžně
Střední, výrazně jednodušší než handoff zákaznické rezervace.

Lze znovu použít:
- provider profily,
- kategorie/obory,
- lokalitu,
- dostupnost,
- notifikace,
- chat,
- Capacity Match logiku.

Nové domény:
- collaboration preferences („jsem otevřený spolupráci“),
- collaboration request („hledám parťáka“),
- match/interest flow,
- B2B chat/context,
- případně reputace spolupráce provider ↔ provider.

### Budoucí rozšíření (NEIMPLEMENTOVAT ve V1)
- uložení oblíbených kolegů, moje síť spolupracovníků,
- konkrétní B2B poptávky,
- doporučení vhodného kolegy,
- hodnocení provider ↔ provider,
- opakované spolupráce,
- týmy, firemní účty,
- pracovní místa (viz IDEA-002).

### Otevřené body před implementací
- právní vymezení B2B spolupráce vs. zaměstnání / závislá práce,
- přesné údaje zobrazované před přijetím spolupráce,
- zda a jak uvádět odměnu/cenové rozpětí,
- hodnocení provider ↔ provider,
- případná pozdější monetizace.

---

## IDEA-002 — Pracovní místa / hledání zaměstnanců

**Status:** PARKED / FUTURE

Samostatný budoucí směr: nabídky pracovních míst pro řemeslníky a hledání zaměstnanců.

Neimplementovat v současném MVP. Před návrhem produktu je potřeba samostatné právní posouzení režimu zprostředkování zaměstnání a přesně oddělit pouhou inzertní funkci od aktivního matchingu.
