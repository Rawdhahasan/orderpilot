-- AI extraction usage limits and visibility (free-tier safety).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

create function pg_temp.svc(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute 'set local role service_role';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.run(p_user uuid, p_sql text, p_aal text default 'aal1') returns text language plpgsql as $$
declare v text; v_session uuid;
begin
  if p_aal = 'aal2' then
    insert into auth.sessions (id, user_id, aal, created_at, updated_at) values (gen_random_uuid(), p_user, 'aal2', now(), now()) returning id into v_session;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', v_session)::text, true);
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

create temp table k (name text primary key, v text);
grant all on k to service_role;
insert into k select 'other', pg_temp.svc($$select public.create_organization('Larkspur Supply (fictional)', 'larkspur', 'US', 'USD', 'America/Chicago', 'en-US', '00000000-0000-4000-a500-000000000001')::text$$);

-- Limits: 3 per minute, 5 per day overall, 2 per workspace per day.
create function pg_temp.reserve(p_org text) returns text language sql as $$
  select pg_temp.svc(format($q$select public.reserve_ai_call(%L, null, 'gemini', 'gemini-test', 2, 1000, 3, 5, 2)::text$q$, p_org))
$$;

select is(pg_temp.reserve('00000000-0000-4000-a000-000000000001')::jsonb ->> 'ok', 'true', 'a call within every limit is reserved');
select is(pg_temp.reserve('00000000-0000-4000-a000-000000000001')::jsonb ->> 'ok', 'true', 'a second call is reserved');
select is(pg_temp.reserve('00000000-0000-4000-a000-000000000001')::jsonb, '{"ok": false, "limit": "workspace_day"}'::jsonb,
  'a workspace over its daily limit is refused');
select is(pg_temp.reserve((select v from k where name = 'other'))::jsonb ->> 'ok', 'true',
  'another workspace still has its own allowance');
select is(pg_temp.reserve((select v from k where name = 'other'))::jsonb, '{"ok": false, "limit": "minute"}'::jsonb,
  'the per-minute limit applies across all workspaces');

update public.ai_usage_events set created_at = now() - interval '2 hours';
select is(pg_temp.reserve((select v from k where name = 'other'))::jsonb ->> 'ok', 'true', 'the minute window moves on');
select is(pg_temp.svc($$select public.reserve_ai_call('00000000-0000-4000-a000-000000000001', null, 'gemini', 'gemini-test', 1, 1, 10, 4, 10)::text$$)::jsonb,
  '{"ok": false, "limit": "day"}'::jsonb, 'the overall daily limit is enforced');
update public.ai_usage_events set created_at = now() - interval '25 hours';
select is(pg_temp.reserve('00000000-0000-4000-a000-000000000001')::jsonb ->> 'ok', 'true', 'the daily window moves on');

-- Finishing records the outcome once; later finishes do nothing.
insert into k select 'id', pg_temp.reserve('00000000-0000-4000-a000-000000000001')::jsonb ->> 'id';
select pg_temp.svc(format($$select public.finish_ai_call(%s, 'succeeded', null, 1200, 300, 1500, 4200)::text$$, (select v from k where name = 'id')));
select pg_temp.svc(format($$select public.finish_ai_call(%s, 'failed', 'ai_timeout')::text$$, (select v from k where name = 'id')));
select is((select outcome || '/' || total_tokens || '/' || coalesce(error_code, '-') from public.ai_usage_events where id = (select v from k where name = 'id')::bigint),
  'succeeded/1500/-', 'the outcome and token counts are recorded once');

-- Only the service role reserves calls.
select matches(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select public.reserve_ai_call('00000000-0000-4000-a000-000000000001', null, 'gemini', 'x', 1, 1, 100, 100, 100)::text$$, 'aal2'),
  '^ERR:42501', 'signed-in users cannot reserve AI calls');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select public.finish_ai_call(1, 'succeeded')::text$$, 'aal2'), '^ERR:42501', 'signed-in users cannot finish AI calls');

-- Visibility: Owners see their own workspace only; Processors see nothing.
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select count(*)::text from public.ai_usage_events where organization_id = '00000000-0000-4000-a000-000000000001'$$, 'aal2'),
  (select count(*)::text from public.ai_usage_events where organization_id = '00000000-0000-4000-a000-000000000001'), 'the Owner sees the workspace usage');
select is(pg_temp.run('00000000-0000-4000-a500-000000000004', $$select count(*)::text from public.ai_usage_events$$), '0',
  'a Processor cannot see AI usage');
select throws_ok($$set local role authenticated; insert into public.ai_usage_events (organization_id, provider, model) values ('00000000-0000-4000-a000-000000000001', 'gemini', 'x')$$,
  '42501', null, 'nobody writes usage rows directly');
reset role;

select * from finish();
rollback;
