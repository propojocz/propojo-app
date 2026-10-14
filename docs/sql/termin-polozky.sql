-- docs/sql/termin-polozky.sql
-- Volný termín jen pro vybrané položky ceníku (13. 10. 2026): poskytovatel u bleskového termínu
-- vybere, které služby z karty v něm nabízí (např. jen hodinovou). null = všechny položky karty.
-- Čistě aditivní, projekt svtrlztjlxxjrbncukmp.

alter table public.slot_services
  add column if not exists item_ids uuid[];

comment on column public.slot_services.item_ids is 'Které položky ceníku karty se v okně nabízejí; null = všechny';
