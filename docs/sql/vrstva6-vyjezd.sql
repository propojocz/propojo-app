-- docs/sql/vrstva6-vyjezd.sql
-- Vrstva 6 (22. 10. 2026): doprava u výjezdu podle km a doklad Závazné nabídky.
-- Čistě aditivní. Projekt svtrlztjlxxjrbncukmp. Tabulky orders a quote_proofs existují (přístup mají).

-- Doprava připočtená k Ceně výjezdu před platbou (snapshot – po zablokování platby se nemění)
alter table public.orders add column if not exists travel_km numeric(7,1);
alter table public.orders add column if not exists travel_fee_halere integer;
alter table public.orders add column if not exists travel_estimated boolean;

-- Soukromé úložiště dokladů Závazné nabídky (foto / PDF), zobrazení přes dočasné odkazy. Max. 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-proofs', 'quote-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Kontrola: 3 sloupce a 1 úložiště
select column_name from information_schema.columns where table_name = 'orders' and column_name in ('travel_km', 'travel_fee_halere', 'travel_estimated');
select id, public from storage.buckets where id = 'quote-proofs';
