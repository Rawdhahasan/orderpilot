-- OrderPilot Phase 2D · Migration 13: session revocation and status guards.
--
-- 1. Privileged checks (Owner/Admin MFA, D-24) now require that the JWT's
--    session still exists in auth.sessions at AAL2. An operator MFA reset
--    deletes the person's sessions, so privileged database access ends
--    immediately even though the already-issued JWT has not expired.
-- 2. Status columns change only through workflow functions, and only along
--    the allowed transitions (DATABASE_ARCHITECTURE.md §8.2). This applies to
--    every role, including the service role.

-- ---------------------------------------------------------------------------
-- 1. Session-bound AAL2
-- ---------------------------------------------------------------------------
create function private.session_is_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1
         from auth.sessions s
        where s.id = case
                       when (auth.jwt() ->> 'session_id') ~ '^[0-9a-fA-F-]{36}$'
                       then (auth.jwt() ->> 'session_id')::uuid
                     end
          and s.user_id = auth.uid()
          and s.aal = 'aal2'
          and (s.not_after is null or s.not_after > now())
     )
$$;

revoke all on function private.session_is_aal2() from public, anon, authenticated;

create or replace function private.user_org_ids_with(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and o.status = 'active'
     and m.role = any (private.permission_roles(p_permission))
     and (
       m.role not in ('owner', 'admin')
       or p_permission in ('records.view', 'timeline.view')
       or private.session_is_aal2()
     )
$$;

create or replace function private.assert_aal2()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.session_is_aal2() then
    raise exception 'mfa_required' using errcode = 'insufficient_privilege';
  end if;
end
$$;

revoke all on function private.assert_aal2() from public, anon, authenticated;

create or replace function private.assert_permission(p_organization_id uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if not private.has_permission(p_organization_id, p_permission) then
    if private.member_role_of(p_organization_id) = any (private.permission_roles(p_permission))
       and not private.session_is_aal2() then
      raise exception 'mfa_required' using errcode = 'insufficient_privilege';
    end if;
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
end
$$;

revoke all on function private.assert_permission(uuid, text) from public, anon, authenticated;

-- Operator MFA reset: now also ends every session of the person (refresh
-- tokens are removed with their sessions), and reports how many were ended.
drop function public.record_mfa_reset(uuid, text);

create function public.record_mfa_reset(p_user_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_sessions integer;
begin
  if not util.has_text(p_reason) then
    raise exception 'validation_failed: a reason is required' using errcode = 'invalid_parameter_value';
  end if;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_sessions = row_count;
  perform set_config('orderpilot.process', 'operator.mfa_reset', true);
  for v_org in select organization_id from public.organization_members where user_id = p_user_id loop
    perform private.write_audit(v_org, 'mfa.factor_removed', 'member', p_user_id::text, null, null, null, p_reason,
                                jsonb_build_object('sessions_revoked', v_sessions));
  end loop;
  return v_sessions;
end
$$;

revoke all on function public.record_mfa_reset(uuid, text) from public, anon, authenticated;
grant execute on function public.record_mfa_reset(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Status guards
-- ---------------------------------------------------------------------------
create function private.allowed_transition(p_table text, p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_table, p_from, p_to) in (
    ('inbound_orders', 'received', 'extracting'),
    ('inbound_orders', 'extracting', 'in_review'),
    ('inbound_orders', 'extracting', 'extraction_failed'),
    ('inbound_orders', 'extraction_failed', 'extracting'),
    ('inbound_orders', 'extraction_failed', 'in_review'),
    ('inbound_orders', 'in_review', 'pending_approval'),
    ('inbound_orders', 'pending_approval', 'in_review'),
    ('inbound_orders', 'pending_approval', 'approved'),
    ('inbound_orders', 'pending_approval', 'rejected'),
    ('inbound_orders', 'in_review', 'cancelled'),
    ('inbound_orders', 'extraction_failed', 'cancelled'),
    ('sales_orders', 'confirmed', 'fulfilled'),
    ('sales_orders', 'confirmed', 'cancelled'),
    ('extraction_runs', 'queued', 'running'),
    ('extraction_runs', 'queued', 'failed'),
    ('extraction_runs', 'running', 'succeeded'),
    ('extraction_runs', 'running', 'failed')
  )
$$;

create function private.guard_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('orderpilot.transition', true), '') <> 'on' then
      raise exception 'invalid_state: % status changes only through workflow functions', tg_table_name
        using errcode = 'object_not_in_prerequisite_state';
    end if;
    if not private.allowed_transition(tg_table_name, old.status::text, new.status::text) then
      raise exception 'invalid_state: % cannot move from % to %', tg_table_name, old.status, new.status
        using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;
  return new;
end
$$;

create trigger inbound_orders_guard_status before update of status on public.inbound_orders
  for each row execute function private.guard_status_change();
create trigger sales_orders_guard_status before update of status on public.sales_orders
  for each row execute function private.guard_status_change();
create trigger extraction_runs_guard_status before update of status on public.extraction_runs
  for each row execute function private.guard_status_change();

revoke all on function private.allowed_transition(text, text, text) from public, anon, authenticated;
revoke all on function private.guard_status_change() from public, anon, authenticated;
