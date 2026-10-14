# PROVIDER_OS_TEAMS_LOCATIONS_V1 – audit repa a návrh (14. 10. 2026)

Stav: AUDIT + NÁVRH. Nic se zatím neimplementuje – podle CLAUDE.md nejdřív schválení plánu a níže jsou
tři rozhodnutí označená ARCHITECTURE_DECISION_NEEDED.

Princip: **Complex engine, simple surface.** Recepční řídí provoz, pracovník ví kde/kdy/koho, zákazník ví kde/kdy/kdo.

---

## 1. Co existuje a lze použít

| Co | Kde | Využití |
|---|---|---|
| Účet poskytovatele = právní Poskytovatel (IČO, Stripe Standard účet, provize) | `profiles` (is_provider, ico), `stripe_accounts.provider_id` | = **Organization** (právní Poskytovatel). Platby zůstávají beze změny. |
| Karty nabídek s adresou, dosahem a ceníkem | `services`, `service_items` | Karta = služba na konkrétní pobočce (V1: jedna karta = jedna Location). |
| Otevírací doba po kartách | `service_hours` (`lib/actions/service-hours.ts`) | Výchozí provozní doba pobočky. |
| Volná okna a jejich služby / položky | `availability_slots`, `slot_services` (+ `item_ids` od 13. 10.) | Zůstává pro vypisování termínů. |
| Blokace (dovolená, doktor) | `provider_blocks` | Rozšířit o pracovníka (absence). |
| Výpočet volných časů a kolize | `lib/actions/free-times.ts`, `reserve-time.ts`, `slots.ts`, `deposit.ts` | Místo, kam se přidá kapacita / pracovník. |
| „Tuto kartu obsluhuje někdo jiný“ | `services.separate_calendar` | Dnešní provizorium pro „kolegu“ – Provider OS ho nahradí čistě. |
| Denní rozvrh poskytovatele, přehled Termínů, panel nadcházejících | `lib/actions/day-schedule.ts`, `app/dashboard/terminy`, `UpcomingDrawer` | Základ pro „Dnes“ pracovníka. |
| Audit log objednávky | `order_events` | Sem `booking_staff_reassigned`. |
| Oznámení, push, e-mail | `createNotification`, `push.ts`, `lib/email` | Oznámení pracovníkům a recepci. |
| Cron každých 5 min | `/api/cron/booking-tick` | Připomínky, expirace žádostí o změnu pracovníka. |

**Co NEPOUŽÍT:**
- **Značka** (`brands`, `brand_members`, `lib/actions/brands.ts`) = víc **samostatných** poskytovatelů (každý vlastní karta, Stripe, IČO) pod jedním jménem. To je bod C) „Independent provider“, ne tým jedné firmy. Míchat ji s Organization by smazalo hranici, kterou právnička drží (HANDOFF).
- **Přihrávání** (`lib/actions/handoffs.ts`) mění `provider_id` objednávky = předání mezi samostatnými poskytovateli. Legacy, model §20: nepoužívat ani neobnovovat. Interní přeřazení pracovníka s ním nesmí sdílet kód.
- **Spolupráce V1** (`docs/spoluprace-v1.md`) je networking mezi samostatnými poskytovateli – jiná doména.

## 2. Jak repo dnes chápe účet poskytovatele
`profiles.id` je zároveň člověk (přihlášení), podnikatel (IČO) i kalendář. `orders.provider_id` = tento profil,
Stripe účet patří jemu. Jeden poskytovatel = jeden člověk = jeden společný kalendář; jedinou výjimkou je karta se
`separate_calendar` (kolize jen v rámci té karty).

## 3. Jak dnes funguje dostupnost / kalendář / rezervace
- Volné časy = otevírací doba karty (`service_hours`) + vypsaná okna (`availability_slots`) − rezervace poskytovatele
  (`orders` se `scheduled_at/end`, s pauzou za službou) − blokace (`provider_blocks`).
- Kolize se hlídá **v kódu** (dotaz → kontrola → insert) ve 4 místech, **ne v databázi**. Dvě současné rezervace
  stejného času proto teoreticky můžou projít obě (race condition) – dnes to tlumí jen zámek okna (`slot-claim`)
  a krátký `hold_expires_at`.
