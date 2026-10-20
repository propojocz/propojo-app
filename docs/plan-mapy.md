# Mapy – plán fází (potvrzeno Matejem 20. 10. 2026)

Navazuje na analýzu z 18. 10. 2026: routing (silniční vzdálenosti, trasy) v aplikaci zatím není – všechno
vzdušnou čarou. Podklad Mapy.com (raster, bez úprav stylu, povinné logo a atribuce), vykreslení přes Leaflet,
vlastní špendlíky Propoja. Klíč `NEXT_PUBLIC_MAPY_API_KEY` je veřejný → v developer.mapy.com omezit na
doménu propojo.cz (+ localhost).

## M1 – společná mapa Propoja (základ)
- Komponenta `components/ui/PropojoMap.tsx`: víc špendlíků, automatické přiblížení na všechny (fitBounds),
  okénko po kliknutí (název + odkaz).
- Vlastní špendlíky v barvách rolí: oranžová = poskytovatel / provozovna, zelená = zákazník / místo zakázky,
  modrá = Propojo (obecné místo).
- Na mobilu se mapa nepřetahuje jedním prstem (stránka se dá rolovat), posun a přiblížení dvěma prsty.
- `ServiceMap` zůstává jako tenký obal (6 použití: detail karty, profil, detail rezervace ×2, shrnutí před
  platbou, chat poptávky). Adresa zákazníka v detailu rezervace má zelený špendlík.
- Bez SQL a bez nových služeb.

## M2 – vzdálenosti (vzdušnou čarou) – POSTAVENO 20. 10. 2026
- „X km od vás“ na kartách v marketplace a v pásech, řazení a filtr podle vzdálenosti.
- Výchozí bod: obec zadaná v hledání (souřadnice z tabulky `obce`), volitelně „Použít moji polohu“
  (souhlas prohlížeče, poloha se neukládá).
- Na kartě „vzdušnou čarou“, dokud nebude routing.
- Hotovo: „Obec · 2,4 km“ na kartách a v pásech, řazení „Nejblíž“, filtr do 5/10/25/50 km + „Jen kdo za mnou přijede“; „Použít moji polohu“ převádí polohu na obec přes Mapy.com v prohlížeči (k nám jde jen název obce).
- Hledání v okolí (20. 10. 2026): výchozí „V okolí“ = služba u poskytovatele do 15 km, výjezd podle dojezdu poskytovatele (bez dojezdu 25 km); dál do 5–50 km a Celá ČR.
- Části obcí a městské části (20. 10. 2026): `lib/data/casti-obci.ts` z RÚIAN (ČÚZK, adresní místa, licence CC BY 4.0 – zdroj uvádět).
  Přegenerování (jednou za čas, třeba ročně): stáhnout `https://vdp.cuzk.gov.cz/vymenny_format/csv/<RRRRMMDD>_OB_ADR_csv.zip` (poslední den měsíce),
  vypsat tabulku `obce` do JSON (obec, okres, latitude, longitude), pak `python -I scripts/ruian/casti.py adr.zip obce.json casti.json`
  a `python -I scripts/ruian/gen-ts.py casti.json lib/data/casti-obci.ts`. Kontrola: medián odchylky středu obce od tabulky `obce` ~0,25 km.

## M3 – mapa výsledků
- Přepínač Seznam / Mapa v marketplace: špendlíky karet z výsledků, po kliknutí malá karta.
- Volitelně mapa poptávek pro poskytovatele – jen obce, ne přesné adresy zákazníků (AK bod 8).
- Před spuštěním ověřit limit kreditů Mapy.com (mapa výsledků načítá víc dlaždic).

## Mimo fáze (potřebuje routing)
Plánování tras, silniční vzdálenosti, doprava „X Kč/km“ u výjezdu (vrstva 6).
