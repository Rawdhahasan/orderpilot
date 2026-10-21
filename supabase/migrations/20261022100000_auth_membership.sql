-- OrderPilot Phase 2C · Migration 12: authentication, MFA enforcement,
-- invitations and membership management.
-- Approved D-03 (invite-only) and D-24 (TOTP MFA mandatory for Owners and Admins).

-- ---------------------------------------------------------------------------
-- Profiles follow auth.users
-- ---------------------------------------------------------------------------
create function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, full_name, email)
    values (
      new.id,
      left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'New user'), 120),
      coalesce(new.email, '')
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end
$$;

create trigger on_auth_user_change
  after insert or update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- ---------------------------------------------------------------------------
-- MFA enforced by the database (D-24): an Owner or Admin acting without an
-- MFA-verified session (AAL2) holds no write or management permission. They
-- can still read their workspace while they complete MFA.
-- ---------------------------------------------------------------------------
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
       or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     )
$$;

-- Profiles show whether MFA is mandatory for the person (any Owner/Admin role).
create function private.sync_mfa_required()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p
     set mfa_required = exists (
       select 1 from public.organization_members m
        where m.user_id = v_user and m.status = 'active' and m.role in ('owner', 'admin')
     )
   where p.id = v_user;
  return null;
end
$$;

create trigger organization_members_sync_mfa
  after insert or update or delete on public.organization_members
  for each row execute function private.sync_mfa_required();

update public.profiles p
   set mfa_required = exists (
     select 1 from public.organization_members m
      where m.user_id = p.id and m.status = 'active' and m.role in ('owner', 'admin')
   );

