# Propojo — instrukce pro Claude Code

Propojo.cz = hyperlokální marketplace služeb („Uber pro řemeslníky“). Repo `propojocz/propojo-app`, lokální složka `zivnotrh`.
Stack: Next.js 14 (App Router) + Supabase + Stripe Connect, hosting Vercel (projekt `propojo-app`).
`git push` na `main` = produkční nasazení na www.propojo.cz (web je zatím v režimu údržby).

Závazný obchodní a rezervační model: @docs/model-v2.md
Má přednost před starší logikou v kódu i v komentářích. Při rozporu upozorni, neopravuj potichu.
Právní a produktová rozhodnutí se dělají mimo repo (claude.ai projekt Propojo.cz); do repa se promítají úpravou `docs/model-v2.md`.

## Kdo s tebou pracuje
- Matej, solo founder, není programátor. Testuje přes `npm run dev`, nasazuje `git push`.
- Komunikace česky, stručně a přímo, bez vaty. Upřímná analýza, ne lichotky.
- Věci dělej, nenavrhuj donekonečna. Co už bylo odsouhlaseno, znovu se neptej.

## Pracovní postup
- Malé vrstvy: jedna změna → `npm run build` → Matej otestuje → commit → další.
- Před každou významnou změnou nejdřív plán: které soubory / tabulky / endpointy měníš a proč. Editovat až po schválení.
- `npm run build` musí před commitem projít bez chyb.
- Po dokončeném kroku navrhni název commitu (krátký, bez diakritiky).
- Příkazy do terminálu vždy JEDNOŘÁDKOVÉ – víceřádkové příkazy Mateje zaseknou.
- Refaktor na model v2 ve větvi `model-v2`; na `main` se merguje až hotová a otestovaná vrstva.
- Nevymýšlej nový business model a nevracej staré varianty, pokud nenarazíš na skutečnou technickou překážku.

## Databáze (Supabase)
- VŽDY jen projekt `svtrlztjlxxjrbncukmp`. NIKDY `eazhybpfxghxpxfxkxte` ani `fruqnehkfudsfjicwlla`.
- Migrace čistě aditivní: `add column if not exists`, žádný `drop`. Legacy sloupce nechat, jen do nich přestat zapisovat.
- Před psaním migrace ověř skutečné schéma, nepiš podle paměti.
- SQL editor Supabase běží jako jedna transakce – chyba na konci vrátí celý skript. Rizikové kroky (unikátní indexy) dávej zvlášť.
- SQL spouští Matej, pokud výslovně neřekne jinak.
- RLS na nových tabulkách zamčená; čtení/zápis přes service role v server actions po kontrole vlastnictví v kódu.
- Doby uložení osobních údajů nedávej napevno (řeší se v Privacy Policy).

## Peníze a Stripe
- Connect Standard + Direct Charges + manual capture; application fee = provize. Žádné transfers, žádné držení peněz.
- Pravidla peněz (stavy, lhůty, provize, refundy, check-in) patří jen do `lib/booking/`, ne do komponent.
- Stav plateb a refundů jen podle Stripe webhooků, včetně událostí z připojených účtů.
- Automatický refund z účtu providera jen ve spouštěčích z `lib/booking/rules.ts` a jen v rozsahu pokynu, který provider odsouhlasil.
- Stripe se testuje v Test mode hlavního účtu Propojo (klíče `sk_test_…`), ne v sandboxu. Webhooky na localhost jen přes Stripe CLI (`stripe listen`), jinak chodí jen na propojo.cz.

## UI a texty
- Veškeré UI česky, formálně (vykání).
- Nepoužívat „záloha“ tam, kde jde o Rezervační poplatek nebo Cenu výjezdu.
- Design: nadpisy Poppins, text DM Sans, primární emerald `#10b981`, pastelová pozadí (syté barvy jen v logu).
- Barvy rolí: zelená = zákazník, modrá = Propojo, oranžová = poskytovatel.
- Časy vždy přes `lib/format.ts` (Europe/Prague natvrdo; server na Vercelu běží v UTC a `TZ` nastavit nejde).

