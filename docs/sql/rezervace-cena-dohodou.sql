-- Cena upravená poskytovatelem u konkrétní objednávky (4. 10. 2026).
-- Poskytovatel ji pošle spolu s návrhem termínu, zákazník ji potvrdí přijetím termínu.
-- Prázdné = platí cena z nabídky. Čistě aditivní.

alter table public.order_time_proposals add column if not exists charge_halere integer;
alter table public.order_time_proposals add column if not exists price_note text;
alter table public.orders add column if not exists agreed_charge_halere integer;