-- ---------------------------------------------------------------------------
-- A workspace always keeps at least one active Owner (FR-ORG-04).
-- ---------------------------------------------------------------------------
create function private.ensure_active_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
begin
  if not exists (
    select 1 from public.organization_members m
     where m.organization_id = v_org and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'last_owner: a workspace must keep at least one active Owner'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return null;
end
$$;

create trigger organization_members_keep_owner
  after insert or update or delete on public.organization_members
  for each row execute function private.ensure_active_owner();

-- ---------------------------------------------------------------------------
-- Invitations. Tokens are issued only by the server (service role) so that no
-- end user, including the inviting admin, can obtain a usable token through
-- the API. The database stores only the SHA-256 hash.
-- ---------------------------------------------------------------------------
alter table public.organization_invitations alter column token_hash drop not null;
alter table public.organization_invitations
  add constraint organization_invitations_pending_token
  check (status <> 'accepted' or token_hash is not null);

-- Admins can list invitations but never see token hashes.
revoke select on public.organization_invitations from authenticated;
grant select (id, organization_id, email, role, status, expires_at, invited_by, accepted_by, accepted_at, created_at, updated_at)
  on public.organization_invitations to authenticated;

create function private.member_role_of(p_organization_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
   where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active'
$$;

-- Invite a person to a workspace (FR-ORG-03). Owner or Admin with MFA; only an
-- Owner can invite another Owner. Re-inviting replaces a pending invitation.
create function public.invite_member(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  perform private.assert_permission(p_organization_id, 'member.manage');
  perform private.assert_aal2();
  if p_role = 'owner' then
    perform private.assert_permission(p_organization_id, 'owner.grant');
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'validation_failed: invalid email address' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
     where m.organization_id = p_organization_id and lower(p.email::text) = v_email
  ) then
    raise exception 'validation_failed: already a member of this workspace' using errcode = 'invalid_parameter_value';
  end if;
  -- Abuse protection: at most 30 invitations per workspace per hour.
  if (select count(*) from public.organization_invitations i
       where i.organization_id = p_organization_id and i.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited: too many invitations, try again later' using errcode = 'program_limit_exceeded';
  end if;

  update public.organization_invitations
     set status = 'revoked'
   where organization_id = p_organization_id and email = v_email and status = 'pending';

  insert into public.organization_invitations (organization_id, email, role, expires_at, invited_by)
  values (p_organization_id, v_email, p_role, now() + interval '7 days', auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- Server only: issue the one-time token for an invitation email. Returns the
-- token once; only its hash is stored. Calling it again invalidates the old link.
create function public.issue_invitation_token(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.organization_invitations
     set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
         expires_at = now() + interval '7 days'
   where id = p_invitation_id and status = 'pending';
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  return v_token;
end
$$;

-- Server only: what an invitation link refers to, for the acceptance page.
create function public.describe_invitation(p_token text)
returns table (invitation_id uuid, organization_name text, organization_slug text, email text, role public.member_role, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, o.name, o.slug::text, i.email::text, i.role,
         case
           when i.status = 'pending' and i.expires_at <= now() then 'expired'
           else i.status::text
         end
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- Accept an invitation as the signed-in user (FR-AUTH-03). Single use; the
-- signed-in email must match the invitation; expired or revoked links fail.
create function public.accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invitations;
  v_email text;
  v_slug text;
  v_existing public.organization_members;
begin
  if auth.uid() is null then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
  select * into v_inv from public.organization_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception 'invitation_invalid' using errcode = 'no_data_found';
  end if;
  if v_inv.status = 'accepted' then
    raise exception 'invitation_used' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_inv.status in ('revoked', 'expired') then
    raise exception 'invitation_%', v_inv.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'object_not_in_prerequisite_state';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is distinct from lower(v_inv.email::text) then
    raise exception 'invitation_email_mismatch' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from public.organization_members
   where organization_id = v_inv.organization_id and user_id = auth.uid();
  if found and v_existing.status = 'suspended' then
    raise exception 'membership_suspended' using errcode = 'insufficient_privilege';
  end if;
  if not found then
    insert into public.organization_members (organization_id, user_id, role, invited_by)
    values (v_inv.organization_id, auth.uid(), v_inv.role, v_inv.invited_by);
  end if;

  update public.organization_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;

  select o.slug::text into v_slug from public.organizations o where o.id = v_inv.organization_id;
  return v_slug;
end
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_status public.invitation_status;
begin
  select organization_id, status into v_org, v_status
    from public.organization_invitations where id = p_invitation_id for update;
  if not found or not private.is_member(v_org) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_permission(v_org, 'member.manage');
  perform private.assert_aal2();
  if v_status <> 'pending' then
    raise exception 'invalid_state' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.organization_invitations set status = 'revoked' where id = p_invitation_id;
end
$$;

-- Shared checks for changing someone's membership.
create function private.assert_can_manage_member(p_member public.organization_members, p_new_role public.member_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_permission(p_member.organization_id, 'member.manage');
  perform private.assert_aal2();
  -- Only an Owner can grant, remove or change the Owner role, or manage an Owner.
  if p_member.role = 'owner' or p_new_role = 'owner' then
    perform private.assert_permission(p_member.organization_id, 'owner.grant');
  end if;
end
$$;

create function public.change_member_role(p_member_id uuid, p_role public.member_role)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
begin
  select * into v_member from public.organization_members where id = p_member_id for update;
  if not found or not private.is_member(v_member.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_can_manage_member(v_member, p_role);
  if p_role = v_member.role then
    raise exception 'invalid_state' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.organization_members set role = p_role where id = p_member_id returning * into v_member;
  return v_member;
end
$$;

create function public.set_member_status(p_member_id uuid, p_status public.member_status)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
begin
  select * into v_member from public.organization_members where id = p_member_id for update;
  if not found or not private.is_member(v_member.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_can_manage_member(v_member, v_member.role);
  if v_member.user_id = auth.uid() then
    raise exception 'validation_failed: you cannot suspend yourself' using errcode = 'invalid_parameter_value';
  end if;
  if p_status = v_member.status then
    raise exception 'invalid_state' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.organization_members set status = p_status where id = p_member_id returning * into v_member;
  return v_member;
end
$$;

create function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
begin
  select * into v_member from public.organization_members where id = p_member_id for update;
  if not found or not private.is_member(v_member.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_can_manage_member(v_member, v_member.role);
  if v_member.user_id = auth.uid() then
    raise exception 'validation_failed: you cannot remove yourself' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.organization_members where id = p_member_id;
end
$$;

-- Operator procedure for a lost authenticator (FR-AUTH-09): the operator script
-- removes the factor with the Auth admin API, then records it here.
create function public.record_mfa_reset(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not util.has_text(p_reason) then
    raise exception 'validation_failed: a reason is required' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('orderpilot.process', 'operator.mfa_reset', true);
  for v_org in select organization_id from public.organization_members where user_id = p_user_id loop
    perform private.write_audit(v_org, 'mfa.factor_removed', 'member', p_user_id::text, null, null, null, p_reason);
  end loop;
end
$$;

revoke all on function private.handle_auth_user_change() from public, anon, authenticated;
revoke all on function private.sync_mfa_required() from public, anon, authenticated;
revoke all on function private.ensure_active_owner() from public, anon, authenticated;
revoke all on function private.member_role_of(uuid) from public, anon, authenticated;
revoke all on function private.assert_can_manage_member(public.organization_members, public.member_role) from public, anon, authenticated;

revoke all on function public.invite_member(uuid, text, public.member_role) from public, anon;
revoke all on function public.issue_invitation_token(uuid) from public, anon, authenticated;
revoke all on function public.describe_invitation(text) from public, anon, authenticated;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.change_member_role(uuid, public.member_role) from public, anon;
revoke all on function public.set_member_status(uuid, public.member_status) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.record_mfa_reset(uuid, text) from public, anon, authenticated;

grant execute on function public.invite_member(uuid, text, public.member_role) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.change_member_role(uuid, public.member_role) to authenticated;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.issue_invitation_token(uuid) to service_role;
grant execute on function public.describe_invitation(text) to service_role;
grant execute on function public.record_mfa_reset(uuid, text) to service_role;

-- Clear error for Owners and Admins who have not completed MFA: the action is
-- allowed for their role, but only with an MFA-verified session.
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
       and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      raise exception 'mfa_required' using errcode = 'insufficient_privilege';
    end if;
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
end
$$;

revoke all on function private.assert_permission(uuid, text) from public, anon, authenticated;
