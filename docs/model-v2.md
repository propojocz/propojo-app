# Propojo – model v2 (source of truth pro vývoj)

Stav k 25. 9. 2026. Právní konstrukce konzultována s právničkou.
Má přednost před starší logikou v kódu. Nový business model nevymýšlet, staré varianty nevracet, pokud nenastane skutečná technická překážka.

## 1. Základ platformy
Propojo je marketplace/zprostředkovatel. Propojo:
- není stranou Hlavní smlouvy,
- neposkytuje samotnou službu,
- nedrží zákaznické peníze,
- nerozhoduje spory zákazník/provider,
- Hlavní smlouva vzniká mimo Propojo,
- u Výrobku na míru nesmí vzniknout full e-shop checkout.

## 2. Stripe
Použijeme:
- Stripe Connect Standard,
- Direct Charges,
- manual capture / card preauthorization,
- connected account providera je merchant/payment recipient,
- application fee = provize Propojo.

Provider nese:
- Stripe processing fee,
- případný negative balance,
- chargebacky/disputes.

Propojo nevrací application fee automaticky při refundu.
Refund znamená, že Propojo přes Stripe zahájí refund z účtu providera. Stav aplikace musí sledovat skutečné Stripe webhooky.

## 3. Provize
Standard tarif:
- 0 Kč měsíčně,
- 10 % z částky placené přes Propojo,
- minimum 29 Kč,
- maximum 89 Kč,
- přirážka 2 % z části platby nad 3 000 Kč, bez stropu (rozhodnutí Mateje 4. 10. 2026; např. 5 450 Kč → 89 + 49 = 138 Kč),
- částky bez DPH; pokud se DPH uplatní, připočte se.

Provize se počítá pouze z Rezervačního poplatku a Ceny výjezdu. Nikdy ne z konečné ceny Hlavní smlouvy.
Minimální placená rezervace: 200 Kč. Rezervace za 0 Kč odstranit.
Provider dostane standardně jeden měsíční souhrnný doklad s rozpisem jednotlivých provizí.
Provize vzniká/je stržena při úspěšném capture platby. Měsíční doklad je následné vyúčtování, ne okamžik vzniku provize.

## 4. Model A – služba
Customer: zadání → termín → preauthorization.
Provider musí potvrdit nejpozději do 48 hodin od requestu, vždy ale před začátkem rezervovaného termínu.
Provider klikne potvrdit → systém provede capture. Teprve úspěšný capture znamená stav confirmed.
Capture fail → rezervace není potvrzena.
Pokud provider nepotvrdí → authorization release / expiration → bez provize.
Hlavní smlouva vzniká později mimo Propojo.

## 5. Model B – Výjezd a nacenění
Samostatná placená služba: cesta, prohlídka/zaměření, nacenění. Cena výjezdu není záloha.
Provider po výjezdu může nahrát foto/PDF Závazné nabídky pouze jako důkaz dodání slíbeného výstupu.
Propojo nabídku neposuzuje, zákazník ji v aplikaci nepřijímá, upload nepohybuje penězi.

## 6. Model C – Výrobek na míru
Žádné: stock products, full-price checkout, plna_platba, automatické quantity × unit_price → koupit.
Customer musí před rezervací vyplnit individuální brief. Po odeslání uložit snapshot.
Rezervuje se výrobní kapacita/termín a platí se pouze Rezervační poplatek. Payment lifecycle stejný jako A.
Provider má povinnost předat Závaznou nabídku v textové podobě ve stanovené lhůtě.
Provider v Propojo pouze zaznamená „Závazná nabídka předána“ s timestampem. Zákazník ji v Propojo nesmí přijmout.
Model C nemá provider no-show proces.

## 7. Automatické refundy – sjednocený model
Provider při onboardingu výslovně odsouhlasí a předem dá Propojo pokyn, aby v přesně definovaných systémových situacích zahájilo refund z jeho Stripe účtu. Systémový pokyn má pokrýt tyto případy:

**Provider zruší rezervaci** → okamžitě zahájit full refund.

**Provider zvolí „Původní termín nemohu dodržet“.** Customer:
- přijme nový termín → rezervace pokračuje,
- odmítne → full refund,
- nereaguje do expirace → full refund.

Expirace: dřívější z 24 hodin od návrhu / začátku původního termínu.

**Provider no-show.** Customer může no-show nahlásit až po skončení rezervovaného okna, nejpozději do 48 h.
Provider dostane e-mail + app/push. Lhůta na reakci = 72 h od odeslání systémové výzvy. Provider:
- souhlasí → full refund,
- rozporuje → žádný automatický pohyb peněz,
- nereaguje → automaticky zahájit full refund.

U Modelu B se automatický refund nespustí, pokud před reportem existuje validní check-in.
Propojo nikdy nerozhoduje, kdo má pravdu.

## 8. Customer cancellation
Pro MVP nechceme staré storno tier fees.

U A/C: pokud zákazník zruší před objektivní hranicí, systém může zahájit full refund. Pracovní hranice:
- před předáním Závazné nabídky,
- zároveň před začátkem rezervovaného termínu, pokud termín má konkrétní čas.

Jakmile už byla Závazná nabídka předána nebo jsme za touto hranicí, Propojo už neví, zda mezitím nevznikla Hlavní smlouva, takže refund není automatický.

U B: zrušení před začátkem Výjezdu → full refund, pokud ještě neexistuje validní check-in.
Po začátku/check-inu žádný automatický refund; dál platí pravidla zákonného odstoupení, marného výjezdu atd.

Tyto přesné právní hranice ještě projdou finální kontrolou právničkou, ale datový model a refund engine musí tuto logiku umožnit konfigurovat.

## 9. Customer no-show / marný výjezd
Model B má „Jsem na místě“. Validní check-in pro automatické účinky:
- nejdříve 30 min před termínem,
- nejpozději do konce rezervovaného okna,
- do cca 500 m od adresy,
- location accuracy musí být dostatečná.

Pokud location permission není uděleno nebo je accuracy příliš nízká: check-in může být evidován, ale nesmí automaticky blokovat customer no-show refund.
Check-in není důkaz skutečné přítomnosti, pouze systémový záznam splňující definovaná kritéria. Neukládat continuous tracking.

## 10. Změny termínu
Dvě různé akce:
- „Navrhnout alternativní termín“ – původní termín stále platí.
- „Původní termín nemohu dodržet“ – původní termín provider deklaruje jako nesplnitelný. Customer nový přijme / odmítne / nereaguje podle refund flow výše.

Provider nesmí jednostranně přepsat potvrzený termín.

## 11. Refund statusy
Nezaměňovat: refund requested/initiated, pending, succeeded, failed/canceled.
UI po vytvoření: „Vrácení peněz bylo zahájeno.“
Po úspěšném Stripe refundu: „Refund byl úspěšně zpracován; banka může částku připsat až za několik pracovních dnů.“
Provider může refundovat i ručně ve Stripe Dashboardu → Propojo musí stav synchronizovat webhookem.
Full refund znamená vrátit celou dosud nevrácenou částku.

## 12. Chargeback
Chargeback/dispute není refund.
Pokud je platba ve Stripe dispute, automatické refund procesy Propojo k této platbě nesmí běžet tam, kde Stripe refund technicky neumožní.
Stav aplikace se řídí Stripe webhooky.

## 13. Stripe account status
Provider nesmí mít možnost přijímat nové rezervace, pokud jeho Stripe account:
- není connected,
- je deauthorized,
- nemá potřebné payment capabilities,
- je omezen tak, že nelze přijmout/captureovat platbu.

Provider má povinnost účet ponechat funkční, dokud existují otevřené rezervace/refundy.
„Otevřená rezervace“ musí zahrnovat i post-term období: 48h customer report window, případně následnou 72h provider-response window.