## Známé pasti
- Dva soubory `OrderStatusButton.tsx`: používá se `app/dashboard/objednavky/OrderStatusButton.tsx`, ne `components/ui/`.
- Formulář nabídky je `app/pridat-sluzbu/page.tsx`.
- Soubory mají konce řádků CRLF.
- Když se změna neprojeví: zastavit dev, smazat `.next`, spustit znovu.
- `types/database.ts` zaostává za DB (hlavně `orders`) – při práci doplňovat.
- `npm audit fix --force` NEDĚLAT (nainstaluje Next 16 s breaking změnami).
- Env proměnné ve Vercelu se zapékají při buildu → po změně redeploy.
- Vercel Hobby spouští cron jen 1× denně → lhůty rezervací poběží přes Supabase pg_cron + pg_net.

## Stav refaktoru
- Vrstva 1: `lib/booking/` (policy, commission, state, rules) + `docs/sql/rezervace-vrstva1.sql` – hotové, SQL spuštěno v Supabase 25. 9. 2026. Kód zatím nepřipojený.
- Vrstva 2: Stripe Connect Standard + Direct Charges + manual capture, webhook z připojených účtů, okno příjezdu u výjezdu, domluvený termín, zrušení před platbou, povinná adresa u výjezdu – hotové a ručně otestované 28. 9. – 1. 10. 2026 (Test mode). Potvrzení zatím jen ve Stripe Dashboardu.
- Vrstva 3a (potvrzení / odmítnutí, zrušení před potvrzením, ověření platby po návratu ze Stripe) – hotové a otestované 2. 10. 2026. 3b a 3g hotové a otestované, commit 780d6e1 (5. 10. 2026).
- Vrstva 3c (hotové a otestované 6. 10. 2026 – testy 19 a 20A; ruční potvrzení z otevírací doby neověřeno, testovací karta otevírací dobu nemá): `/api/cron/booking-tick` + `lib/booking/deadlines.ts` – propadnutí nepotvrzených po lhůtě, připomínka poskytovateli (12 h před koncem, ne dřív než 2 h po platbě), uvolnění zámků a záchrana plateb každých 5 min; štítky v Termínech podle stavu objednávky; pauza za službou (`service_items.buffer_minutes`) v editoru a při rezervaci z vypsaného okna. Rychlé vypsání volného termínu (⚡) v kalendářovém panelu u zvonečku (`QuickSlotForm`). Texty o vrácení poplatku zpřesněné. Automatické potvrzení termínu nabídnutého poskytovatelem (vypsané okno, návrh) a ruční potvrzení nejpozději 2 h před začátkem (`isProviderOfferedTime`, `confirmationDeadline`, policy `2026-10-06-v3`, shrnutí `recap-2026-10-06-v6`). Jméno poskytovatele je klikací na profil (`ProfileNameLink`).
  Při sloučení do `main` spustit `docs/sql/cron-lhuty.sql` (pg_cron + pg_net + Vault).