- Stav rezervace a peněz: `orders.booking_state` + `lib/booking/state.ts` (předautorizace → potvrzení → capture).

## 4. Máme Organization / team model?
**Ne.** Existuje jen Značka (samostatní poskytovatelé, viz výše) a `separate_calendar` u karty.

## 5. Předpokládá schéma 1 provider = 1 člověk?
**Ano**, ve třech místech:
1. **Kolize:** všechny rezervace poskytovatele se navzájem vylučují → salon s 8 barbery by měl kapacitu 1 člověka.
2. **Přihlášení:** do účtu se přihlašuje jen majitel; recepční ani pracovník nemají vlastní přístup.
3. **Pobočka:** adresa je u karty, ne samostatná entita; nejde říct „Petr dnes na pobočce Valmez“.

## 6. Co změnit v DB (vše aditivně, nové tabulky + pár nullable sloupců)
```
org_members        (id, org_id → profiles.id, user_id → profiles.id NULL, display_name, role OWNER|RECEPTIONIST|STAFF,
                    status, created_at)            -- pracovník může být i bez vlastního účtu (jen jméno)
org_locations      (id, org_id, name, address, lat, lng, capacity NULL, is_active)
org_resources      (id, location_id, name, kind, is_active)          -- V1 jen datově (křeslo, box, zvedák)
staff_shifts       (id, org_id, member_id, location_id, starts_at, ends_at, version, created_by, updated_at)
                    EXCLUDE USING gist (member_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
booking_assignments(order_id PK, org_id, member_id, location_id, resource_id NULL, starts_at, ends_at,
                    pending_member_id NULL, pending_reason, version, updated_at)
                    EXCLUDE USING gist (member_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
                      WHERE (aktivní rezervace)
services           + location_id NULL, + staff_selection_mode ('any_available' výchozí | 'specific_preferred' | 'specific_required')
provider_blocks    + member_id NULL   -- absence konkrétního pracovníka
```
- `org_id` = `profiles.id` právního Poskytovatele (žádná nová „firma“ vedle Stripe účtu → platby se nemění).
- **Kolize v databázi** přes `EXCLUDE` (rozšíření `btree_gist`): jeden pracovník nemůže mít dvě směny ani dvě
  rezervace naráz – ani při dvou současných akcích recepčních. Tohle je hlavní pojistka spolehlivosti.
- Přiřazení pracovníka je v **samostatné tabulce**, ne v `orders` – nesahá na `booking_state`, platby ani legacy
  zrcadlo a kolizní pravidlo se nedotkne starých objednávek.

## 7. Práva (RLS / přístup)
- Nové tabulky zamčené RLS (jako dnes), čtení i zápis jen přes server actions se service role.
- Jedna centrální kontrola `lib/org/access.ts`: `requireOrgRole(orgId, ['OWNER','RECEPTIONIST'])` / `requireMember`.
  - OWNER: vše. RECEPTIONIST: kalendáře povolených poboček, směny, přesuny, přeřazení. STAFF: jen vlastní směny
    a vlastní rezervace (čas, jméno zákazníka, služba, délka, poznámka) + akce Hotovo / Nedorazil / Poznámka.
- **Least privilege:** pracovník nikdy nedostane Stripe údaje, platby, IP z rekapitulace, logy, e-mail ani telefon
  zákazníka (jen pokud je potřeba k obsluze – rozhodne OWNER). Data se pro něj skládají zvláštním dotazem, ne
  ořezáním „velkého“ objektu v UI.

## 8. Dopad na booking state machine
**Žádný.** `booking_state`, předautorizace, capture, provize a refundy zůstávají. Přiřazení pracovníka je metadata
vedle objednávky (`booking_assignments`). Změna pracovníka nevytváří platbu, refund ani provizi.
Žádost o souhlas zákazníka se změnou pracovníka je **samostatný malý stav** (`pending_member_id`), ne nový
`booking_state`.

## 9. Dopad na současné UI
- Zákazník: u karty s `specific_*` výběr pracovníka (V2); ve V1 (`any_available`) se nic nemění, jen v potvrzení
  „Obslouží vás: Petr“.
