-- Phase 2C: MFA enforcement, profiles, invitations and membership management
-- (approved D-03 invite-only, D-24 MFA for Owners and Admins; FR-AUTH, FR-ORG).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(68);

-- Run SQL as a signed-in user (authenticated role + JWT claims), returning
-- 'ok' or 'SQLSTATE:message'.
-- JWT claims for a signed-in user. AAL2 claims are bound to a live AAL2
-- session row, as the database requires since Phase 2D (session revocation).
create function pg_temp.claims(p_user uuid, p_aal text) returns text language plpgsql as $$
declare v_session uuid;
begin
  if p_aal = 'aal2' then
    select id into v_session from auth.sessions where user_id = p_user and aal = 'aal2' limit 1;
    if v_session is null then
      insert into auth.sessions (id, user_id, aal, created_at, updated_at)
      values (gen_random_uuid(), p_user, 'aal2', now(), now()) returning id into v_session;
    end if;
  end if;
  return json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', v_session)::text;
end $$;

create function pg_temp.as_user(p_user uuid, p_sql text, p_aal text default 'aal1') returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', pg_temp.claims(p_user, p_aal), true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- Count rows as a signed-in user (errors propagate after the role is reset).
create function pg_temp.count_as(p_user uuid, p_sql text, p_aal text default 'aal1') returns bigint language plpgsql as $$
declare v bigint; e text; m text;
begin
  perform set_config('request.jwt.claims', pg_temp.claims(p_user, p_aal), true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    e := sqlstate; m := sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if e is not null then raise exception 'count_as failed: % %', e, m; end if;
  return v;
end $$;


create function pg_temp.as_anon(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;


-- Fictional people outside any workspace.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-c100-000000000001', 'new.processor@test.example', '{"full_name": "New Processor"}'),
  ('00000000-0000-4000-c100-000000000002', 'someone.else@test.example', '{"full_name": "Someone Else"}');

-- Profiles follow auth.users -----------------------------------------------------------
select is((select full_name from public.profiles where id = '00000000-0000-4000-c100-000000000001'), 'New Processor', 'a profile is created for every new account');
update auth.users set email = 'new.processor+renamed@test.example' where id = '00000000-0000-4000-c100-000000000002';
select is((select email::text from public.profiles where id = '00000000-0000-4000-c100-000000000002'), 'new.processor+renamed@test.example', 'email changes are copied to the profile');
update auth.users set email = 'someone.else@test.example' where id = '00000000-0000-4000-c100-000000000002';

-- MFA is mandatory for Owners and Admins, enforced by the database (D-24) --------------
select ok((select mfa_required from public.profiles where id = '00000000-0000-4000-a500-000000000001'), 'MFA is required for an Owner');
select ok((select not mfa_required from public.profiles where id = '00000000-0000-4000-a500-000000000004'), 'MFA is optional for a Processor');
select ok(pg_temp.count_as('00000000-0000-4000-a500-000000000001', 'select count(*) from public.customers', 'aal1') > 0, 'an Owner without MFA can still read the workspace');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'No MFA')$$, 'aal1'), '42501:%', 'an Owner without MFA cannot write');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.set_product_price('00000000-0000-4000-a400-000000000001', 1)$$, 'aal1'), '42501:mfa_required', 'an Admin without MFA is told MFA is required');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'x@test.example', 'viewer')$$, 'aal1'), '42501:mfa_required', 'inviting requires MFA');
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000001', 'select count(*) from public.audit_events', 'aal1'), 0::bigint, 'the audit log requires MFA for an Owner');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'on_hold', 'Overdue')$$, 'aal1'), 'ok', 'MFA stays optional for Approvers');

-- Invitations ------------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', '  New.Processor@Test.Example ', 'processor')$$, 'aal2'), 'ok', 'an Admin with MFA can invite a member');
select is((select email::text || '/' || role::text || '/' || status::text from public.organization_invitations where email = 'new.processor@test.example'),
  'new.processor@test.example/processor/pending', 'invitations store the normalised email and role');
select is((select token_hash from public.organization_invitations where email = 'new.processor@test.example'), null, 'no token exists until the server issues one');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', 'select token_hash from public.organization_invitations', 'aal2'), '42501:%', 'admins can never read token hashes');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'boss@test.example', 'owner')$$, 'aal2'), '42501:insufficient_privilege', 'an Admin cannot invite an Owner');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'boss@test.example', 'owner')$$, 'aal2'), 'ok', 'an Owner can invite an Owner');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'x@test.example', 'viewer')$$, 'aal2'), '42501:insufficient_privilege', 'an Approver cannot invite');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'not-an-email', 'viewer')$$, 'aal2'), '22023:validation_failed%', 'invalid emails are rejected');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'jordan.ellis@northstar.example', 'viewer')$$, 'aal2'), '22023:validation_failed%', 'existing members cannot be invited again');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'boss@test.example', 'viewer')$$, 'aal2'), 'ok', 'inviting the same email again replaces the pending invitation');
select is((select count(*)::int from public.organization_invitations where email = 'boss@test.example' and status = 'pending'), 1, 'only one invitation per email is pending');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.issue_invitation_token((select id from public.organization_invitations limit 1))$$, 'aal2'), '42501:%', 'signed-in users cannot issue invitation tokens');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select * from public.describe_invitation('x')$$, 'aal2'), '42501:%', 'signed-in users cannot look up invitations by token');
select alike(pg_temp.as_anon($$select public.accept_invitation('x')$$), '42501:%', 'anonymous visitors cannot accept invitations');

