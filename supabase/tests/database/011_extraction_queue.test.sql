-- Phase 2D: durable extraction queue (M-04, M-05). Single-session behaviour;
-- concurrent workers are covered by tests/concurrency.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

create function pg_temp.as_role(p_role text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.id(p_key text) returns uuid language sql as $$
  select ('00000000-0000-4000-e100-' || lpad(to_hex(abs(hashtext(p_key))), 12, '0'))::uuid
$$;

-- A stored document with a received intake.
create function pg_temp.received(p_key text, p_status public.inbound_order_status default 'received') returns uuid language plpgsql as $$
declare v_doc uuid := gen_random_uuid();
begin
  insert into public.source_documents
    (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
  values (v_doc, '00000000-0000-4000-a000-000000000001', p_key || '.pdf', 'application/pdf', 1000, 1,
          encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), 'stored', '00000000-0000-4000-a500-000000000004', now());
  insert into public.inbound_orders (id, organization_id, reference, source_document_id, status)
  values (pg_temp.id(p_key), '00000000-0000-4000-a000-000000000001',
          'IN-' || lpad((abs(hashtext(p_key)) % 1000000000)::text, 9, '0'), v_doc, p_status);
  return pg_temp.id(p_key);
end $$;

create function pg_temp.claim() returns jsonb language sql as $$
  select coalesce(pg_temp.as_role('service_role', 'select to_jsonb(c)::text from public.claim_extraction_job(60) c')::jsonb, 'null'::jsonb)
$$;

create function pg_temp.intake_status(p_key text) returns text language sql as $$
  select status::text from public.inbound_orders where id = pg_temp.id(p_key)
$$;

create temp table c (k text primary key, v jsonb);

-- Queue -------------------------------------------------------------------------
select pg_temp.received('Q-1');
select matches(pg_temp.as_user('00000000-0000-4000-a500-000000000001', format('select public.start_extraction(%L)::text', pg_temp.id('Q-1'))),
  '^ERR:42501', 'signed-in users cannot start worker jobs');
select ok(pg_temp.as_role('service_role', format('select public.start_extraction(%L)::text', pg_temp.id('Q-1'))) ~ '^[0-9a-f-]{36}$',
  'the server queues the first extraction run');
select is(pg_temp.intake_status('Q-1'), 'extracting', 'the intake moves to extracting');
select is(pg_temp.as_role('service_role', format('select public.start_extraction(%L)::text', pg_temp.id('Q-1'))),
  (select latest_extraction_run_id::text from public.inbound_orders where id = pg_temp.id('Q-1')), 'starting again is idempotent');
select is((select count(*)::int from public.extraction_runs where inbound_order_id = pg_temp.id('Q-1')), 1, 'still one run');

-- Claim and complete --------------------------------------------------------------
insert into c select 'Q1', pg_temp.claim();
select is((select v ->> 'inbound_order_id' from c where k = 'Q1'), pg_temp.id('Q-1')::text, 'a worker claims the job');
select is((select status::text from public.extraction_runs where id = (select (v ->> 'run_id')::uuid from c where k = 'Q1')), 'running', 'the run is running with a lease');
select is(pg_temp.claim(), 'null'::jsonb, 'a claimed job cannot be claimed again');
select matches(pg_temp.as_role('service_role', 'select (public.claim_extraction_job(5)).run_id::text'), '^ERR:22023', 'lease length is validated');
select is(pg_temp.as_role('service_role', format('select public.complete_extraction(%L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q1'), gen_random_uuid(), '{"status": "complete"}')), 'stale_claim',
  'a wrong claim token changes nothing');
select is(pg_temp.intake_status('Q-1'), 'extracting', 'the intake is unchanged after a stale claim');
select is(pg_temp.as_role('service_role', format('select public.complete_extraction(%L, %L, %L, 0.93, %L, 1200)',
  (select v ->> 'run_id' from c where k = 'Q1'), (select v ->> 'claim_token' from c where k = 'Q1'), '{"status": "complete"}', 'simulated-1')), 'completed',
  'the worker completes the job with its claim token');
