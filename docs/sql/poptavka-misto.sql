-- docs/sql/poptavka-misto.sql
-- Místo konání u poptávky (12. 10. 2026): u zákazníka, nebo u poskytovatele (provozovna – masér,
-- kadeřnice, ateliér). Zákazník v poptávce řekne, co chce; poskytovatel v nabídce, kde to proběhne,
-- a u provozovny bez karty zadá její adresu. Objednávka bez karty si adresu provozovny drží sama.
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.requests
  add column if not exists place_pref text
    check (place_pref is null or place_pref in ('u_zakaznika', 'u_poskytovatele', 'jedno'));

alter table public.request_responses
  add column if not exists place text
    check (place is null or place in ('u_zakaznika', 'u_poskytovatele')),
  add column if not exists place_address text,
  add column if not exists place_lat double precision,
  add column if not exists place_lng double precision;

alter table public.orders
  add column if not exists provider_place_address text,
  add column if not exists provider_place_lat double precision,
  add column if not exists provider_place_lng double precision;

comment on column public.requests.place_pref is 'Kde to zákazník chce: u_zakaznika / u_poskytovatele / jedno (null = neuvedeno, bere se jako u zákazníka)';
comment on column public.request_responses.place is 'Kde služba proběhne podle nabídky poskytovatele';
comment on column public.orders.provider_place_address is 'Adresa provozovny u objednávky bez karty (služba u poskytovatele)';