-- The server issues the token (service role); only its hash is stored.
create temporary table tokens as
  select email::text as email, public.issue_invitation_token(id) as token
    from public.organization_invitations where status = 'pending' and email = 'new.processor@test.example';
select ok((select token ~ '^[0-9a-f]{64}$' from tokens), 'tokens are 256-bit random values');
select is(
  (select token_hash from public.organization_invitations where email = 'new.processor@test.example' and status = 'pending'),
  (select encode(sha256(convert_to(token, 'UTF8')), 'hex') from tokens),
  'only the SHA-256 of the token is stored');
select is(
  (select organization_slug || '/' || role::text || '/' || state from public.describe_invitation((select token from tokens))),
  'northstar/processor/pending', 'the server can describe an invitation from its link');

select is(pg_temp.as_user('00000000-0000-4000-c100-000000000002', format('select public.accept_invitation(%L)', (select token from tokens))), '42501:invitation_email_mismatch', 'a different account cannot use someone else''s invitation');
select is(pg_temp.as_user('00000000-0000-4000-c100-000000000001', format('select public.accept_invitation(%L)', (select token from tokens))), 'ok', 'the invited person accepts');
select is((select role::text || '/' || status::text from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001'), 'processor/active', 'they join with exactly the invited role');
select is((select count(*)::int from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-b000-000000000001'), 0, 'an invitation grants access only to its own workspace');
select is(pg_temp.as_user('00000000-0000-4000-c100-000000000001', format('select public.accept_invitation(%L)', (select token from tokens))), '55000:invitation_used', 'an invitation cannot be replayed');
select is(pg_temp.as_user('00000000-0000-4000-c100-000000000001', $$select public.accept_invitation('0000000000000000000000000000000000000000000000000000000000000000')$$), 'P0002:invitation_invalid', 'unknown tokens are rejected');

-- Expired, revoked and re-issued invitations.
do $$
declare v uuid;
begin
  v := (select id from public.organization_invitations where email = 'boss@test.example' and status = 'pending');
  insert into tokens select 'boss@test.example', public.issue_invitation_token(v);
end $$;
insert into auth.users (id, email) values ('00000000-0000-4000-c100-000000000003', 'boss@test.example');
update public.organization_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 minute' where email = 'boss@test.example' and status = 'pending';
select is(pg_temp.as_user('00000000-0000-4000-c100-000000000003', format('select public.accept_invitation(%L)', (select token from tokens where email = 'boss@test.example'))), '55000:invitation_expired', 'expired invitations are rejected');
select is((select state from public.describe_invitation((select token from tokens where email = 'boss@test.example'))), 'expired', 'the acceptance page sees the invitation as expired');
update public.organization_invitations set expires_at = now() + interval '1 day' where email = 'boss@test.example' and status = 'pending';
create temporary table old_token as select token from tokens where email = 'boss@test.example';
select ok((select public.issue_invitation_token(id) is not null from public.organization_invitations where email = 'boss@test.example' and status = 'pending'), 'a resend issues a new token');
select is(pg_temp.as_user('00000000-0000-4000-c100-000000000003', format('select public.accept_invitation(%L)', (select token from old_token))), 'P0002:invitation_invalid', 'a resent invitation invalidates the old link');
select is(pg_temp.as_user('00000000-0000-4000-b500-000000000002', $$select public.revoke_invitation((select id from public.organization_invitations where email = 'boss@test.example' and status = 'pending'))$$, 'aal2'), 'P0002:not_found', 'another workspace cannot revoke this invitation');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.revoke_invitation((select id from public.organization_invitations where email = 'boss@test.example' and status = 'pending'))$$, 'aal2'), 'ok', 'an Admin revokes an invitation');
select is((select count(*)::int from public.describe_invitation((select token from old_token))), 0, 'revoked links no longer resolve once re-issued');

-- A revoked invitation's live link stops working.
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'revoked.person@test.example', 'viewer')$$, 'aal2'), 'ok', 'an invitation to be revoked');
insert into tokens select email::text, public.issue_invitation_token(id) from public.organization_invitations where email = 'revoked.person@test.example' and status = 'pending';
insert into auth.users (id, email) values ('00000000-0000-4000-c100-000000000004', 'revoked.person@test.example');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.revoke_invitation((select id from public.organization_invitations where email = 'revoked.person@test.example' and status = 'pending'))$$, 'aal2'), 'ok', 'the invitation is revoked');
select is(pg_temp.as_user('00000000-0000-4000-c100-000000000004', format('select public.accept_invitation(%L)', (select token from tokens where email = 'revoked.person@test.example'))), '55000:invitation_revoked', 'a revoked invitation cannot be accepted');
select is((select state from public.describe_invitation((select token from tokens where email = 'revoked.person@test.example'))), 'revoked', 'the acceptance page sees the invitation as revoked');