- Vrstva 3d (7. 10. 2026, přepracováno podle Mateje, čeká na test): odpověď na veřejnou poptávku = nabídka – poskytovatel zvolí typ (A služba / B výjezd), částku placenou přes Propojo (min. 200 Kč), nezávazný odhad ceny a zprávu (`request_responses.offer_kind`, `charge_halere`, SQL `docs/sql/poptavka-nabidka.sql`). Po výběru vznikne objednávka bez položky z ceníku s `orders.offer_kind` + `agreed_charge_halere`; platba, shrnutí i návrh termínu s tím počítají (u služby poskytovatel zadá délku). Obec poptávky povinně se souřadnicemi. Zákazník vidí radu „sbírejte nabídky do …, výběrem se ostatní uzavřou“. Pojistka: automatické potvrzení jen u adresy do ~15 km od obce v objednávce nebo v dosahu karty (`shouldAutoConfirm`, `lib/geo.ts`), jinak ruční. Ikona ⚡ samostatně v horní liště. Termín jde navrhnout už v chatu jednání (`proposeTermInChat`, zpráva s payloadem `term_proposal`); zákazník tlačítkem „Vybrat a rezervovat“ vybere poskytovatele i termín najednou (`selectProviderWithTerm` → objednávka s návrhem → shrnutí a platba). Nabídka ukazuje i započtení (`offerSummary`, `request_responses.quote_fee_deductible`).
- Po vrstvě 3 (schváleno 7. 10. 2026): chytřejší vyhledávání (bez diakritiky, kořen slova, slovník příbuzných slov), poptávky pro poskytovatele podle vzdálenosti s filtrem, „Obnovit poptávku“ v historii zákazníka, ikona zpráv v horní liště s přehledem všech chatů. Potom „Spolupráce V1“ (`docs/spoluprace-v1.md`).
- Nápady na rozvoj: `docs/IDEAS_BACKLOG.md` – nápad se tam nejdřív zapíše, neimplementuje se automaticky.
- Mimo dosah a cena dohodou (4. 10. 2026): poptávku mimo dosah lze poslat, poskytovatel jen vidí vzdálenost a rozhodne sám. Přímá rezervace času mimo dosah zůstává blokovaná. Poskytovatel může u návrhu termínu upravit Rezervační poplatek / Cenu výjezdu (A, B; 200–20 000 Kč), zákazník ji potvrdí s termínem. SQL `docs/sql/rezervace-cena-dohodou.sql` (`order_time_proposals.charge_halere`, `price_note`, `orders.agreed_charge_halere`).
- Započtení Ceny výjezdu volbou poskytovatele + provize s přirážkou 2 % nad 3 000 Kč (4. 10. 2026, policy `2026-10-04-v2`, shrnutí `recap-2026-10-04-v4`). SQL `docs/sql/rezervace-zapocteni-vyjezdu.sql`.
- Vrstva 3 (zbytek): 3a tlačítka Potvrdit / Odmítnout pro providera + zrušení zákazníkem před potvrzením; 3b krokový průvodce před platbou (termín → adresa předvyplněná a potvrzená → rekapitulace s kontaktem a souhlasem → platba); 3g nadcházející potvrzené rezervace: provider výsuvný přehled + přidání do kalendáře, zákazník lišta „Dorazte …“ + přidání do kalendáře (jen `booking_state = confirmed`).
- Do `main` až s hotovou vrstvou 3, která musí obsahovat:
  - UI potvrzení/odmítnutí providerem + hlídání 48h lhůty,
  - zákazník nikde (seznam objednávek, e-maily, notifikace) nevidí Přijato/Potvrzeno před úspěšným capture – vše se řídí `booking_state`,
  - rekapitulaci před platbou s telefonem a e-mailem poskytovatele (model §15) a výslovnou žádost zákazníka o plnění před uplynutím lhůty pro odstoupení uloženou do `booking_consents` (model §17),
  - objednávku z veřejné poptávky (`selectProvider`, dnes vzniká bez `service_item_id`, a proto ve v2 nejde zaplatit):
    - konkrétní položku (Nabídku) vybírá poskytovatel při návrhu termínu; pole je povinné a nabízí jen jeho aktivní položky typu A nebo B s platbou aspoň 200 Kč,
    - u navrženého termínu zákazník vidí název položky a Rezervační poplatek / Cenu výjezdu,
    - po přijetí termínu se položka zapíše do objednávky a dál jde standardní cesta v2,
    - Model C z poptávky ne, jen přes stránku výrobku s individuálním zadáním,
    - délka navrženého termínu se řídí položkou, ne pevnými 60 minutami; když položka délku nemá, navrhnout řešení v plánu vrstvy 3,
  - kratší Stripe onboarding: při zakládání Standard účtu předvyplnit e-mail, telefon, IČO, název a adresu z ARES, odvětví (MCC) podle kategorie nabídky, web = veřejný profil na Propojo, popis podnikání z nabídky. Nejdřív ověřit v dokumentaci Stripe, co jde u Standard účtu předvyplnit.
