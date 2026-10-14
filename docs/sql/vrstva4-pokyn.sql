-- docs/sql/vrstva4-pokyn.sql
-- Vrstva 4, část 1 (13. 10. 2026): pokyn poskytovatele k automatickým refundům ukládá přesné znění,
-- verzi katalogu (AUTOREF) a verzi podmínek (stanovisko AK bod 4, model §21).
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.booking_consents
  add column if not exists text_snapshot text,
  add column if not exists catalog_version text,
  add column if not exists terms_version text;

comment on column public.booking_consents.text_snapshot is 'Přesné znění, které uživatel odsouhlasil';
comment on column public.booking_consents.catalog_version is 'Verze katalogu automatických refundů (AUTOREF) – nová verze = nový souhlas';
comment on column public.booking_consents.terms_version is 'Verze podmínek (VOP), ke kterým se souhlas vztahuje';
