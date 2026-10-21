-- Deployed environments only (NOT a migration; never applied locally).
-- Calls the internal worker route every minute so re-queued extraction jobs
-- run without anyone opening the app (TECHNICAL_ARCHITECTURE.md §8, TD-03).
-- pg_cron recovery (migration 15) already runs every minute.
--
-- Before running, store the secrets in Supabase Vault (Dashboard → Vault):
--   select vault.create_secret('https://app.example.com', 'orderpilot_app_url');
--   select vault.create_secret('<INTERNAL_JOB_SECRET value>', 'orderpilot_job_secret');

create extension if not exists pg_net;

select cron.schedule(
  'orderpilot-run-extraction-worker',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'orderpilot_app_url') || '/api/internal/extraction',
    headers := jsonb_build_object(
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'orderpilot_job_secret'),
      'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) where exists (select 1 from public.extraction_runs where status = 'queued' and available_at <= now());
  $job$
);
