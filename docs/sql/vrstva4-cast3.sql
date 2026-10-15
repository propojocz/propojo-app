-- docs/sql/vrstva4-cast3.sql
-- Vrstva 4, část 3 (15. 10. 2026): nové druhy vrácení peněz v order_refunds.
--   capture_after_deadline – AUTOREF-005 (stržení ve Stripe po uplynutí lhůty k potvrzení)
--   offer_missing_agreed / offer_missing_no_response – AUTOREF-006 (vrstva 7, ať se nemusí měnit znovu)
--   provider_manual – poskytovatel vrací peníze sám tlačítkem „Vrátit peníze zákazníkovi“ (např. po odstoupení)
-- Jen rozšíření povolených hodnot (stará data zůstávají platná). Projekt svtrlztjlxxjrbncukmp.

alter table public.order_refunds drop constraint if exists order_refunds_trigger_check;
alter table public.order_refunds add constraint order_refunds_trigger_check check (refund_trigger in (
  'provider_cancelled', 'reschedule_rejected', 'reschedule_expired',
  'no_show_agreed', 'no_show_no_response', 'customer_cancelled', 'stripe_dashboard',
  'capture_after_deadline', 'offer_missing_agreed', 'offer_missing_no_response', 'provider_manual'
));

-- Ruční vrácení poskytovatelem může proběhnout víckrát (částečně) – unikátní „jeden živý refund na spouštěč“
-- se na něj nevztahuje, stejně jako na refundy z Dashboardu.
drop index if exists public.order_refunds_one_live_per_trigger;
create unique index if not exists order_refunds_one_live_per_trigger
  on public.order_refunds (order_id, refund_trigger)
  where refund_trigger not in ('stripe_dashboard', 'provider_manual') and status not in ('failed', 'canceled');

-- Kontrola: má vypsat jen order_refunds_trigger_check s novými hodnotami (žádné jiné omezení na refund_trigger)
select conname, pg_get_constraintdef(oid) as definice
from pg_constraint
where conrelid = 'public.order_refunds'::regclass and contype = 'c';
