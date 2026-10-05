-- Započtení Ceny výjezdu podle volby poskytovatele (4. 10. 2026, VOP v4.1 čl. 11.6).
-- service_items: nastavení u Nabídky výjezdu. orders: snapshot v okamžiku platby,
-- aby pozdější změna v editoru nezměnila, co zákazník viděl a odsouhlasil. Čistě aditivní.

alter table public.service_items add column if not exists quote_fee_deductible boolean not null default false;
alter table public.orders add column if not exists quote_fee_deductible boolean;