## 14. Reviews
Staré review = payout release odstranit.
Veřejný štítek má být „Ověřená rezervace přes Propojo“, ne „Ověřená realizace“.
Propojo může ověřit, že rezervace skutečně proběhla přes platformu, ne nutně že Hlavní smlouva byla splněna.
Review může být relevantní i u no-show nebo problémové rezervace.

## 15. Kontakty
Telefon/e-mail providera: ne veřejně na profilu; zobrazit v poslední checkout rekapitulaci před odesláním/platbou.

## 16. Trust Ramp / Capacity Match
Provider po splnění vstupního ověření je normálně dohledatelný a může publikovat nabídky i termíny bez hard limitu.
Trust Ramp ovlivňuje jen aktivní distribuci: Capacity Match, Fill the Gap, push recommendations.
Organické řazení musí mít vlastní transparentní parametry. Mezi hlavní parametry patří i „Nejdřív volno“ / reálná dostupnost termínu.

## 17. GDPR / evidence
Datový model musí umět evidovat odděleně:
- uploaded quote proof,
- no-show report,
- provider response,
- check-in,
- location + accuracy,
- system timestamps,
- refund triggers,
- explicit provider consent to automatic-refund instruction,
- explicit customer request for performance before expiry of withdrawal period,
- withdrawal request + confirmation timestamp.

Retention periods budou potvrzeny s právničkou v Privacy Policy. Nedávat je napevno do architektury, pokud to není nutné.

## 18. Co definitivně odstranit / refaktorovat
- subscription gating,
- trial/annual subscription logic,
- plna_platba,
- bez_platby,
- held money / escrow,
- releaseDeposit,
- transfers,
- payout release cron,
- 50:50 disputes,
- payout přes review/completion,
- staré no-show/storno tiers,
- MAX_NO_SHOW_FEE,
- autoResolveNoShows,
- staré commission_pct = 0,
- „provider only if paying subscriber“,
- full custom-product checkout,
- stock products,
- akce „Přijmout cenovou nabídku“,
- terminologie „záloha“ tam, kde má být Rezervační poplatek / Cena výjezdu.

## 19. Doplatek
NENÍ součást MVP. Neimplementovat: QR doplatek, final card payment, konečnou cenu Hlavní smlouvy, tracking celkové hodnoty zakázky.

## Pořadí implementace
1. nový domain/state model,
2. Stripe Connect/Direct Charge lifecycle,
3. booking confirmation,
4. refund engine + refund triggers,
5. no-show/check-in,
6. Model B,
7. Model C,
8. Trust Ramp/Capacity Match,
9. reviews,
10. odstranění legacy logiky.

Nerozbíjet současnou aplikaci najednou. U každé významné změny nejdřív napsat, které soubory/tabulky/endpointy se mění a proč.

## Technické korekce a doplnění (navrženo 25. 9. 2026, k potvrzení Matejem)
1. Lhůty (48 h, 24 h, 72 h, připomínky) přes Supabase pg_cron + pg_net, který každých 5 min volá jeden chráněný endpoint. Vercel Hobby spouští cron jen 1× denně.
2. Druhý Stripe webhook endpoint pro události z připojených účtů (vlastní signing secret). U manual capture přijde `checkout.session.completed` s `payment_status: unpaid` → stav brát z PaymentIntentu (`requires_capture`).
3. Minimální předstih rezervace (parametr, návrh 60 min). Preautorizace, která dorazí po začátku termínu, se hned uvolní.
4. Každá rezervace s termínem ukládá začátek i konec okna. Návrh termínu u Modelu B musí mít i konec (okno příjezdu).
5. Model B: přesná adresa se souřadnicemi povinná už v rekapitulaci před platbou (jinak nelze ověřit check-in).
6. Capture nebo zrušení preautorizace providerem ve Stripe Dashboardu = potvrzení / odmítnutí (stav podle webhooku).
7. Před spuštěním nového checkoutu upravit `autoReleaseUnpaidReservations`; přihrávání jen u objednávky bez platby; testovací connected účty ověřit (Express → založit znovu jako Standard).
8. Do rozsahu pokynu z bodu 7 patří i automatický refund při zrušení zákazníkem z bodu 8 – jinak ho engine nesmí spustit.

