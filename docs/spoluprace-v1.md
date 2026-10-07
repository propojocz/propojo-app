# Spolupráce V1 (PROVIDER_COLLABORATION_V1)

Zadání od Mateje 7. 10. 2026. Implementovat **po poptávkách** (část B po vrstvě 3). Záměrně velmi jednoduché –
nesmí z toho vzniknout „marketplace uvnitř marketplace“. Produktový název „Spolupráce“ (ne „Propojo Parťáci“;
„parťák“ jen v UX textech). Funguje napříč obory (účetní → účetní, fotograf → grafik, catering → cukrář).

## Princip
Bezplatná networkingová funkce mezi Poskytovateli. Poskytovatel jen vůči ostatním Poskytovatelům označí, zda je
otevřený B2B spolupráci; ostatní ho najdou a napíšou mu. Dál si vše řeší sami. Propojo neřeší dohodu, cenu,
fakturaci, realizaci ani odpovědnost. Nejde o rezervační model, pracovní portál ani předání zákaznické zakázky
(HANDOFF je POST_MVP a s touto funkcí nesouvisí).

## 1. Stav spolupráce (profil poskytovatele)
- `collaboration_status`: `NONE` (výchozí, nic automaticky nezapínat) / `OPEN` „Jsem otevřený spolupráci“ / `LOOKING` „Hledám parťáka“.
- `collaboration_note`: volitelná poznámka, max. ~250 znaků („Co hledáte / nabízíte?“, placeholder „Např. Jsem elektrikář a hledám obkladače pro občasnou spolupráci v okolí Vsetína.“). Není to pracovní inzerát.
- `collaboration_updated_at`.
- V1 bez tabulky „collaboration requests“.

## 2. Nastavení v profilu
Blok „Spolupráce s dalšími poskytovateli“, text „Dejte ostatním poskytovatelům vědět, jestli jste otevřený společným zakázkám nebo hledáte parťáka.“
Volby: Momentálně spolupráci nehledám / Jsem otevřený spolupráci / Aktivně hledám parťáka + poznámka.

## 3. Kdo to vidí
- Zákaznický marketplace se nemění; zákazník stav nevidí.
- Jen přihlášení (ověření) Poskytovatelé. Na profilu jiného Poskytovatele karta „Spolupráce“ (🟢 Jsem otevřený spolupráci / 🟠 Hledám parťáka) + poznámka + CTA „Napsat kvůli spolupráci“.

## 4. Stránka „Spolupráce“ (jen pro poskytovatele)
Podtitul „Najděte další poskytovatele, kteří jsou otevření spolupráci.“ Není to nástěnka inzerátů – jen jiný pohled
na existující profily (obor, lokalita, dojezd, hodnocení, ověření). Filtr: Všichni otevření spolupráci / Hledají parťáka /
Otevření spolupráci; výchozí OPEN + LOOKING. Karta: badge + jeden řádek poznámky, klik vede na standardní profil.

## 5. Chat
„Napsat kvůli spolupráci“ otevře běžný chat mezi dvěma Poskytovateli s kontextem `collaboration`. Úvod „Konverzace o spolupráci“,
volitelně předvyplněná první zpráva „Dobrý den, píšu Vám přes Propojo ohledně možné spolupráce.“ (upravitelná).

## 6. Co se NEDĚJE
Žádná Rezervace, PaymentIntent, Stripe operace, Rezervační smlouva, application fee, refund, no-show, check-in,
potvrzení spolupráce, předání zákazníka ani hodnocení B2B spolupráce.

## 7. Zákaznická data
Funkce nikdy automaticky neposílá jméno, telefon, e-mail ani adresu zákazníka, zadání, fotky ani data Rezervace.
Žádná automatická vazba rezervace → spolupráce.

