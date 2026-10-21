-- OrderPilot · Migration 22: AI extraction usage and limits (free-tier safety).
--
-- Every call to a metered AI provider is reserved here first, atomically
-- against the configured limits (per minute overall, per day overall, per day
-- per workspace), then completed with its outcome and token counts. No
-- document content and no credentials are stored.

create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  extraction_run_id uuid,
  provider text not null check (provider ~ '^[a-z0-9_-]{1,40}$'),
  model text not null check (length(model) between 1 and 80),
  outcome text not null default 'started' check (outcome in ('started', 'succeeded', 'failed')),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,60}$'),
  pages integer check (pages is null or pages >= 0),
  bytes bigint check (bytes is null or bytes >= 0),
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (organization_id, extraction_run_id) references public.extraction_runs (organization_id, id)
);

create index ai_usage_events_time_idx on public.ai_usage_events (created_at desc);
create index ai_usage_events_org_time_idx on public.ai_usage_events (organization_id, created_at desc);
create index ai_usage_events_run_idx on public.ai_usage_events (organization_id, extraction_run_id);

alter table public.ai_usage_events enable row level security;
grant select on public.ai_usage_events to authenticated;
-- Owners and Admins see their workspace's usage (Settings → AI usage).
create policy ai_usage_events_select on public.ai_usage_events for select to authenticated
  using (organization_id in (select private.user_org_ids_with('settings.change')));

-- Reserves one AI call if every limit allows it. Serialised with an advisory
-- lock so concurrent workers cannot exceed a limit together.
-- Returns {"ok": true, "id": n} or {"ok": false, "limit": "minute" | "day" | "workspace_day"}.
create function public.reserve_ai_call(
  p_organization_id uuid,
  p_extraction_run_id uuid,
  p_provider text,
  p_model text,
  p_pages integer,
  p_bytes bigint,
  p_per_minute integer,
  p_per_day integer,
  p_per_workspace_day integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('orderpilot.ai_usage'));
  if (select count(*) from public.ai_usage_events where created_at > now() - interval '1 minute') >= p_per_minute then
    return jsonb_build_object('ok', false, 'limit', 'minute');
  end if;
  if (select count(*) from public.ai_usage_events where created_at > now() - interval '24 hours') >= p_per_day then
    return jsonb_build_object('ok', false, 'limit', 'day');
  end if;
  if (select count(*) from public.ai_usage_events
       where organization_id = p_organization_id and created_at > now() - interval '24 hours') >= p_per_workspace_day then
    return jsonb_build_object('ok', false, 'limit', 'workspace_day');
  end if;
  insert into public.ai_usage_events (organization_id, extraction_run_id, provider, model, pages, bytes)
  values (p_organization_id, p_extraction_run_id, p_provider, p_model, p_pages, p_bytes)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

create function public.finish_ai_call(
  p_id bigint,
  p_outcome text,
  p_error_code text default null,
  p_prompt_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_duration_ms integer default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage_events
     set outcome = p_outcome, error_code = p_error_code, prompt_tokens = p_prompt_tokens, output_tokens = p_output_tokens,
         total_tokens = p_total_tokens, duration_ms = p_duration_ms, finished_at = now()
   where id = p_id and outcome = 'started'
$$;

-- Provenance for extracted values also keeps the model's own "uncertain"
-- flag. Model confidence is not treated as a calibrated probability: values
-- without a calibrated confidence are never bulk-confirmable (D-06).
create or replace function private.ai_meta(p_field jsonb, p_run uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'source', 'ai',
    'state', 'suggested',
    'confidence', p_field -> 'confidence',
    'uncertain', case when coalesce((p_field ->> 'uncertain')::boolean, false) then true end,
    'extraction_run_id', p_run,
    'ai_value', p_field -> 'value',
    'raw', p_field -> 'raw',
    'page', p_field -> 'page',
    'ambiguous', coalesce((p_field ->> 'ambiguous')::boolean, false)
  ))
$$;

revoke all on function public.reserve_ai_call(uuid, uuid, text, text, integer, bigint, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_ai_call(bigint, text, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function private.ai_meta(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, uuid, text, text, integer, bigint, integer, integer, integer) to service_role;
grant execute on function public.finish_ai_call(bigint, text, text, integer, integer, integer, integer) to service_role;
