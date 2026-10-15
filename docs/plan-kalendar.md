# Kalendář poskytovatele – podklad a rozhodnutí

Stav: rozhodnutí Mateje 15. 10. 2026 nad mockupy („Váš den pod kontrolou“, mobil Kalendář, varianta Elektrikář).
Plán stavby se pošle ke schválení až po „dotaz = soukromá poptávka“. Navazuje na Provider OS (`docs/provider-os-audit.md`).

## Rozhodnuto
1. „Moje podnikání ▾“ z mockupu **nestavět** (jen mockup).
2. Boční menu a spodní lišta z mockupu **nestavět** – zůstává dnešní horní lišta a menu ☰.
3. Filtr **„Místo konání“ ano**, stavět postupně: nejdřív z toho, co existuje (místo u poskytovatele podle adresy
   karty / u zákazníka = výjezdy), pobočky doplní Provider OS.
4. **Přesuny počítá poskytovatel sám** – žádný automatický výpočet tras. Kalendář použije rezervu, kterou si nastaví
   (dnes `service_items.buffer_minutes` = pauza za službou), a zobrazí ji jako šedý blok „Pauza / přesun“.
5. **Ruční rezervace = jen poznámka** poskytovatele v kalendáři (volný text a čas – může tam napsat jméno nebo místo).
   Bez platby, bez účtu zákazníka, nevzniká Rezervační smlouva. V UI odlišit od rezervací přes Propojo.
6. Pohledy: Den (časová osa jako v mockupu) a Týden; Měsíc – viz návrh níže.
7. **Přehled** ano – dnešní souhrn (rezervace, volno, co čeká na potvrzení, výdělek).
8. **Ukázkový den** pro prázdný kalendář – zašedle, jako ukázka.

## Prvky z mockupu, které stavíme
- Dny v týdnu, Dnes, ‹ ›, Den / Týden (/ Měsíc).
- Řádek rezervace: čas, iniciály, jméno, služba, místo, stav (Potvrzeno / Termín probíhá / Přijde ve …), Detail → objednávka.
- Mezera mezi rezervacemi: „Volno 10:15–12:20 (2 h 5 min) → Vytvořit bleskový termín“ (⚡ s předvyplněným časem a místem).
- Panel „Využijte volné místo“ (největší mezera dne → ⚡).
- „Přidat do kalendáře“: Ruční rezervace (poznámka), Blokovat čas (existuje `blockTime`).
- Mobil „+“ = menu: Bleskový termín / Ruční rezervace / Blokovat čas.
- Legenda „Vaše místa“.

## Otevřené
- Měsíční pohled: návrh – mřížka měsíce s počtem rezervací a volna u dne, klik → den. Stavět až po Dni a Týdnu.
- Volno se počítá v rámci otevírací doby (`provider_hours`); bez otevírací doby jen mezi rezervacemi.