Parametry k potvrzení (v `lib/booking/policy.ts`): předstih rezervace 60 min, max. nepřesnost polohy 200 m, připomínka 24 h před koncem lhůty, DPH 0, dokud se neuplatní.

## 20. Stav právního potvrzení (k 30. 9. 2026)
Podklad se 14 body byl odeslán právničce, odpověď zatím nepřišla.
Pravidlo pro vývoj:
- CONFIRMED = implementovat natvrdo.
- OPEN – LEGAL = implementovat, ale lhůty, částky a hranice držet jako parametry (`lib/booking/policy.ts`) a automatické pohyby peněz nechat vypínatelné. Po odpovědi právničky se mění parametry, ne architektura.
- Ostrý provoz je stejně blokován sekcí „Před ostrým spuštěním“ v CLAUDE.md (finální VOP a Privacy Policy).

### CONFIRMED (konstrukční principy)
- Propojo je zprostředkovatel, není stranou Hlavní smlouvy, nedrží peníze zákazníků, nerozhoduje spory.
- Hlavní smlouva vzniká mimo Propojo; v aplikaci žádné „Přijmout nabídku“.
- Tři typy nabídky A / B / C; Model B je samostatná placená služba, ne záloha.
- Předautorizace → potvrzení poskytovatelem → capture; bez potvrzení release.
- Přesná adresa a okno termínu před platbou (Model B).
- Upload Závazné nabídky jen jako doklad, nehýbe penězi.
- Model C bez skladového zboží a bez checkoutu celé ceny.
- Doplatek není v MVP.

### OPEN – LEGAL (čeká na právničku, čísla podle odeslaného podkladu)
1. Provize 10 % / min 29 / max 89 Kč (od 4. 10. 2026 + 2 % z části nad 3 000 Kč – právničce doplnit), nevracení při refundu, minimum 200 Kč, měsíční doklad, application fee a PSD2.
2. Potvrzení / odmítnutí rezervace úkonem ve Stripe Dashboardu; povinnost udržovat Stripe účet funkční.
3. Vznik Rezervační smlouvy až úspěšným capture; předstih 60 min (VOP, nebo jen technický parametr).
4. Předem udělený pokyn poskytovatele k automatickým refundům (forma souhlasu, PSD2).
5. Zrušení zákazníkem – hranice automatického refundu, vztah ke 14dennímu odstoupení.
6. No-show poskytovatele – 48 h / 72 h, refund při nečinnosti.
7. Změna termínu – expirace 24 h / začátek původního termínu.
8. Model B – check-in parametry (30 min / 500 m / 200 m), marný výjezd, geolokace a GDPR.
9. Model C – lhůta pro předání Závazné nabídky, GPSR.
10. Hodnocení – štítek „Ověřená rezervace přes Propojo“, hodnocení no-show.
11. Kontakty v rekapitulaci, anti-bypass formulace.
12. Trust Ramp, parametry řazení, sankční stupně (P2B).
13. GDPR – účely, tituly a doby uchování evidovaných údajů.
14. HANDOFF-LEGAL-001 – zákazníkem schválená změna poskytovatele (odesláno právničce 2. 10. 2026).
    UZAVŘENO PRO MVP (právnička, 2. 10. 2026): princip není nemožný, ale právně i technicky by vyžadoval
    složitý proces, zejména u již zaplacených rezervací. Pro MVP se neimplementuje; otázky níže se otevřou
    až po stabilizaci základního transakčního modelu.
    - GDPR právní titul pro zpřístupnění údajů novému providerovi,
    - zda Privacy Policy uvádí schválené náhradní providery jako kategorii příjemců,
    - jaké údaje smí navržený provider vidět před schválením zákazníkem,
    - zda jde o ukončení původní + vznik nové Rezervační smlouvy (ne převod smlouvy),
    - zda původnímu providerovi vzniká odpovědnost za doporučeného kolegu,
    - platební / refundový režim, když původní rezervace už byla captured,
    - zachování nebo odpuštění původní provize při schváleném handoffu.

