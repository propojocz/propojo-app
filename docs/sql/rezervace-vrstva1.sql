-- rezervace-vrstva1.sql
-- Model v2, vrstva 1: doménový a stavový model rezervací.
--
-- ČISTĚ ADITIVNÍ: jen nové sloupce, tabulky, indexy a komentáře. Nic se nemaže ani nepřejmenovává.
-- Stará aplikace běží dál beze změny: čte orders.status, nový tok bude zapisovat orders.booking_state.
-- Spusť celé najednou v Supabase SQL editoru. Při chybě se vrátí všechno (jedna transakce).
-- Na konci se ukáže kontrolní řádek: orders_nove_sloupce = 21, nove_tabulky = 13.

-- ─── 1. orders: stav rezervace, platba, provize ───────────────────────────

alter table public.orders
  add column if not exists offer_kind text
    constraint orders_offer_kind_check check (offer_kind in ('A', 'B', 'C')),
  add column if not exists booking_state text
    constraint orders_booking_state_check check (booking_state in (
      'pending_payment', 'payment_expired', 'awaiting_confirmation', 'capture_in_progress',
      'confirmed', 'capture_failed', 'declined', 'expired', 'cancelled',
      'no_show_reported', 'no_show_disputed'
    )),
  add column if not exists cancel_reason text
    constraint orders_cancel_reason_check check (cancel_reason in (
      'customer_cancelled', 'provider_cancelled', 'reschedule_rejected',
      'reschedule_expired', 'no_show_agreed', 'no_show_no_response'
    )),
  add column if not exists state_changed_at timestamptz,
  add column if not exists policy_version text,
  add column if not exists policy_snapshot jsonb,
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists charge_halere integer
    constraint orders_charge_halere_check check (charge_halere > 0),
  add column if not exists application_fee_halere integer,
  add column if not exists commission_base_halere integer,
  add column if not exists commission_vat_halere integer,
  add column if not exists vat_rate_bps integer,
  add column if not exists refunded_halere integer not null default 0,
  add column if not exists stripe_dispute_status text,
  add column if not exists authorized_at timestamptz,
  add column if not exists confirm_deadline_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists offer_due_at timestamptz,
  add column if not exists offer_delivered_at timestamptz;

create index if not exists orders_booking_state_idx
  on public.orders (booking_state) where booking_state is not null;
create index if not exists orders_confirm_deadline_idx
  on public.orders (confirm_deadline_at) where booking_state = 'awaiting_confirmation';
