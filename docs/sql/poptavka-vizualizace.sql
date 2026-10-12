-- docs/sql/poptavka-vizualizace.sql
-- Vizualizace / představa zákazníka u poptávky (12. 10. 2026, nepovinné): jak by to mělo vypadat
-- (návrh z AI, fotka z internetu, náčrt). Odděleně od fotek skutečného stavu (requests.photos).
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.requests
  add column if not exists inspiration_photos text[] not null default '{}';

comment on column public.requests.inspiration_photos is 'Představa zákazníka – vizualizace, jak to má vypadat (nepovinné)';
