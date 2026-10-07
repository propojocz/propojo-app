-- Vrstva 3d (7. 10. 2026): odpověď na veřejnou poptávku = nabídka poskytovatele.
-- Poskytovatel v odpovědi zvolí typ (A služba / B výjezd a nacenění) a částku, kterou
-- zákazník zaplatí přes Propojo (Rezervační poplatek / Cena výjezdu, min. 200 Kč).
-- Po výběru se obojí přenese do objednávky (orders.offer_kind, orders.agreed_charge_halere).
-- Čistě aditivní.

alter table public.request_responses add column if not exists offer_kind text
  constraint request_responses_offer_kind_check check (offer_kind in ('A', 'B'));
alter table public.request_responses add column if not exists charge_halere integer;

-- Výjezd: poskytovatel v nabídce volí, zda Cenu výjezdu odečte z ceny zakázky (VOP 11.6).
-- U služby se Rezervační poplatek odečítá vždy (VOP 11.1).
alter table public.request_responses add column if not exists quote_fee_deductible boolean not null default false;