### ROZHODNUTO MATEJEM, ALE LIŠÍ SE OD ODESLANÉHO PODKLADU / VOP 4.x
- ZMĚNĚNO 4. 10. 2026: o započtení Ceny výjezdu do následné zakázky rozhoduje poskytovatel u Nabídky výjezdu (zaškrtávací pole v editoru, výchozí „nezapočítává se“). Odpovídá VOP v4.1 čl. 11.6 a 10.7. Zákazník slib vidí před objednáním i nad tlačítkem platby; snapshot se ukládá do `orders.quote_fee_deductible` a do evidence shrnutí. Propojo započtení nekontroluje ani nevymáhá. (Původní rozhodnutí 28. 9. „nikdy“ zrušeno.)
- Provize: přirážka 2 % z části platby nad 3 000 Kč (4. 10. 2026). V odeslaném podkladu není – doplnit právničce, promítnout do Ceníku.
- Zákazník nezastižen: jen po validním check-inu, alespoň jeden pokus o kontakt, jednotná čekací doba 15 min; Cena výjezdu včetně dopravy se pak nevrací (28. 9. 2026). V odeslaném podkladu není – doplnit právničce.
- Doprava u Modelu B: zahrnutá v ceně, nebo připočtená podle km (28. 9. 2026). Nutné promítnout do informací před objednáním.

### HANDOFF-001 – zákazníkem schválená změna poskytovatele (MIMO MVP, odloženo)
Stanovisko právničky 2. 10. 2026: pro MVP se neimplementuje, vrátit se k tomu až po stabilizaci základního
transakčního modelu (OPEN – LEGAL bod 14). Do té doby nic neimplementovat ani nepřipravovat v kódu.
Pracovní směr níže zůstává jen jako výchozí bod pro budoucí návrh.
- Situace: původní provider má Rezervaci a zjistí, že ji nesplní. Místo zrušení může navrhnout jiného registrovaného providera. O změně vždy rozhoduje zákazník.
- Pracovní směr: původní Rezervace skončí podle svého platebního stavu → zákazník výslovně schválí nového providera → vznikne nová Rezervace s novým platebním cyklem na Stripe účtu nového providera. Existující Rezervace ani platba se mezi providery NEPŘEVÁDÍ (Direct Charges, samostatné connected accounty).
- Navržený provider musí být plně onboardovaný (vlastní Stripe Standard účet) a potvrzuje jen „Chci zakázku převzít“.
- Před schválením zákazníkem dostane jen: typ práce, termín / okno, obec nebo přibližnou lokalitu, Rezervační poplatek / Cenu výjezdu. Nikdy jméno, telefon, e-mail ani přesnou adresu zákazníka.
- Zákazník uvidí profil nového providera. CTA „Souhlasím se změnou poskytovatele“, text: „Potvrzením bude původní rezervace nahrazena novou rezervací u [jméno]. Novému poskytovateli budou po potvrzení zpřístupněny údaje potřebné k vyřízení rezervace.“ CTA „Souhlasím s předáním osobních údajů“ nepoužívat, dokud právnička nepotvrdí souhlas jako právní titul.
- Zákazník odmítne → původní Rezervace beze změny (provider ji může zrušit standardním flow). Přijme → nová Rezervace s identitou providera, cenou a povinnou rekapitulací před platbou; přesnou adresu a kontakt nový provider uvidí až potom.
- Otevřené: postup u již captured původní rezervace; druhá application fee vs. výjimka z pravidla, že provize původní Rezervace při provider cancellation zůstává.
- Stará handoff logika v kódu se nepoužívá a neobnovuje.
- Po odpovědi právničky: aktualizovat tento bod a bod 14 OPEN – LEGAL, doplnit stavový model, rozepsat scénáře HANDOFF-* (`docs/bulletproof/SCENARIOS.md`), teprve potom implementační plán.
