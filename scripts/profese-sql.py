"""Vygeneruje docs/sql/profese.sql z docs/profese-navrh.json (Matej 23. 10. 2026: profese místo oborů).
Použití: python -I scripts/profese-sql.py docs/profese-navrh.json docs/sql/profese.sql"""
import json, sys, unicodedata, re

src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding='utf-8'))

def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return 'p-' + re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def q(s):
    return "'" + s.replace("'", "''") + "'"

def arr(xs):
    return 'array[' + ', '.join(q(x) for x in xs) + ']::text[]'

ins, maps = [], []
for c in data:
    for i, p in enumerate(c['profese']):
        sl = slug(p['name'])
        ins.append(f"  ({q(c['slug'])}, {q(sl)}, {q(p['name'])}, {arr(p['syn'])}, {i + 1})")
        maps.append(f"  ({q(sl)}, {arr(p['nahrazuje'])})")

sql = f"""-- docs/sql/profese.sql – VYGENEROVÁNO skriptem scripts/profese-sql.py z docs/profese-navrh.json
-- Profese místo oborů (Matej 23. 10. 2026): poskytovatel vybere profesi, zákazník ji najde i pod příbuznými slovy.
-- Používá dnešní tabulku subcategories: profese = nové řádky (slug „p-…“), dnešní obory se označí jako
-- vyřazené (retired) s odkazem na profesi (replaced_by) a karty, položky ceníku, poptávky a katalog úkonů
-- se převedou na profesi. Nic se nemaže (staré vazby zůstanou, aplikace vyřazené obory nezobrazuje).
-- Projekt svtrlztjlxxjrbncukmp. Běží jako jedna transakce – chyba vrátí vše.

-- 1) Nové sloupce
alter table public.subcategories add column if not exists synonyms text[] not null default '{{}}';
alter table public.subcategories add column if not exists retired boolean not null default false;
alter table public.subcategories add column if not exists replaced_by uuid references public.subcategories(id);
alter table public.subcategories add column if not exists sort_order integer;

-- 2) Profese ({len(ins)}) – dočasná tabulka, ať se seznam nepíše dvakrát
create temp table _profese (cat text, slug text, name text, syn text[], ord int) on commit drop;
insert into _profese (cat, slug, name, syn, ord) values
{','.join(chr(10) + x for x in ins).lstrip(chr(10))};

-- 2a) Obor se stejným názvem ve stejné kategorii se rovnou stane profesí (zachová vazby)
update public.subcategories o
set slug = p.slug, synonyms = p.syn, sort_order = p.ord, is_approved = true, retired = false
from _profese p
join public.categories c on c.slug = p.cat
where o.id = (
    select y.id from public.subcategories y
    where y.category_id = c.id and y.name = p.name and y.slug not like 'p-%'
    order by y.id limit 1
  )
  and not exists (select 1 from public.subcategories x where x.slug = p.slug);

-- 2b) Ostatní profese jako nové řádky
insert into public.subcategories (category_id, slug, name, is_approved, synonyms, sort_order)
select c.id, p.slug, p.name, true, p.syn, p.ord
from _profese p
join public.categories c on c.slug = p.cat
where not exists (select 1 from public.subcategories s where s.slug = p.slug);

-- 3) Dnešní obory → profese
update public.subcategories o
set retired = true, replaced_by = n.id
from (values
{','.join(chr(10) + x for x in maps).lstrip(chr(10))}
) as m(new_slug, old_names)
join public.subcategories n on n.slug = m.new_slug
where o.slug not like 'p-%' and o.name = any(m.old_names);

-- 4) Ostatní dnešní obory („Jiné“, testovací) vyřadit bez náhrady – jen ty, které existují teď
update public.subcategories set retired = true where slug not like 'p-%' and retired = false;

-- 5) Převod vazeb na profesi
insert into public.service_subcategories (service_id, subcategory_id)
select distinct ss.service_id, o.replaced_by
from public.service_subcategories ss
join public.subcategories o on o.id = ss.subcategory_id
where o.replaced_by is not null
  and not exists (select 1 from public.service_subcategories x where x.service_id = ss.service_id and x.subcategory_id = o.replaced_by);

update public.services s set subcategory_id = o.replaced_by
from public.subcategories o where s.subcategory_id = o.id and o.replaced_by is not null;

update public.service_items si set subcategory_id = o.replaced_by
from public.subcategories o where si.subcategory_id = o.id and o.replaced_by is not null;

update public.requests r set subcategory_id = o.replaced_by
from public.subcategories o where r.subcategory_id = o.id and o.replaced_by is not null;

update public.service_types t set subcategory_id = o.replaced_by
from public.subcategories o where t.subcategory_id = o.id and o.replaced_by is not null;

-- 6) Kategorie karty = kategorie hlavní profese (např. Malíř z „Dům a byt“ → „Stavba, rekonstrukce a řemesla“)
update public.services s set category = c.slug
from public.subcategories sc
join public.categories c on c.id = sc.category_id
where sc.id = s.subcategory_id and not sc.retired and s.category is distinct from c.slug;

-- 7) Řádek pod názvem karty = profese (dřív se skládal z oborů)
update public.services s set subtitle = p.names
from (
  select ss.service_id, string_agg(sc.name, ' · ' order by sc.sort_order nulls last, sc.name) as names
  from public.service_subcategories ss
  join public.subcategories sc on sc.id = ss.subcategory_id
  where not sc.retired
  group by ss.service_id
) p
where p.service_id = s.id;

-- 8) Hledání: i podle příbuzných slov profese, bez vyřazených oborů
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
  where sc.is_approved and not sc.retired
    and exists (
      select 1 from unnest(patterns) p
      where lower(unaccent(concat_ws(' ', sc.name, array_to_string(sc.synonyms, ' ')))) like '%' || p || '%'
    )
$$;
grant execute on function public.search_service_ids(text[]) to anon, authenticated;

-- Kontrola: počet profesí, vyřazených oborů a karet s profesí
select
  (select count(*) from public.subcategories where slug like 'p-%') as profese,
  (select count(*) from public.subcategories where retired) as vyrazene_obory,
  (select count(distinct ss.service_id) from public.service_subcategories ss join public.subcategories sc on sc.id = ss.subcategory_id where not sc.retired) as karty_s_profesi;
"""
open(out, 'w', encoding='utf-8', newline='\r\n').write(sql)
print(len(ins), 'profesí')