- Poskytovatel bez týmu: **nic se nemění** (vše za přepínačem „Tým a pobočky“).
- Nové obrazovky: `/dashboard/tym` (lidé, role, pobočky), `/dashboard/plan` (týdenní plán), `/dashboard/kalendar`
  (víc poboček vedle sebe), `/dnes` (pracovník).

## 10. Kalendář více poboček (recepce, desktop)
- Jedna stránka, sloupce = pobočky × pracovníci na směně, řádky = čas (sdílená svislá osa, jeden scroll).
- Data: jeden server dotaz na den/týden (směny + přiřazené rezervace + volná okna), ne dotaz na pobočku.
- Interakce: klik → popover (detail, přesun, přeřadit, poznámka); drag & drop přesunu/přeřazení až s potvrzením ze
  serveru (optimistický náhled + návrat při konfliktu). Filtr pracovníků a poboček, klávesové zkratky (šipky, Esc).
- Mobil: přepínání pobočky.

## 11. Týdenní plán týmu
- Tabulka pracovník × den, buňka = pobočka a čas. Drag & drop pracovníka do dne/pobočky = změna `staff_shifts`.
- Server při změně zkontroluje: překryv směn (DB EXCLUDE), kapacitu pobočky, a **rezervace, které by změnou
  zůstaly bez pracovníka** → nezmění potichu, vrátí seznam konfliktů a recepční rozhodne (přeřadit / ponechat).
- Kopírovat týden / šablony směn = V2.

## 12. Interní přeřazení pracovníka
- `reassignBooking(orderId, toMemberId, reason?)` → kontrola role, stejného `org_id`, směny a kolize (DB) →
  `any_available`: hned; `specific_preferred`: hned + oznámení zákazníkovi; `specific_required`: `pending_member_id`
  + žádost zákazníkovi „Potvrdit změnu / Chci jiný termín“, původní pracovník zůstává do potvrzení.
- `order_events`: `booking_staff_reassigned` {from, to, actor, reason} – a `…_requested/confirmed/declined`.
- Nikdy nemění `orders.provider_id`, Stripe ani provizi (proto žádný kód z `handoffs.ts`).

## 13. Race conditions a spolehlivost
| Riziko | Dnes | Návrh |
|---|---|---|
| Dvě rezervace stejného pracovníka naráz | kontrola v kódu | `EXCLUDE` v DB + čitelná hláška |
| Dvě recepční upravují stejnou směnu | – | sloupec `version` (optimistic locking), zápis jen při shodě |
| Opakované kliknutí / retry | částečně (idempotency u Stripe) | idempotency key u zápisů směn a přeřazení |
| Zákaznická rezervace vs. změna směny | – | změna směny ověří přiřazené rezervace ve stejné transakci (RPC funkce v Postgresu) |
| Kapacita pobočky | – | V1 `capacity` = max. souběžných směn; kontrola v RPC; V2 zdroje (křesla) |
| Výpadek | – | V1 graceful error UI + žádná ztráta dat; V2 offline „Dnes“ z cache |
| Monitoring | Vercel logy | error tracking (Sentry) pro kritické akce kalendáře – rozhodnutí o službě |

Kritické zápisy (směna, přeřazení) jako **Postgres funkce (RPC)** v jedné transakci – kontrola i zápis naráz.

## 14. Minimální rozumné V1
Organization = účet poskytovatele · pobočky · pracovníci (s účtem i bez) · role OWNER / RECEPTIONIST / STAFF ·
týdenní plán směn · kalendář více poboček (čtení + přeřazení, přesun termínu přes existující tok) · „Dnes“ pro
pracovníka (Hotovo / Nedorazil / Poznámka) · přeřazení pracovníka s auditem · kolize v DB · kapacita pobočky
jako číslo. Zákaznická rezervace v režimu `any_available` s automatickým přiřazením volného pracovníka na směně.

## 15. Do V2 / PRO
Výběr konkrétního pracovníka zákazníkem a souhlas se změnou (`specific_*`) · zdroje / křesla · šablony a kopírování
týdne · dovolené a absence v plánu · offline „Dnes“ · statistiky (vytížení, no-show, tržby po pobočkách) ·
mzdy / docházka.