- Pořadí vrstev, technické korekce a parametry k potvrzení: konec `docs/model-v2.md`.
- Co je právně potvrzené a co čeká na právničku: `docs/model-v2.md` §20. U OPEN – LEGAL držet hodnoty jako parametry v `lib/booking/policy.ts`.

## Poznámky pro další vrstvy
- Otevřené rozhodnutí (2. 10. 2026, mimo model v2 – nevymýšlet bez rozhodnutí Mateje a právničky):
  - Tým / pracovníci: provider chce přijmout souběžnou zakázku, protože ji udělá kolega („mám na to pracovníka“). Dnes kolize hlídá společný kalendář, výjimkou je jen nastavení „samostatný kalendář“ u nabídky.
  - Předání zakázky kolegovi (HANDOFF-001): MIMO MVP podle právničky (2. 10. 2026) – vrátit se až po stabilizaci transakčního modelu, model §20.
  - Sdílení potvrzené zakázky s kolegou / známým: předání údajů zákazníka třetí osobě = GDPR (právní titul, Privacy Policy). Varianta od Mateje: provider pošle kolegovi odkaz na Propojo, kolega musí projít aspoň registrací e-mailem, teprve pak zakázku uvidí (růst platformy + kolega přijme podmínky Propoja). Ani registrace ale nenahrazuje právní titul k předání údajů.
  - Pro kolegu na celou kartu už existuje přepínač „Tuto kartu obsluhuje někdo jiný“ (`services.separate_calendar`, stránka dostupnosti karty).
- Drobnost: rezervace z vypsaného okna (`slots.ts`) kontroluje kolize přes celý kalendář providera, „samostatný kalendář“ nerespektuje.
- Vyřešeno 5. 10. 2026: položky bez `offer_kind` vznikaly proto, že editor typ nenastavoval (doplnil se jen jednorázově SQL 25. 9.). Teď ho `service-items.ts` odvozuje při každém uložení (B výjezd, C výrobek na zakázku, A služba). U služby editor nabízí jen Rezervační poplatek; poplatek za nedostavení a volby „celá cena“ / „nic“ zmizely (model §18, VOP 11.3 – při nedostavení se poplatek nevrací).
- Vrstva 6 (Model B), editor položky:
  - u položky B nenabízet Rezervační zálohu; jediná platba je Cena výjezdu (`quote_fee`), a ta má být v editoru první a jasně pojmenovaná,
  - lhůta „Nabídku dodám do“ musí mít i volbu „ihned na místě“,
  - Doprava (rozhodnuto 28. 9. 2026, obě varianty v MVP): buď zahrnutá v Ceně výjezdu, nebo připočtená podle silniční vzdálenosti z adresy nabídky k zákazníkovi (Mapy.cz). Provider zadá „zdarma do X km, pak Y Kč za každý další km“. Výpočet na serveru z přesné adresy (korekce 5), zahrnutý do předautorizované Ceny výjezdu; zákazník před platbou vidí rozpad Cena výjezdu + doprava = celkem. Po předautorizaci se výpočet nemění. Ve vrstvě 2 jsou Kč/km jen skryté – nemazat.
  - Započtení Ceny výjezdu do následné zakázky volí poskytovatel u položky (`service_items.quote_fee_deductible`, hotovo 4. 10. 2026, VOP 11.6).
  - Stav „Zákazník nezastižen“: jen po validním check-inu, alespoň jeden pokus o kontakt, jednotná čekací doba 15 min (nenastavitelná providerem); Cena výjezdu včetně dopravy se pak nevrací (model §20).

