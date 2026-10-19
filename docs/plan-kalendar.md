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

## Plán stavby (návrh 15. 10. 2026, ke schválení)

Co už existuje a použije se: denní rozvrh `lib/actions/day-schedule.ts` (rezervace + blokace pro den, označení
příchodu), blokace `provider_blocks` + `blockTime`, otevírací doba karet `service_hours`, pauza za službou
`service_items.buffer_minutes`, rezerva na přejezd u karet „u zákazníka“ `services.travel_buffer_minutes`,
volné termíny `availability_slots`, bleskový termín `QuickSlotForm`, stránka Termíny (`/dashboard/terminy`).

**K1 – Kalendář: den** (HOTOVO 19. 10. 2026, otestováno a nasazeno, commit 82d6cb9; Matej 19. 10.: poznámka blokuje čas, ikona kalendáře → Kalendář, volné termíny dál v Termínech s odkazem. Přepínač Den / Týden přijde s K2) (`/dashboard/kalendar`, nová stránka; v menu ☰ „Termíny“ → „Kalendář“)
- Hlavička: dny v týdnu, Dnes, ‹ ›, přepínač Den / Týden; tlačítko „+“ (Bleskový termín / Poznámka / Blokovat čas).
- Filtr „Místo“: Všechna / každé vaše místo (adresa karet „u poskytovatele“) / Výjezdy (u zákazníka); legenda míst s barvou.
- Časová osa dne: rezervace (čas, iniciály, jméno, služba, místo, stav: Čeká na potvrzení / Potvrzeno / Probíhá /
  Přijde v… , Detail → objednávka), vypsané volné termíny, pauza / přesun (šedě, z pauzy za službou a rezervy na přejezd),
  blokace, poznámky.
- **Mezery** v otevírací době: „Volno 10:15–12:20 (2 h 5 min) → Vytvořit bleskový termín“ (⚡ s předvyplněným dnem,
  časem a kartami daného místa). Bez otevírací doby jen mezery mezi rezervacemi.
- Panel „Využijte volné místo“ (největší mezera dne) a „Přidat do kalendáře“.
- **Poznámka („ruční rezervace“)**: text + čas, zobrazí se v kalendáři a **blokuje čas** pro online rezervace.
  SQL: `provider_blocks.kind` ('block' | 'note'). Text v existujícím `reason`.
**K2 – Týden + ukázkový den** (HOTOVO 19. 10. 2026, nasazeno, commit 4f406f2; ukázka jen při prázdném týdnu): počítač 7 sloupců s bloky, mobil seznam po dnech; klik → den. Prázdný kalendář ukáže zašedlou ukázku.
**K3 – Přehled** (POSTAVENO 19. 10. 2026, build prošel, čeká na test a nasazení; „Zaplaceno přes Propojo“ místo „výdělek“, staré dlaždice pryč) (`/dashboard` pro poskytovatele): dnes (rezervace, čeká na potvrzení, největší volno + ⚡), tento týden,
  zaplaceno přes Propojo tento měsíc, poslední hodnocení.
**K4 – Měsíc + Den a Týden jako Apple Kalendář** (POSTAVENO 19. 10. 2026, build prošel, čeká na test a nasazení; mřížka hodin v Dni a Týdnu na počítači, Týden na mobilu seznam): mřížka s počtem rezervací a volna u dne, klik → den.

Každá fáze zvlášť: build → test → commit. Pobočky (Provider OS) se do filtru „Místo“ doplní později.