select is(pg_temp.intake_status('Q-1'), 'in_review', 'the intake moves to review');
select is((select raw_output ->> 'status' from public.extraction_runs where id = (select (v ->> 'run_id')::uuid from c where k = 'Q1')), 'complete',
  'the raw output is stored');
select is(pg_temp.as_role('service_role', format('select public.complete_extraction(%L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q1'), (select v ->> 'claim_token' from c where k = 'Q1'), '{"status": "again"}')), 'stale_claim',
  'completing twice is a no-op (idempotent)');

-- Transient failure, backoff and retry limit --------------------------------------
select pg_temp.received('Q-2');
select pg_temp.as_role('service_role', format('select public.start_extraction(%L)::text', pg_temp.id('Q-2')));
insert into c select 'Q2a', pg_temp.claim();
select is(pg_temp.as_role('service_role', format('select public.fail_extraction(%L, %L, %L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q2a'), (select v ->> 'claim_token' from c where k = 'Q2a'), 'transient', 'provider_timeout', 'Timed out')),
  'retry_scheduled', 'a transient failure schedules a retry');
select is((select attempt || '/' || status from public.extraction_runs where id = (select latest_extraction_run_id from public.inbound_orders where id = pg_temp.id('Q-2'))),
  '2/queued', 'the retry is a new queued attempt');
select ok((select available_at between now() + interval '29 seconds' and now() + interval '31 seconds'
             from public.extraction_runs where id = (select latest_extraction_run_id from public.inbound_orders where id = pg_temp.id('Q-2'))),
  'the first retry waits 30 seconds (exponential backoff)');
select is(pg_temp.claim(), 'null'::jsonb, 'a retry is not claimed before its backoff ends');
select is(pg_temp.intake_status('Q-2'), 'extracting', 'the intake stays extracting while retries remain');

update public.extraction_runs set available_at = now() - interval '1 second'
 where id = (select latest_extraction_run_id from public.inbound_orders where id = pg_temp.id('Q-2'));
insert into c select 'Q2b', pg_temp.claim();
select is((select (v ->> 'attempt')::int from c where k = 'Q2b'), 2, 'the second attempt is claimed after the backoff');

-- Lease expiry and recovery
update public.extraction_runs set lease_expires_at = now() - interval '1 second' where id = (select (v ->> 'run_id')::uuid from c where k = 'Q2b');
select is(pg_temp.as_role('service_role', format('select public.complete_extraction(%L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q2b'), (select v ->> 'claim_token' from c where k = 'Q2b'), '{"status": "late"}')), 'stale_claim',
  'a worker whose lease expired cannot complete');
select ok(pg_temp.as_role('service_role', 'select public.recover_stale_extractions()::text')::int >= 1, 'recovery picks up the expired lease');
select is((select error_code from public.extraction_runs where id = (select (v ->> 'run_id')::uuid from c where k = 'Q2b')), 'lease_expired',
  'the expired run is recorded as a transient failure');
select ok((select attempt = 3 and available_at between now() + interval '59 seconds' and now() + interval '61 seconds'
             from public.extraction_runs where id = (select latest_extraction_run_id from public.inbound_orders where id = pg_temp.id('Q-2'))),
  'the next attempt doubles the backoff (60 seconds)');

update public.extraction_runs set available_at = now() - interval '1 second'
 where id = (select latest_extraction_run_id from public.inbound_orders where id = pg_temp.id('Q-2'));
insert into c select 'Q2c', pg_temp.claim();
select is(pg_temp.as_role('service_role', format('select public.fail_extraction(%L, %L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q2c'), (select v ->> 'claim_token' from c where k = 'Q2c'), 'transient', 'provider_timeout')),
  'failed', 'after the last attempt the job fails');
select is(pg_temp.intake_status('Q-2'), 'extraction_failed', 'the intake moves to extraction failed');
select is((select count(*)::int from public.extraction_runs where inbound_order_id = pg_temp.id('Q-2')), 3, 'exactly max_attempts runs were made');

