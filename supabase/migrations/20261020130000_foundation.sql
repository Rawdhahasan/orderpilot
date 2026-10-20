-- OrderPilot Phase 2A · Migration 1: schemas, extensions, helper functions,
-- shared types and global reference data.
-- docs/DATABASE_ARCHITECTURE.md §3 (conventions) and §5 (enumerated types).

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
-- `util`    pure, immutable helper functions used by generated columns and
--           checks. Not exposed through the Data API.
-- `private` security-sensitive helpers (added in Phase 2B). Not exposed.
create schema if not exists util;
create schema if not exists private;

revoke all on schema util from public, anon;
revoke all on schema private from public, anon, authenticated;
-- Generated columns and checks call util functions while signed-in users write.
grant usage on schema util to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Extensions (Supabase convention: installed in the `extensions` schema)
-- ---------------------------------------------------------------------------
create extension if not exists citext with schema extensions;     -- emails, slugs
create extension if not exists pg_trgm with schema extensions;    -- similarity search
create extension if not exists btree_gist with schema extensions; -- non-overlapping price ranges

-- ---------------------------------------------------------------------------
-- Pure helper functions (immutable, no table access)
-- ---------------------------------------------------------------------------

-- Uppercase, ASCII letters and digits only; NULL when nothing is left.
create function util.normalize_code(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select nullif(upper(regexp_replace(value, '[^A-Za-z0-9]', '', 'g')), '')
$$;

comment on function util.normalize_code(text) is
  'Normalises identifiers for matching: uppercase ASCII letters and digits only.';

-- PO number normalisation, fixed rule (C-02, Q-3): normalise_code, then remove
-- a leading "PO" when it is followed by a digit. PO-88213, po 88213 and 88213
-- all become 88213.
create function util.normalize_po_number(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case
    when util.normalize_code(value) ~ '^PO[0-9]' then substr(util.normalize_code(value), 3)
    else util.normalize_code(value)
  end
$$;

comment on function util.normalize_po_number(text) is
  'Fixed PO number normalisation rule (approved C-02 / Q-3). Not configurable per workspace.';

-- Ship-to matching key: normalised first address line and postal code.
create function util.address_match_key(line1 text, postal_code text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(util.normalize_code(line1), '') || '|' || coalesce(util.normalize_code(postal_code), '')
$$;

-- GTIN-8, GTIN-12, GTIN-13 and GTIN-14 check digit (GS1 mod-10).
create function util.gtin_is_valid(value text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  digits text := value;
  total integer := 0;
  position_from_right integer := 0;
  digit integer;
  i integer;
begin
  if digits !~ '^([0-9]{8}|[0-9]{12,14})$' then
    return false;
  end if;
  -- Every digit except the last (the check digit), weighted 3,1,3,1… from the right.
  for i in reverse length(digits) - 1 .. 1 loop
    position_from_right := position_from_right + 1;
    digit := substr(digits, i, 1)::integer;
    total := total + digit * case when position_from_right % 2 = 1 then 3 else 1 end;
  end loop;
  return (10 - total % 10) % 10 = substr(digits, length(digits), 1)::integer;
end
$$;

-- Trims and rejects empty strings: true when a reason or note has content.
create function util.has_text(value text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select value is not null and length(btrim(value)) > 0
$$;

revoke all on all functions in schema util from public, anon;
grant execute on all functions in schema util to authenticated, service_role;

-- updated_at maintenance for every table that has the column.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enumerated types (DATABASE_ARCHITECTURE.md §5)
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'approver', 'processor', 'inventory_manager', 'viewer');
create type public.member_status as enum ('active', 'suspended');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.customer_status as enum ('active', 'on_hold', 'inactive');
create type public.address_type as enum ('billing', 'shipping');
create type public.product_status as enum ('active', 'discontinued');
create type public.upload_status as enum ('pending', 'stored', 'rejected');
create type public.inbound_order_status as enum (
  'received', 'extracting', 'extraction_failed', 'in_review',
  'pending_approval', 'approved', 'rejected', 'cancelled'
);
create type public.extraction_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.exception_code as enum (
  'UNCONFIRMED_FIELDS', 'CUSTOMER_UNMATCHED', 'CUSTOMER_ON_HOLD', 'CUSTOMER_INACTIVE',
  'PO_NUMBER_MISSING', 'DUPLICATE_PO_NUMBER', 'DUPLICATE_DOCUMENT', 'POSSIBLE_DUPLICATE',
  'SHIP_TO_MISSING', 'SHIP_TO_NOT_ON_FILE', 'CURRENCY_MISMATCH', 'DATE_AMBIGUOUS',
  'REQUESTED_DATE_PAST', 'TOTAL_MISMATCH', 'PRODUCT_UNMATCHED', 'PRODUCT_DISCONTINUED',
  'QUANTITY_INVALID', 'UOM_MISMATCH', 'PRICE_MISMATCH', 'PRICE_MISSING',
  'DUPLICATE_LINE', 'INSUFFICIENT_STOCK'
);
create type public.exception_severity as enum ('blocking', 'warning');
create type public.exception_status as enum ('open', 'resolved', 'acknowledged', 'overridden');
create type public.cancel_reason as enum ('duplicate', 'not_a_purchase_order', 'sent_in_error', 'other');
create type public.sales_order_status as enum ('confirmed', 'fulfilled', 'cancelled');
create type public.movement_type as enum ('receipt', 'adjustment', 'reservation', 'reservation_release', 'issue');
create type public.adjustment_reason as enum ('opening_balance', 'cycle_count', 'damaged', 'lost', 'found', 'correction');
create type public.price_source as enum ('po_price', 'customer_price', 'list_price');
create type public.match_method as enum ('alias', 'sku', 'gtin', 'description', 'manual');

-- Exceptions an Approver may override (PRODUCT_REQUIREMENTS.md §9, D-34).
-- Every other code must be fixed before submission.
create function util.exception_is_overridable(code public.exception_code)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select code in (
    'CUSTOMER_ON_HOLD'::public.exception_code,
    'PO_NUMBER_MISSING'::public.exception_code,
    'DUPLICATE_PO_NUMBER'::public.exception_code,
    'DUPLICATE_DOCUMENT'::public.exception_code
  )
$$;

revoke all on function util.exception_is_overridable(public.exception_code) from public, anon;
grant execute on function util.exception_is_overridable(public.exception_code) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Global reference data (read-only, not tenant data)
-- ---------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null check (util.has_text(name)),
  -- Digits after the decimal point for final monetary totals (Q-5).
  minor_unit smallint not null check (minor_unit between 0 and 4)
);

comment on table public.currencies is 'ISO 4217 currencies supported as workspace base currency (D-12).';

insert into public.currencies (code, name, minor_unit) values
  ('USD', 'US dollar', 2),
  ('GBP', 'Pound sterling', 2),
  ('CAD', 'Canadian dollar', 2),
  ('EUR', 'Euro', 2);

create table public.uom_codes (
  code text primary key check (code ~ '^[A-Z0-9]{1,6}$'),
  name text not null check (util.has_text(name)),
  un_ece_code text check (un_ece_code ~ '^[A-Z0-9]{2,3}$')
);

comment on table public.uom_codes is 'Units of measure. UN/ECE Recommendation 20 codes are filled in only where verified; packaging units are left empty until the EDI phase confirms them.';

insert into public.uom_codes (code, name, un_ece_code) values
  ('EA', 'Each', 'EA'),
  ('CS', 'Case', null),
  ('BX', 'Box', null),
  ('PK', 'Pack', null),
  ('DZ', 'Dozen', 'DZN'),
  ('PR', 'Pair', 'PR'),
  ('KG', 'Kilogram', 'KGM'),
  ('G', 'Gram', 'GRM'),
  ('LB', 'Pound', 'LBR'),
  ('OZ', 'Ounce', 'ONZ'),
  ('L', 'Litre', 'LTR'),
  ('GAL', 'Gallon (US)', 'GLL'),
  ('M', 'Metre', 'MTR'),
  ('FT', 'Foot', 'FOT'),
  ('RL', 'Roll', null),
  ('BG', 'Bag', null),
  ('PL', 'Pallet', null);
