-- docs/sql/kalendar-k1.sql
-- Kalendář K1 (19. 10. 2026): poznámka poskytovatele („ruční rezervace“) v kalendáři.
-- Poznámka je řádek v provider_blocks s kind = 'note' – blokuje čas pro online rezervace stejně
-- jako blokace, text je v existujícím sloupci reason. Bez platby, bez účtu zákazníka, nevzniká
-- Rezervační smlouva. Čistě aditivní; stávající řádky dostanou 'block'.

alter table public.provider_blocks
  add column if not exists kind text not null default 'block'
  check (kind in ('block', 'note'));