-- Permanent failure
select pg_temp.received('Q-3');
select pg_temp.as_role('service_role', format('select public.start_extraction(%L)::text', pg_temp.id('Q-3')));
insert into c select 'Q3', pg_temp.claim();
select is(pg_temp.as_role('service_role', format('select public.fail_extraction(%L, %L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q3'), (select v ->> 'claim_token' from c where k = 'Q3'), 'permanent', 'unreadable_document')),
  'failed', 'a permanent failure is not retried');
select is(pg_temp.intake_status('Q-3'), 'extraction_failed', 'the intake fails immediately');
select matches(pg_temp.as_role('service_role', format('select public.fail_extraction(%L, %L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q3'), (select v ->> 'claim_token' from c where k = 'Q3'), 'odd', 'x')),
  '^stale_claim$', 'a finished run cannot be failed again');

-- People: retry and manual entry
select matches(pg_temp.as_user('00000000-0000-4000-a500-000000000006',
  format('select public.retry_extraction(%L, %s)::text', pg_temp.id('Q-3'), (select version from public.inbound_orders where id = pg_temp.id('Q-3')))),
  '^ERR:42501', 'a Viewer cannot retry extraction');
select ok(pg_temp.as_user('00000000-0000-4000-a500-000000000004',
  format('select public.retry_extraction(%L, %s)::text', pg_temp.id('Q-3'), (select version from public.inbound_orders where id = pg_temp.id('Q-3')))) ~ '^[0-9a-f-]{36}$',
  'a Processor retries a failed extraction');
select is(pg_temp.intake_status('Q-3'), 'extracting', 'the retried intake is extracting again');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004',
  format('select public.switch_to_manual_entry(%L, %s)::text', pg_temp.id('Q-2'), (select version from public.inbound_orders where id = pg_temp.id('Q-2'))))::jsonb ->> 'ok',
  'true', 'a Processor switches a failed intake to manual entry');
select is((select status::text || '/' || manual_entry from public.inbound_orders where id = pg_temp.id('Q-2')), 'in_review/true', 'manual entry starts review without values');

-- Recovery closes jobs that are no longer needed
select pg_temp.received('Q-4', 'in_review');
insert into public.extraction_runs (id, organization_id, inbound_order_id, source_document_id, provider)
select pg_temp.id('RUN-4'), organization_id, id, source_document_id, 'simulated' from public.inbound_orders where id = pg_temp.id('Q-4');
select pg_temp.as_role('service_role', 'select public.recover_stale_extractions()::text');
select is((select status::text || '/' || error_code from public.extraction_runs where id = pg_temp.id('RUN-4')), 'failed/superseded',
  'recovery closes a queued job whose intake no longer needs it');

-- Audit, scheduling and a negative control
select ok(exists (select 1 from public.audit_events where action = 'extraction.retry_scheduled' and actor_type = 'system'
                   and metadata ->> 'process' in ('extraction.worker', 'extraction.recovery')),
  'retries are audited as system actions with the process name');
select ok(exists (select 1 from public.audit_events where action = 'extraction.failed' and parent_entity_id = pg_temp.id('Q-3')::text),
  'final failures are audited');
select is((select count(*)::int from cron.job where jobname in ('orderpilot-recover-extractions', 'orderpilot-inventory-integrity')), 2,
  'recovery (every minute) and the integrity check (nightly) are scheduled with pg_cron');

-- Negative control: without the claim-token check a stale worker would
-- overwrite the result, so the stale_claim tests depend on that check.
select pg_temp.received('Q-5');
select pg_temp.as_role('service_role', format('select public.start_extraction(%L)::text', pg_temp.id('Q-5')));
insert into c select 'Q5', pg_temp.claim();
create or replace function private.valid_claim(p_run_id uuid, p_claim_token uuid)
returns public.extraction_runs language sql security definer set search_path = '' as $$
  select * from public.extraction_runs where id = p_run_id
$$;
select is(pg_temp.as_role('service_role', format('select public.complete_extraction(%L, %L, %L)',
  (select v ->> 'run_id' from c where k = 'Q5'), gen_random_uuid(), '{"status": "forged"}')), 'completed',
  'negative control: without the claim check a wrong token would complete the job');

select * from finish();
rollback;