## Před ostrým spuštěním (vypnutím údržby)
- Hotové vrstvy 4 a 5 (refundy, no-show).
- Odsouhlasený pokyn providera k automatickým refundům (`booking_consents`) jako podmínka přijímání rezervací.
- Odstraněná brána předplatného.
- Sběr údajů pro DAC7.
- Finální VOP a Privacy Policy.
- Z pracovních VOP v4.1 (3. 10. 2026), zatím neimplementováno:
  - potvrzení potvrzené Rezervace e-mailem (trvalý nosič) s údaji poskytovatele, předmětem, termínem, poplatkem a poučením (čl. 8.3),
  - odstoupení od Rezervační smlouvy funkcí v aplikaci + potvrzení e-mailem s datem a časem (čl. 9.1; tabulka `withdrawals` existuje),
  - souhlas zákazníka s poskytnutím údajů k Hlavní smlouvě v textové podobě už při odeslání Rezervace (čl. 10.4),
  - Ceník, FAQ a registrace (`app/cenik`, `app/faq`, `app/prihlasit`, `app/pridat-sluzbu`) ještě popisují předplatné a 0 % provize – přepsat na provizi 10 % (min. 29, max. 89 Kč) + 2 % z části platby nad 3 000 Kč.
- Z kontroly VOP v4.1 a GDPR (6. 10. 2026) – doplnit do VOP / Zásad, nic se nemusí přestavovat:
  - automatické potvrzení termínu vypsaného / navrženého poskytovatelem: VOP 7.5, 7.7, 8.1, 8.2 počítají se samostatným potvrzením a s odvoláním Rezervace do potvrzení – doplnit „potvrzení předem“,
  - cena upravená poskytovatelem u konkrétní objednávky: VOP 7.4 „uvedena u každé Nabídky“ → doplnit „nebo v návrhu termínu“; lhůta 2 h před začátkem je přísnější než 8.1 (jen upravit text),
  - veřejná poptávka ve VOP chybí úplně (kdo vidí zadání, výběr poskytovatele, potvrzení návrhu = odeslání Rezervace),
  - Zásady ochrany osobních údajů na webu jsou stará verze: chybí poskytovatel jako samostatný správce (VOP 15.2), Stripe, veřejné poptávky a chat, evidence shrnutí s IP adresou a prohlížečem (`recap_accepted`), poloha při check-inu, přenos do USA; napevno slibují smazání do 30 dnů (rozpor s §17 – doby určí právnička),
  - formulář poptávky sbírá telefon, který se nikde nepoužívá (minimalizace) – rozhodnout: používat, nebo přestat sbírat.
  - pracovní návrh Zásad od Mateje (6. 10. 2026) to částečně řeší; zbývá: „záloha“ → Rezervační poplatek / Cena výjezdu, poskytovatel jako samostatný správce a příjemce údajů, role Stripe u Direct Charges (platba jde na účet poskytovatele), evidence podle VOP 15.1 (shrnutí s IP a prohlížečem, souhlasy, check-in a poloha, no-show, refundy, doklady nabídek), push notifikace, hodnocení (VOP 15.3), automatické refundy (čl. 22 GDPR?), region Supabase, text o poptávkách („kontakt, který zákazník zveřejní“ – kontakt se nezveřejňuje).
- Otázka pro právničku (3. 10. 2026): shrnutí před platbou je minimalistické – viditelná je jedna věta o platbě, započtení/vrácení a pravidla zrušení jsou pod ⓘ. Stačí to pro VOP čl. 7.8 („bezprostředně před ovládacím prvkem“)?
- Otázka pro právničku (3. 10. 2026): smí poskytovatel nastavit Rezervační poplatek ve výši celé ceny služby („jako Reservio“)? VOP 7.4/7.6 a model §3, §18 s tím nepočítají; provize je max. 89 Kč, nad 3 000 Kč navíc 2 % z přesahu.
