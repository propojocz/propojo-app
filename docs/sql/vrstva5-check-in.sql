-- docs/sql/vrstva5-check-in.sql
-- Vrstva 5 (21. 10. 2026): check-in u výjezdu s volitelnou fotkou a mazání polohy po lhůtách.
-- Čistě aditivní. Projekt svtrlztjlxxjrbncukmp. Tabulka check_ins existuje od vrstvy 1 (přístup má).

-- Fotka z check-inu (cesta v soukromém úložišti) a kdy se smazala poloha / fotka
alter table public.check_ins add column if not exists photo_path text;
alter table public.check_ins add column if not exists purged_at timestamptz;

-- Soukromé úložiště fotek (ne veřejné 'images'): nahrává se přes jednorázový odkaz ze serveru,
-- zobrazuje přes dočasné odkazy (1 h). Max. 5 MB, jen obrázky.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-in-photos', 'check-in-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Kontrola: 2 řádky (photo_path, purged_at) a 1 úložiště
select column_name from information_schema.columns where table_name = 'check_ins' and column_name in ('photo_path', 'purged_at');
select id, public from storage.buckets where id = 'check-in-photos';
