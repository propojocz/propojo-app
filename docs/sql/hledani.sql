-- Část B (9. 10. 2026): chytřejší vyhledávání na marketplace.
-- Hledá bez ohledu na diakritiku a velká písmena v názvu, podtitulu, popisu a kategorii karty,
-- v názvech aktivních položek ceníku a v názvech schválených podkategorií.
-- Aplikace posílá seznam vzorů (kořeny slov + příbuzná slova ze slovníku, už bez diakritiky).
-- Čistě aditivní: rozšíření + jedna funkce.

create extension if not exists unaccent;

create or replace function public.search_service_ids(patterns text[])
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.id
  from services s
  left join categories c on c.slug = s.category
  where s.is_active
    and exists (
      select 1 from unnest(patterns) p
      where lower(unaccent(concat_ws(' ', s.title, s.subtitle, s.description, s.category, c.name))) like '%' || p || '%'
    )
  union
  select si.service_id
  from service_items si
  where si.is_active
    and exists (select 1 from unnest(patterns) p where lower(unaccent(si.name)) like '%' || p || '%')
  union
  select ss.service_id
  from service_subcategories ss
  join subcategories sc on sc.id = ss.subcategory_id
  where sc.is_approved
    and exists (select 1 from unnest(patterns) p where lower(unaccent(sc.name)) like '%' || p || '%')
$$;

grant execute on function public.search_service_ids(text[]) to anon, authenticated;