## 16. Odhad náročnosti
Velký celek: zhruba **6 fází**, každá 1–2 pracovní bloky + test. Nejrizikovější je fáze 3 (dostupnost pro zákazníky
s kapacitou) – mění výpočet volných časů, který dnes počítá s jedním člověkem.

## 17. Soubory / moduly
Nové: `lib/org/` (access, shifts, assignments, availability), `app/dashboard/tym`, `app/dashboard/plan`,
`app/dashboard/kalendar`, `app/dnes`, SQL `docs/sql/provider-os-v1.sql`.
Úpravy: `free-times.ts`, `reserve-time.ts`, `slots.ts`, `deposit.ts` (kolize podle pracovníka / kapacity),
`lib/booking/payments.ts` (po autorizaci přiřadit pracovníka), `day-schedule.ts`, menu ☰, oznámení.
Beze změny: `lib/booking/state.ts`, `commission.ts`, `rules.ts`, Stripe webhooky, refundy.

## 18. Migrační rizika pro stávající poskytovatele
- Nízká, pokud vše platí jen pro účty se zapnutým „Tým a pobočky“; ostatní jedou přesně jako dnes.
- `EXCLUDE` jen na nových tabulkách → staré objednávky se nekontrolují zpětně.
- `separate_calendar` zůstává funkční; pro týmy ho nahradí směny (bez mazání).
- Stávající Značky se nemění.

---

## ARCHITECTURE_DECISION_NEEDED

**ADN-1 – Jak zákazník rezervuje u firmy s týmem (V1).**
Doporučení: `any_available` – zákazník rezervuje pobočku a službu, volný čas = alespoň jeden pracovník na směně
bez kolize (a pod kapacitou), pracovník se přiřadí automaticky po zaplacení. Výběr konkrétního pracovníka až V2.
Alternativa: výběr pracovníka hned ve V1 (víc práce v marketplace a kartě).

**ADN-2 – Pracovník bez vlastního účtu?**
Doporučení: ano – pracovník může být jen jméno (recepce za něj vše zadá); pozvánka do aplikace (účet, „Dnes“)
volitelně. Snižuje odpor („barber nechce administrativu“) a nevyžaduje registraci každého člověka.

**ADN-3 – Jedna karta = jedna pobočka?**
Doporučení pro V1: ano (firma se 2 pobočkami má karty pro každou pobočku; ceník lze kopírovat). Karta sdílená
více pobočkami s výběrem pobočky v rezervaci = V2.

## LEGAL_REVIEW_NEEDED
- Souhlas zákazníka se změnou konkrétního pracovníka (`specific_required`) a co přesně je „interní zdroj“.
- Viditelnost údajů zákazníka jednotlivým pracovníkům a recepci (Poskytovatel = správce, pracovníci = jeho lidé;
  Zásady musí uvést, že údaje vidí i personál Poskytovatele v nutném rozsahu).
- Role v Organization a jejich přístup k osobním údajům (recepční jako zpracovatelská role Poskytovatele).

## Implementační plán po fázích (po schválení a rozhodnutí ADN)
1. **SQL + přístup:** tabulky, `btree_gist`, `EXCLUDE`, RPC funkce pro směny a přiřazení; `lib/org/access.ts`;
   přepínač „Tým a pobočky“; správa lidí, rolí a poboček (`/dashboard/tym`).
2. **Týdenní plán směn** (`/dashboard/plan`) s kontrolou kolizí, kapacity a dotčených rezervací.
3. **Dostupnost pro zákazníky** (ADN-1): volné časy z kapacity směn, automatické přiřazení po autorizaci
   v `handleAuthorized` (bez změny plateb).
4. **Kalendář více poboček** pro recepci + přeřazení pracovníka s auditem.
5. **„Dnes“ pro pracovníka** (Hotovo / Nedorazil / Poznámka) + oznámení (změna směny, nová rezervace).
6. **Spolehlivost:** error tracking, idempotence, testy souběhu, graceful error UI.