## 8. Terminologie
Ano: Spolupráce, Hledám parťáka, Jsem otevřený spolupráci, Spolupráce s dalšími poskytovateli, Napsat kvůli spolupráci,
B2B spolupráce mezi poskytovateli. Ne: hledám zaměstnance/pracovníka, nabídka práce, brigáda, směna, mzda, uchazeč,
zaměstnavatel, pracovní místo.

## 9. Přístup
Jen mezi účty poskytovatelů (ideálně ověřenými). Ne zákazník → poskytovatel, ne sám sobě, ne suspendovaný účet
(u suspendovaného se stav veřejně nezobrazuje).

## 10. Řazení
Nesmí ovlivnit zákaznický ranking. Na stránce Spolupráce: LOOKING, pak OPEN, pak relevance oboru, vzdálenost,
aktivita profilu. Žádný složitý scoring.

## 11. Monetizace
V1 100 % zdarma – žádné fee, provize, předplatné, placené zvýraznění, kredity. Účel: síťový efekt a udržení poskytovatelů.

## 12. Notifikace
První zpráva: „Petr Novák Vám napsal ohledně spolupráce.“ Znovu použít stávající notifikace chatu.

## 13. Analytika (jednoduché události)
`collaboration_status_changed`, `collaboration_directory_opened`, `collaboration_filter_used`,
`collaboration_profile_opened`, `collaboration_chat_started` – cíl: kolik OPEN / LOOKING, kolik lidí stránku používá,
kolik chatů vzniká.

## 14. Prázdné stavy
- Nikdo: „Zatím tu nikoho vhodného nevidíme. Síť poskytovatelů postupně roste. Zkuste rozšířit oblast nebo se podívejte později.“
- Návštěvník bez zapnutého stavu: „Jste otevřený spolupráci? Dejte ostatním poskytovatelům vědět, že Vám mohou napsat.“ CTA „Nastavit spolupráci“.

## 15. Rozsah UI
Profil → nastavení stavu; profil poskytovatele → badge + poznámka + CTA; stránka Spolupráce → seznam + filtr; chat. Nic víc.

## Analýza repa (7. 10. 2026, Claude)
- **Reuse:** `profiles` (is_provider, ico_verified, is_suspended, city, address_lat/lng), veřejný profil `app/profil/[id]`,
  nastavení `app/dashboard/profil`, karty a obory (`services`), notifikace `createNotification`, chat `conversations` + `messages`
  (`lib/actions/conversation-chat.ts`, přístup přes service role po kontrole účastníků).
- **DB:** `profiles` + `collaboration_status` (check NONE/OPEN/LOOKING, default NONE), `collaboration_note` (≤ 250), `collaboration_updated_at`;
  `conversations` + `kind` ('request' / 'order' / 'collaboration'), `initiator_id`, `recipient_id` (dnes se účastníci odvozují
  z poptávky nebo objednávky); jednoduchá tabulka `analytics_events` (žádná analytika v repu zatím není).
- **Chat:** `loadConversation` rozšířit o kind = collaboration (účastníci initiator/recipient, oba poskytovatelé); stránka chatu
  pro spolupráci (bez vazby na objednávku); notifikace „… Vám napsal ohledně spolupráce“.
- **Bezpečnost:** nové sloupce v `profiles` nesmí jít číst zákazníkům – výpis jen přes server (service role) po ověření,
  že čtenář je ne-suspendovaný poskytovatel; zápis stavu jen vlastník přes server action.
- **Soubory:** profil (nastavení), `app/profil/[id]` (karta), nová `app/dashboard/spoluprace`, `lib/actions/collaboration.ts`,
  `conversation-chat.ts`, navigace dashboardu, SQL `docs/sql/spoluprace-v1.sql`.
- **Odhad:** střední (cca 1–2 pracovní bloky + test).
- **Konflikty:** žádný zásadní. Pozor jen na budoucí ikonu zpráv (část B) – collaboration chaty do ní mají patřit taky,
  proto stavět až po ní / společně.
