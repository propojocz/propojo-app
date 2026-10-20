-- docs/sql/hledani-preklepy.sql
-- Hledání služeb s malou chybou (20. 10. 2026, Matej): „elektrykar“ → elektrikář, „kaderik“ → kadeřník.
-- Používá se jen tehdy, když přesné chytré hledání (search_service_ids, docs/sql/hledani.sql) nic nenajde.
-- Podobnost slov přes pg_trgm (word_similarity), bez diakritiky a velkých písmen. Popis karty se
-- nepoužívá (moc šumu) – jen název, podtitul, kategorie, položky ceníku a podkategorie.
-- Čistě aditivní: rozšíření + jedna funkce.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function public.search_service_ids_fuzzy(q text, min_sim real default 0.4)
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  with n as (select lower(unaccent(coalesce(q, ''))) as q)
  select s.id
  from services s
  left join categories c on c.slug = s.category
  cross join n
  where s.is_active
    and length(n.q) >= 3
    and word_similarity(n.q, lower(unaccent(concat_ws(' ', s.title, s.subtitle, s.category, c.name)))) >= min_sim
  union
  select si.service_id
  from service_items si
  cross join n
  where si.is_active
    and length(n.q) >= 3
    and word_similarity(n.q, lower(unaccent(si.name))) >= min_sim
  union
  select ss.service_id
  from service_subcategories ss
  join subcategories sc on sc.id = ss.subcategory_id
  cross join n
  where sc.is_approved
    and length(n.q) >= 3
    and word_similarity(n.q, lower(unaccent(sc.name))) >= min_sim
$$;

grant execute on function public.search_service_ids_fuzzy(text, real) to anon, authenticated;