-- Rate limiting
do $$
begin
  for i in 1..30 loop
    insert into public.organization_invitations (organization_id, email, role, expires_at, invited_by)
    values ('00000000-0000-4000-a000-000000000001', 'bulk' || i || '@test.example', 'viewer', now() + interval '7 days', '00000000-0000-4000-a500-000000000002');
  end loop;
end $$;
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.invite_member('00000000-0000-4000-a000-000000000001', 'one.more@test.example', 'viewer')$$, 'aal2'), '54000:rate_limited: too many invitations, try again later', 'invitations are rate-limited per workspace');

-- Membership management --------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'approver'), 'aal2'), 'ok', 'an Admin can change a member''s role');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'owner'), 'aal2'), '42501:insufficient_privilege', 'an Admin cannot grant the Owner role');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'viewer'), 'aal2'), '42501:insufficient_privilege', 'an Admin cannot change an Owner');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'viewer'), 'aal2'), '42501:insufficient_privilege', 'a Processor cannot change roles');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'admin'), 'aal1'), '42501:mfa_required', 'changing roles requires MFA');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'admin'), 'aal2'), '55000:last_owner: a workspace must keep at least one active Owner', 'the last Owner cannot be demoted');
select throws_ok($$update public.organization_members set status = 'suspended' where user_id = '00000000-0000-4000-a500-000000000001'$$, '55000', null, 'the last Owner cannot be suspended, even directly');
select throws_ok($$delete from public.organization_members where user_id = '00000000-0000-4000-a500-000000000001'$$, '55000', null, 'the last Owner cannot be removed, even directly');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000002' and organization_id = '00000000-0000-4000-a000-000000000001'), 'owner'), 'aal2'), 'ok', 'an Owner can promote another Owner');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'admin'), 'aal2'), 'ok', 'with a second Owner, the first can step down');
select ok((select mfa_required from public.profiles where id = '00000000-0000-4000-c100-000000000001') = false, 'a new Approver does not need MFA');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.change_member_role(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001'), 'admin'), 'aal2'), 'ok', 'promoting to Admin');
select ok((select mfa_required from public.profiles where id = '00000000-0000-4000-c100-000000000001'), 'promotion to Admin makes MFA mandatory');

select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.set_member_status(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000004' and organization_id = '00000000-0000-4000-a000-000000000001'), 'suspended'), 'aal2'), 'ok', 'a member can be suspended');
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000004', 'select count(*) from public.customers'), 0::bigint, 'a suspended member loses access immediately');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.set_member_status(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000002' and organization_id = '00000000-0000-4000-a000-000000000001'), 'suspended'), 'aal2'), '22023:validation_failed: you cannot suspend yourself', 'you cannot suspend yourself');
select is(pg_temp.as_user('00000000-0000-4000-b500-000000000002', format('select public.set_member_status(%L, %L)', (select id from public.organization_members where user_id = '00000000-0000-4000-a500-000000000004' and organization_id = '00000000-0000-4000-a000-000000000001'), 'active'), 'aal2'), 'P0002:not_found', 'another workspace cannot manage this member');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', format('select public.accept_invitation(%L)', 'x'), 'aal1'), 'P0002:invitation_invalid', 'a suspended member gains nothing from invalid tokens');
insert into public.organization_invitations (organization_id, email, role, token_hash, expires_at, invited_by)
values ('00000000-0000-4000-a000-000000000001', 'jordan.ellis@northstar.example', 'admin', encode(sha256(convert_to('rejoin-token', 'UTF8')), 'hex'), now() + interval '1 day', '00000000-0000-4000-a500-000000000002');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$select public.accept_invitation('rejoin-token')$$), '42501:membership_suspended', 'a suspended member cannot rejoin through an invitation');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', format('select public.remove_member(%L)', (select id from public.organization_members where user_id = '00000000-0000-4000-c100-000000000001' and organization_id = '00000000-0000-4000-a000-000000000001')), 'aal2'), 'ok', 'a member can be removed');
select is(pg_temp.count_as('00000000-0000-4000-c100-000000000001', 'select count(*) from public.customers'), 0::bigint, 'a removed member sees nothing');

-- Lost authenticator: operator procedure writes an audit record -----------------------
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.record_mfa_reset('00000000-0000-4000-a500-000000000001', 'x')$$, 'aal2'), '42501:%', 'only the server (operator) can record an MFA reset');
select public.record_mfa_reset('00000000-0000-4000-a500-000000000002', 'Verified by phone with the workspace Owner');
select is((select reason || '/' || (metadata ->> 'process') from public.audit_events where action = 'mfa.factor_removed' and entity_id = '00000000-0000-4000-a500-000000000002'),
  'Verified by phone with the workspace Owner/operator.mfa_reset', 'an MFA reset is audited with its reason');

select * from finish();
rollback;