create index if not exists orders_stripe_pi_idx
  on public.orders (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

comment on column public.orders.booking_state is 'Model v2: stav rezervace (lib/booking/state.ts). NULL = stará objednávka, platí orders.status.';
comment on column public.orders.status is 'LEGACY stav pro staré obrazovky. Nový tok řídí booking_state.';
comment on column public.orders.confirmation_deadline is 'LEGACY (starý produktový tok). Nový tok používá confirm_deadline_at.';
comment on column public.orders.scheduled_at is 'Model v2: začátek rezervovaného okna.';
comment on column public.orders.scheduled_end is 'Model v2: konec rezervovaného okna.';
comment on column public.orders.offer_due_at is 'Model v2: lhůta pro doložení nabídky (B) / předání Závazné nabídky (C).';
comment on column public.orders.stripe_account_id is 'Model v2: connected účet providera, na kterém leží platba (snapshot).';

-- ─── 2. service_items: typ nabídky A / B / C ──────────────────────────────

alter table public.service_items
  add column if not exists offer_kind text
    constraint service_items_offer_kind_check check (offer_kind in ('A', 'B', 'C'));

-- Doplnění z dnešních dat. Skladové a neurčené zboží zůstane bez typu = v novém modelu nerezervovatelné.
-- Podmínka buffer_minutes >= 0 obchází starou NOT VALID kontrolu, aby update nespadl.
update public.service_items
set offer_kind = case
    when payment_model = 'B' then 'B'
    when item_type = 'product' and stock_mode = 'made_to_order' then 'C'
    when item_type = 'service' then 'A'
    else null
  end
where offer_kind is null
  and buffer_minutes >= 0;

comment on column public.service_items.offer_kind is 'Model v2: A = služba, B = výjezd a nacenění, C = výrobek na míru. NULL = v novém modelu nerezervovatelné.';
comment on column public.service_items.deposit_amount is 'Model v2: Rezervační poplatek (A, C) v Kč, minimum 200 Kč hlídá kód.';
comment on column public.service_items.quote_fee is 'Model v2: Cena výjezdu (B) v Kč, minimum 200 Kč hlídá kód.';
comment on column public.service_items.quote_days is 'Model v2: lhůta ve dnech pro doložení nabídky (B) / předání Závazné nabídky (C).';

-- ─── 3. Stripe účet providera a idempotence webhooků ─────────────────────

create table if not exists public.stripe_accounts (
  provider_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  account_type text not null default 'standard',
  charges_enabled boolean not null default false,
  card_payments text,
  details_submitted boolean not null default false,
  disabled_reason text,
  deauthorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.stripe_accounts is 'Model v2: stav Connect Standard účtu providera, plní jen webhook / Stripe API. Nahrazuje bránu předplatného.';

create table if not exists public.stripe_events (
  event_id text primary key,
  account_id text,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
comment on table public.stripe_events is 'Model v2: přijaté Stripe události (ochrana proti dvojímu zpracování).';

-- ─── 4. Log událostí (evidence a spouštěče) ──────────────────────────────

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null,
  actor_type text not null
    constraint order_events_actor_type_check check (actor_type in ('customer', 'provider', 'system', 'stripe', 'admin')),
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, occurred_at);
comment on table public.order_events is 'Model v2: neměnný log událostí rezervace (přechody stavů, spouštěče refundů, evidence).';

-- ─── 5. Refundy (stav vždy podle Stripe) ─────────────────────────────────

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stripe_account_id text not null,
  stripe_refund_id text unique,
  amount_halere integer not null
    constraint order_refunds_amount_check check (amount_halere > 0),
  status text not null default 'requested'
    constraint order_refunds_status_check check (status in (
      'requested', 'pending', 'requires_action', 'succeeded', 'failed', 'canceled'
    )),
  refund_trigger text not null
    constraint order_refunds_trigger_check check (refund_trigger in (
      'provider_cancelled', 'reschedule_rejected', 'reschedule_expired',
      'no_show_agreed', 'no_show_no_response', 'customer_cancelled', 'stripe_dashboard'
    )),
  initiated_by text not null
    constraint order_refunds_initiated_by_check check (initiated_by in ('customer', 'provider', 'system', 'stripe')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz
);
create index if not exists order_refunds_order_idx on public.order_refunds (order_id);
-- Jeden živý automatický refund na spouštěč; po failed/canceled jde vytvořit nový pokus.
create unique index if not exists order_refunds_one_live_per_trigger
  on public.order_refunds (order_id, refund_trigger)
  where refund_trigger <> 'stripe_dashboard' and status not in ('failed', 'canceled');

-- ─── 6. Změny termínu ─────────────────────────────────────────────────────

create table if not exists public.order_reschedules (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null
    constraint order_reschedules_kind_check check (kind in ('alternative', 'cannot_keep_original')),
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  original_start timestamptz,
  original_end timestamptz,
  expires_at timestamptz,
  status text not null default 'open'
    constraint order_reschedules_status_check check (status in ('open', 'accepted', 'rejected', 'expired')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint order_reschedules_range check (proposed_end > proposed_start)
);
create unique index if not exists order_reschedules_one_open
  on public.order_reschedules (order_id) where status = 'open';
create index if not exists order_reschedules_expiry_idx
  on public.order_reschedules (expires_at) where status = 'open';

-- ─── 7. Nedostavení providera: report a reakce odděleně ──────────────────

create table if not exists public.no_show_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  reported_by uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  window_end_at timestamptz not null,
  customer_note text
    constraint no_show_reports_note_check check (char_length(customer_note) <= 1000),
  notice_sent_at timestamptz,
  response_deadline_at timestamptz,
  reminder_sent_at timestamptz,
  outcome text
    constraint no_show_reports_outcome_check check (outcome in ('refund_initiated', 'disputed', 'check_in_conflict', 'refund_blocked')),
  resolved_at timestamptz
);
create index if not exists no_show_reports_deadline_idx
  on public.no_show_reports (response_deadline_at) where resolved_at is null;

create table if not exists public.no_show_responses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.no_show_reports(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider_id uuid references public.profiles(id) on delete set null,
  response text not null
    constraint no_show_responses_response_check check (response in ('agree', 'dispute')),
  provider_note text
    constraint no_show_responses_note_check check (char_length(provider_note) <= 1000),
  responded_at timestamptz not null default now()
);

-- ─── 8. Check-in (Model B), bez průběžného sledování ─────────────────────

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider_id uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  permission text not null
    constraint check_ins_permission_check check (permission in ('granted', 'denied', 'unavailable')),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  target_lat double precision,
  target_lng double precision,
  distance_m integer,
  is_valid boolean not null default false,
  issues text[] not null default '{}',
  policy_version text not null
);
create index if not exists check_ins_order_idx on public.check_ins (order_id, recorded_at);

-- ─── 9. Doložení nabídky (B) a individuální zadání (C) ───────────────────

create table if not exists public.quote_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider_id uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  mime_type text not null,
  file_name text,
  uploaded_at timestamptz not null default now()
);
create index if not exists quote_proofs_order_idx on public.quote_proofs (order_id);

