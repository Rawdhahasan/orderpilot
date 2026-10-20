-- OrderPilot Phase 2A · Migration 2: identity and workspaces.
-- docs/DATABASE_ARCHITECTURE.md §6.1.
--
-- Not in this migration (later milestones):
--   * profile creation trigger on auth.users and email sync      → Phase 2C
--   * last-active-Owner guard and membership workflow functions  → Phase 2C
--   * Owner-only rule for turning off independent approval (D-05) → Phase 2B/2C (update_workspace_settings)
--   * RLS policies and grants                                    → Phase 2B

-- One row per authenticated user. Users are never hard-deleted while they
-- appear in business records; erasure pseudonymises the profile (D-27).
create table public.profiles (
  id uuid primary key references auth.users (id),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email extensions.citext not null check (length(email) <= 320),
  mfa_required boolean not null default false,
  pseudonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  legal_name text check (legal_name is null or length(btrim(legal_name)) between 1 and 200),
  slug extensions.citext not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  base_currency char(3) not null references public.currencies (code),
  timezone text not null check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'),
  locale text not null default 'en-US' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  sales_order_prefix text not null default 'SO' check (sales_order_prefix ~ '^[A-Z0-9]{1,6}$'),
  -- D-05: on by default; only the Owner may turn it off (enforced by the settings function).
  require_independent_approval boolean not null default true,
  price_tolerance_pct numeric(5, 2) not null default 0 check (price_tolerance_pct between 0 and 100),
  confidence_threshold numeric(3, 2) not null default 0.85 check (confidence_threshold between 0 and 1),
  duplicate_lookback_days integer not null default 30 check (duplicate_lookback_days between 1 and 365),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

comment on column public.organizations.require_independent_approval is
  'D-05: the submitter of an intake cannot approve it. Only an Owner may turn this off; the change is audited.';

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references public.profiles (id),
  role public.member_role not null,
  status public.member_status not null default 'active',
  invited_by uuid references public.profiles (id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

-- Membership checks in RLS look up the current user first (Phase 2B).
create index organization_members_user_idx on public.organization_members (user_id, status, organization_id, role);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  email extensions.citext not null check (length(email) <= 320),
  role public.member_role not null,
  -- SHA-256 of a random token; the token itself exists only in the email link.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid not null references public.profiles (id),
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (expires_at > created_at),
  check ((status = 'accepted') = (accepted_by is not null and accepted_at is not null))
);

create unique index organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';
create index organization_invitations_invited_by_idx on public.organization_invitations (invited_by);
create index organization_invitations_accepted_by_idx on public.organization_invitations (accepted_by);

-- Gap-free per-workspace counters (D-21). Locked with SELECT … FOR UPDATE inside
-- the transaction that consumes a number, so a rollback returns the number.
create table public.document_sequences (
  organization_id uuid not null references public.organizations (id),
  sequence_name text not null check (sequence_name in ('inbound_order', 'sales_order')),
  period integer not null default 0 check (period >= 0),
  next_value bigint not null default 1 check (next_value >= 1),
  primary key (organization_id, sequence_name, period)
);

comment on table public.document_sequences is
  'D-21: gap-free numbering. period is the year for yearly sequences (sales orders), 0 otherwise.';

-- Foreign keys from audit columns are indexed so profile lookups stay fast.
create index organizations_created_by_idx on public.organizations (created_by);
create index organizations_updated_by_idx on public.organizations (updated_by);
create index organizations_base_currency_idx on public.organizations (base_currency);
create index organization_members_invited_by_idx on public.organization_members (invited_by);
create index organization_members_created_by_idx on public.organization_members (created_by);
create index organization_members_updated_by_idx on public.organization_members (updated_by);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function private.set_updated_at();
create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function private.set_updated_at();
