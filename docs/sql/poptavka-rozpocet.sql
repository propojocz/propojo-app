-- docs/sql/poptavka-rozpocet.sql
-- Nepovinný rozpočet zákazníka u veřejné poptávky (11. 10. 2026). Nezávazný – jen orientace pro
-- poskytovatele, přes Propojo se dál platí jen Rezervační poplatek / Cena výjezdu.
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.requests
  add column if not exists budget_from_kc integer,
  add column if not exists budget_to_kc integer;

comment on column public.requests.budget_from_kc is 'Rozpočet zákazníka od (Kč), nepovinný, nezávazný';
comment on column public.requests.budget_to_kc is 'Rozpočet zákazníka do (Kč), nepovinný, nezávazný';
