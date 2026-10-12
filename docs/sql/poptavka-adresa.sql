-- docs/sql/poptavka-adresa.sql
-- Přesná adresa zákazníka už při zadání poptávky (12. 10. 2026, nepovinná). Poskytovatelům se
-- ukazuje jen obec; přesná adresa se přenese do objednávky po výběru termínu a poskytovatel ji
-- uvidí až potvrzením rezervace (stanovisko AK bod 8). Čtou se jen přes service role v kódu.
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.requests
  add column if not exists address text,
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision;

comment on column public.requests.address is 'Přesná adresa zákazníka (nepovinná) – poskytovatelé ji nevidí, do objednávky se přenese po výběru termínu';
