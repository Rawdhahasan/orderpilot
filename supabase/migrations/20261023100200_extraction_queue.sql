-- OrderPilot Phase 2D · Migration 15: durable extraction queue.
-- DATABASE_ARCHITECTURE.md §6.4 (M-04, M-05), TECHNICAL_ARCHITECTURE.md §8.
--
-- extraction_runs is the job queue and the source of truth. A request-time
-- trigger (Next.js after()) may start work early, but recovery never depends
-- on it: pg_cron runs recover_stale_extractions() every minute.
--
-- Worker functions are callable by the service role only.

-- Exponential backoff for transient failures: 30 s, 60 s, 120 s … capped at 15 min.
create function private.extraction_backoff(p_attempt integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select least(interval '30 seconds' * power(2, greatest(p_attempt - 1, 0)), interval '15 minutes')
$$;

-- Creates the next queued run for an intake and points the intake at it.
create function private.queue_extraction_run(
  p_intake public.inbound_orders,
  p_attempt integer,
  p_max_attempts integer,
  p_available_at timestamptz,
  p_provider text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  insert into public.extraction_runs
    (organization_id, inbound_order_id, source_document_id, provider, attempt, max_attempts, available_at)
  values
    (p_intake.organization_id, p_intake.id, p_intake.source_document_id, p_provider, p_attempt, p_max_attempts, p_available_at)
  returning id into v_run;
  update public.inbound_orders set latest_extraction_run_id = v_run where id = p_intake.id;
  return v_run;
end
$$;

-- received → extracting: queue the first run (called by the server after a
-- document is stored).
create function public.start_extraction(p_inbound_order_id uuid, p_provider text default 'simulated')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders;
  v_run uuid;
begin
  select * into v from public.inbound_orders where id = p_inbound_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v.status = 'extracting' then
    return v.latest_extraction_run_id; -- idempotent
  end if;
  perform private.assert_intake_status(v, '{received}');
  v_run := private.queue_extraction_run(v, 1, 3, now(), p_provider);
  perform private.begin_transition();
  update public.inbound_orders set status = 'extracting', version = version + 1 where id = v.id;
  perform private.end_transition();
  return v_run;
end
$$;

-- extraction_failed → extracting, requested by a person (Processor+).
create function public.retry_extraction(p_inbound_order_id uuid, p_expected_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_last public.extraction_runs;
  v_run uuid;
begin
  perform private.assert_permission(v.organization_id, 'intake.review');
  perform private.assert_intake_status(v, '{extraction_failed}');
  perform private.assert_version(v.version, p_expected_version);
  select * into v_last from public.extraction_runs where inbound_order_id = v.id order by attempt desc limit 1;
  if coalesce(v_last.attempt, 0) >= 10 then
    raise exception 'invalid_state: too many extraction attempts; enter the order manually' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- A manual retry starts a fresh budget of up to three automatic attempts.
  v_run := private.queue_extraction_run(v, coalesce(v_last.attempt, 0) + 1,
                                        least(coalesce(v_last.attempt, 0) + 3, 10), now(),
                                        coalesce(v_last.provider, 'simulated'));
  perform private.begin_transition();
  update public.inbound_orders set status = 'extracting', version = version + 1 where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'extraction.retried', 'inbound_order', v.id::text, null, null, null, null,
    jsonb_build_object('extraction_run_id', v_run));
  return v_run;
end
$$;

-- extraction_failed → in_review without values (Processor+).
create function public.switch_to_manual_entry(p_inbound_order_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
begin
  perform private.assert_permission(v.organization_id, 'intake.review');
  perform private.assert_intake_status(v, '{extraction_failed}');
  perform private.assert_version(v.version, p_expected_version);
  perform private.begin_transition();
  update public.inbound_orders set status = 'in_review', manual_entry = true, version = version + 1 where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'inbound_order.manual_entry', 'inbound_order', v.id::text);
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

-- Claims the next due job. SKIP LOCKED lets many workers run safely; only the
-- intake's latest run may be claimed while the intake is extracting.
create function public.claim_extraction_job(p_lease_seconds integer default 120)
returns table (run_id uuid, claim_token uuid, organization_id uuid, inbound_order_id uuid,
               source_document_id uuid, provider text, attempt integer, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.extraction_runs;
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 900 then
    raise exception 'validation_failed: lease must be 10 to 900 seconds' using errcode = 'invalid_parameter_value';
  end if;
  select r.* into v
    from public.extraction_runs r
    join public.inbound_orders i on i.id = r.inbound_order_id
   where r.status = 'queued' and r.available_at <= now()
     and i.status = 'extracting' and i.latest_extraction_run_id = r.id
   order by r.available_at, r.id
   limit 1
   for update of r skip locked;
  if not found then
    return;
  end if;

  perform private.begin_transition();
  update public.extraction_runs r
     set status = 'running', claim_token = gen_random_uuid(), claimed_at = now(), started_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where r.id = v.id
  returning * into v;
  perform private.end_transition();

  run_id := v.id; claim_token := v.claim_token; organization_id := v.organization_id;
  inbound_order_id := v.inbound_order_id; source_document_id := v.source_document_id;
  provider := v.provider; attempt := v.attempt; lease_expires_at := v.lease_expires_at;
  return next;
end
$$;

-- Keeps a long job's lease alive. Returns false for a stale claim.
create function public.extend_extraction_lease(p_run_id uuid, p_claim_token uuid, p_lease_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 900 then
    raise exception 'validation_failed: lease must be 10 to 900 seconds' using errcode = 'invalid_parameter_value';
  end if;
  update public.extraction_runs
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where id = p_run_id and claim_token = p_claim_token and status = 'running' and lease_expires_at > now();
  return found;
end
$$;

-- Locks a running run and its intake if the claim is still valid (M-04).
-- Returns null when the claim is stale; the caller then changes nothing.
create function private.valid_claim(p_run_id uuid, p_claim_token uuid)
returns public.extraction_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.extraction_runs;
  v_intake public.inbound_orders;
begin
  select * into v from public.extraction_runs where id = p_run_id;
  if not found then
    return null;
  end if;
  -- Lock order: intake, then run.
  select * into v_intake from public.inbound_orders where id = v.inbound_order_id for update;
  select * into v from public.extraction_runs where id = p_run_id for update;
  if v.claim_token is distinct from p_claim_token or v.status <> 'running' or v.lease_expires_at <= now()
     or v_intake.status <> 'extracting' or v_intake.latest_extraction_run_id is distinct from v.id then
    return null;
  end if;
  return v;
end
$$;

-- Success: stores the write-once raw output and moves the intake to review.
-- Returns 'completed' or 'stale_claim'. Applying the extracted values to the
-- draft is added with the extraction contract (Phase 4A).
create function public.complete_extraction(
  p_run_id uuid,
  p_claim_token uuid,
  p_raw_output jsonb,
  p_overall_confidence numeric default null,
  p_provider_version text default null,
  p_duration_ms integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.extraction_runs := private.valid_claim(p_run_id, p_claim_token);
begin
  if v.id is null then
    return 'stale_claim';
  end if;
  if p_raw_output is null or jsonb_typeof(p_raw_output) <> 'object' then
    raise exception 'validation_failed: raw output must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('orderpilot.process', 'extraction.worker', true);
  perform private.begin_transition();
  update public.extraction_runs
     set status = 'succeeded', finished_at = now(), lease_expires_at = null, raw_output = p_raw_output,
         overall_confidence = p_overall_confidence, provider_version = p_provider_version, duration_ms = p_duration_ms
   where id = v.id;
  update public.inbound_orders set status = 'in_review', version = version + 1 where id = v.inbound_order_id;
  perform private.end_transition();
  return 'completed';
end
$$;

-- Records a failed run while the caller holds the intake lock. Transient
-- failures with attempts left are re-queued with backoff; otherwise the
-- intake moves to extraction_failed.
create function private.record_extraction_failure(
  p_run public.extraction_runs,
  p_kind text,
  p_error_code text,
  p_error_message text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intake public.inbound_orders;
  v_next uuid;
begin
  perform private.begin_transition();
  update public.extraction_runs
     set status = 'failed', finished_at = now(), lease_expires_at = null, failure_kind = p_kind,
         error_code = p_error_code, error_message = left(p_error_message, 500)
   where id = p_run.id;
  select * into v_intake from public.inbound_orders where id = p_run.inbound_order_id;
  if p_kind = 'transient' and p_run.attempt < p_run.max_attempts then
    v_next := private.queue_extraction_run(v_intake, p_run.attempt + 1, p_run.max_attempts,
                                           now() + private.extraction_backoff(p_run.attempt), p_run.provider);
    perform private.end_transition();
    perform private.write_audit(p_run.organization_id, 'extraction.retry_scheduled', 'extraction_run', p_run.id::text,
      'inbound_order', p_run.inbound_order_id::text, null, null,
      jsonb_build_object('error_code', p_error_code, 'next_run_id', v_next, 'attempt', p_run.attempt + 1));
    return 'retry_scheduled';
  end if;
  update public.inbound_orders set status = 'extraction_failed', version = version + 1 where id = p_run.inbound_order_id;
  perform private.end_transition();
  perform private.write_audit(p_run.organization_id, 'extraction.failed', 'extraction_run', p_run.id::text,
    'inbound_order', p_run.inbound_order_id::text, null, null,
    jsonb_build_object('error_code', p_error_code, 'failure_kind', p_kind, 'attempt', p_run.attempt));
  return 'failed';
end
$$;

create function public.fail_extraction(
  p_run_id uuid,
  p_claim_token uuid,
  p_failure_kind text,
  p_error_code text,
  p_error_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.extraction_runs := private.valid_claim(p_run_id, p_claim_token);
begin
  if v.id is null then
    return 'stale_claim';
  end if;
  if p_failure_kind not in ('transient', 'permanent') or p_error_code !~ '^[a-z0-9_]{1,60}$' then
    raise exception 'validation_failed: invalid failure details' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('orderpilot.process', 'extraction.worker', true);
  return private.record_extraction_failure(v, p_failure_kind, p_error_code, p_error_message);
end
$$;

-- Scheduled recovery (M-05): expired leases count as transient failures, and
-- queued runs that are no longer the intake's current job are closed.
create function public.recover_stale_extractions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.extraction_runs;
  v_candidate record;
  v_count integer := 0;
begin
  perform set_config('orderpilot.process', 'extraction.recovery', true);
  -- Candidates are read without locks; each is then locked in the global
  -- order (intake, then run) and re-checked, as the worker may have finished.
  for v_candidate in
    select r.id, r.inbound_order_id from public.extraction_runs r
     where (r.status = 'running' and r.lease_expires_at <= now())
        or (r.status = 'queued' and exists (
              select 1 from public.inbound_orders i
               where i.id = r.inbound_order_id
                 and (i.status <> 'extracting' or i.latest_extraction_run_id is distinct from r.id)))
     order by r.id
  loop
    perform 1 from public.inbound_orders where id = v_candidate.inbound_order_id for update;
    select * into v from public.extraction_runs where id = v_candidate.id for update;
    if v.status = 'running' and v.lease_expires_at <= now() and exists (
         select 1 from public.inbound_orders i
          where i.id = v.inbound_order_id and i.status = 'extracting' and i.latest_extraction_run_id = v.id) then
      perform private.record_extraction_failure(v, 'transient', 'lease_expired', 'The worker did not finish in time.');
      v_count := v_count + 1;
    elsif (v.status = 'running' and v.lease_expires_at <= now())
       or (v.status = 'queued' and exists (
             select 1 from public.inbound_orders i
              where i.id = v.inbound_order_id
                and (i.status <> 'extracting' or i.latest_extraction_run_id is distinct from v.id))) then
      perform private.begin_transition();
      update public.extraction_runs
         set status = 'failed', finished_at = now(), lease_expires_at = null, claim_token = null,
             failure_kind = 'permanent', error_code = 'superseded', error_message = 'The order no longer needs this job.'
       where id = v.id;
      perform private.end_transition();
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

revoke all on function private.extraction_backoff(integer) from public, anon, authenticated;
revoke all on function private.queue_extraction_run(public.inbound_orders, integer, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function private.valid_claim(uuid, uuid) from public, anon, authenticated;
revoke all on function private.record_extraction_failure(public.extraction_runs, text, text, text) from public, anon, authenticated;

revoke all on function public.start_extraction(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_extraction_job(integer) from public, anon, authenticated;
revoke all on function public.extend_extraction_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_extraction(uuid, uuid, jsonb, numeric, text, integer) from public, anon, authenticated;
revoke all on function public.fail_extraction(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.recover_stale_extractions() from public, anon, authenticated;
revoke all on function public.retry_extraction(uuid, integer) from public, anon;
revoke all on function public.switch_to_manual_entry(uuid, integer) from public, anon;

grant execute on function public.start_extraction(uuid, text) to service_role;
grant execute on function public.claim_extraction_job(integer) to service_role;
grant execute on function public.extend_extraction_lease(uuid, uuid, integer) to service_role;
grant execute on function public.complete_extraction(uuid, uuid, jsonb, numeric, text, integer) to service_role;
grant execute on function public.fail_extraction(uuid, uuid, text, text, text) to service_role;
grant execute on function public.recover_stale_extractions() to service_role;
grant execute on function public.retry_extraction(uuid, integer) to authenticated;
grant execute on function public.switch_to_manual_entry(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron). Recovery every minute; integrity check nightly.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('orderpilot-recover-extractions', '* * * * *', 'select public.recover_stale_extractions()');
select cron.schedule('orderpilot-inventory-integrity', '17 3 * * *', 'select private.run_integrity_check()');
