-- Vrstva 3c: lhůty rezervací každých 5 minut (Vercel Hobby umí cron jen 1× denně).
-- Supabase pg_cron každých 5 min zavolá přes pg_net chráněný endpoint /api/cron/booking-tick.
--
-- SPUSTIT AŽ PŘI SLOUČENÍ model-v2 DO main (na propojo.cz do té doby endpoint neexistuje
-- a Supabase nevidí na localhost). Lokálně se endpoint volá ručně.
--
-- Krok 1 a 2 spusťte zvlášť (krok 1 jen jednou). Místo VLOZTE_CRON_SECRET vložte hodnotu
-- CRON_SECRET z Vercelu (Settings → Environment Variables, Production). Tajemství se uloží
-- do Supabase Vault, v textu naplánované úlohy tak není vidět.

-- ── Krok 1: rozšíření a tajemství ──────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('VLOZTE_CRON_SECRET', 'propojo_cron_secret', 'CRON_SECRET pro /api/cron/booking-tick');

-- ── Krok 2: naplánování (při opakovaném spuštění se úloha stejného jména přepíše) ──
select cron.schedule(
  'propojo-booking-tick',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://www.propojo.cz/api/cron/booking-tick',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'propojo_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- ── Kontrola (jen čte) ────────────────────────────────────────────────────
-- select jobid, schedule, active from cron.job where jobname = 'propojo-booking-tick';
-- select status_code, content from net._http_response order by created desc limit 5;
--   → status_code 200 a v content "ok":true

-- ── Vypnutí, kdyby bylo potřeba ───────────────────────────────────────────
-- select cron.unschedule('propojo-booking-tick');
