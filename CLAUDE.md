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
- Vrstva 2 (rozpracovaná): Stripe Connect Standard + Direct Charges + manual capture, webhook z připojených účtů.
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

## Před ostrým spuštěním (vypnutím údržby)
- Hotové vrstvy 4 a 5 (refundy, no-show).
- Odsouhlasený pokyn providera k automatickým refundům (`booking_consents`) jako podmínka přijímání rezervací.
- Odstraněná brána předplatného.
- Sběr údajů pro DAC7.
- Finální VOP a Privacy Policy.