create table if not exists public.order_briefs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  snapshot jsonb not null,
  attachments text[] not null default '{}',
  submitted_at timestamptz not null default now()
);

create or replace function public.order_briefs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Individuální zadání je po odeslání needitovatelné (order_briefs).';
end;
$$;

create or replace trigger order_briefs_no_update
  before update on public.order_briefs
  for each row execute function public.order_briefs_immutable();

-- ─── 10. Souhlasy a odstoupení ────────────────────────────────────────────

create table if not exists public.booking_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null
    constraint booking_consents_kind_check check (kind in ('provider_auto_refund_instruction', 'customer_early_performance_request')),
  document_version text not null,
  scope text[] not null default '{}',
  order_id uuid references public.orders(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  constraint booking_consents_order_required check (kind <> 'customer_early_performance_request' or order_id is not null)
);
create index if not exists booking_consents_user_idx
  on public.booking_consents (user_id, kind, accepted_at desc);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  channel text not null default 'online'
    constraint withdrawals_channel_check check (channel in ('online', 'email', 'other')),
  note text,
  confirmation_sent_at timestamptz,
  confirmation_message_id text
);
create index if not exists withdrawals_order_idx on public.withdrawals (order_id);

-- ─── 11. Ledger provizí (podklad pro měsíční souhrnný doklad) ────────────
-- Účetní záznam zůstává i po smazání objednávky (vazby se jen vynulují, údaje jsou zkopírované).

create table if not exists public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  provider_id uuid references public.profiles(id) on delete set null,
  provider_ico text,
  provider_billing_name text,
  stripe_account_id text not null,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  application_fee_id text unique,
  charge_halere integer not null,
  base_halere integer not null,
  vat_rate_bps integer not null default 0,
  vat_halere integer not null default 0,
  fee_halere integer not null,
  captured_at timestamptz not null,
  statement_month date not null,
  statement_id uuid,
  created_at timestamptz not null default now(),
  constraint commission_ledger_fee_check check (fee_halere = base_halere + vat_halere)
);
create unique index if not exists commission_ledger_order_uidx
  on public.commission_ledger (order_id) where order_id is not null;
create index if not exists commission_ledger_statement_idx
  on public.commission_ledger (provider_id, statement_month);
comment on table public.commission_ledger is 'Model v2: jedna provize na potvrzenou rezervaci, vzniká při capture. commission_log je LEGACY.';

-- ─── 12. RLS: nové tabulky zamčené, čte a zapisuje jen server (service role) ─

alter table public.stripe_accounts enable row level security;
alter table public.stripe_events enable row level security;
alter table public.order_events enable row level security;
alter table public.order_refunds enable row level security;
alter table public.order_reschedules enable row level security;
alter table public.no_show_reports enable row level security;
alter table public.no_show_responses enable row level security;
alter table public.check_ins enable row level security;
alter table public.quote_proofs enable row level security;
alter table public.order_briefs enable row level security;
alter table public.booking_consents enable row level security;
alter table public.withdrawals enable row level security;
alter table public.commission_ledger enable row level security;

-- ─── Kontrola: má ukázat orders_nove_sloupce = 21, nove_tabulky = 13 ──────

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name in (
        'offer_kind', 'booking_state', 'cancel_reason', 'state_changed_at', 'policy_version',
        'policy_snapshot', 'stripe_account_id', 'stripe_charge_id', 'charge_halere',
        'application_fee_halere', 'commission_base_halere', 'commission_vat_halere', 'vat_rate_bps',
        'refunded_halere', 'stripe_dispute_status', 'authorized_at', 'confirm_deadline_at',
        'confirmed_at', 'cancelled_at', 'offer_due_at', 'offer_delivered_at'
      )) as orders_nove_sloupce,
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'stripe_accounts', 'stripe_events', 'order_events', 'order_refunds', 'order_reschedules',
        'no_show_reports', 'no_show_responses', 'check_ins', 'quote_proofs', 'order_briefs',
        'booking_consents', 'withdrawals', 'commission_ledger'
      )) as nove_tabulky,
  (select count(*) from public.service_items where offer_kind = 'A') as polozky_a,
  (select count(*) from public.service_items where offer_kind = 'B') as polozky_b,
  (select count(*) from public.service_items where offer_kind = 'C') as polozky_c,
  (select count(*) from public.service_items where offer_kind is null) as polozky_bez_typu;
