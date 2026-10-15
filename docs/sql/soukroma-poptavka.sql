-- docs/sql/soukroma-poptavka.sql
-- Dotaz = soukromá poptávka (schváleno 14. 10. 2026, upřesněno 15. 10. 2026).
-- „Napsat poskytovateli“ i „Nejdřív se domluvit“ zakládají poptávku viditelnou jen jednomu poskytovateli.
--   requests.target_provider_id   – vyplněné = soukromá poptávka (na veřejné nástěnce se neukazuje)
--   requests.target_service_id    – karta, ze které dotaz vznikl
--   request_responses.service_item_id – položka ceníku (u „Nejdřív se domluvit“), přenese se do objednávky
--   requests.billing – „Nakupuji na firmu“ (název, IČO, DIČ, adresa); po zaplacení se přenese do objednávky
-- RLS se nemění: requests čte zákazník jen svoje, poskytovatelé přes server (filtr v kódu).
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.requests
  add column if not exists target_provider_id uuid references public.profiles(id) on delete set null;
alter table public.requests
  add column if not exists target_service_id uuid references public.services(id) on delete set null;
create index if not exists requests_target_provider_idx
  on public.requests (target_provider_id) where target_provider_id is not null;

alter table public.request_responses
  add column if not exists service_item_id uuid references public.service_items(id) on delete set null;

alter table public.requests
  add column if not exists billing jsonb;

-- Kontrola: má vrátit 4
select count(*) as nove_sloupce
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'requests' and column_name in ('target_provider_id', 'target_service_id', 'billing'))
    or (table_name = 'request_responses' and column_name = 'service_item_id'));
