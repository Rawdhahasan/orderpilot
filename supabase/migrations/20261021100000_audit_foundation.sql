-- OrderPilot Phase 2B · Migration 8: audit foundation.
-- docs/DATABASE_ARCHITECTURE.md §6.7 and §13.
--
-- * audit_events: immutable for every role (no update, delete or truncate).
-- * private.audit_row_change(): generic row trigger that records field-level
--   changes on audited tables, with actor, request ID and an optional reason
--   set by workflow functions (orderpilot.audit_reason).
-- Business events with domain meaning (inbound_order.approved, …) are written by
-- the Phase 2D workflow functions through private.write_audit().

-- Functions created in private are never executable by PUBLIC by default.
alter default privileges in schema private revoke execute on functions from public;

create type public.actor_type as enum ('user', 'system');

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_type public.actor_type not null,
  -- Not a foreign key, so records survive user pseudonymisation (D-27).
  actor_user_id uuid,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (entity_type ~ '^[a-z_]+$'),
  entity_id text not null check (length(entity_id) between 1 and 64),
  parent_entity_type text check (parent_entity_type is null or parent_entity_type ~ '^[a-z_]+$'),
  parent_entity_id text check (parent_entity_id is null or length(parent_entity_id) between 1 and 64),
  -- {"field": [old, new]}
  changes jsonb check (changes is null or jsonb_typeof(changes) = 'object'),
  reason text check (reason is null or length(reason) <= 2000),
  metadata jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),
  request_id text check (request_id is null or request_id ~ '^[A-Za-z0-9-]{1,64}$'),
  check ((actor_type = 'user') = (actor_user_id is not null))
);

create index audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (organization_id, entity_type, entity_id);
create index audit_events_parent_idx on public.audit_events (organization_id, parent_entity_id);

comment on table public.audit_events is
  'Immutable audit trail (PR-04). No role may update, delete or truncate it; retention (D-22) will use a documented, audited procedure.';

-- Request ID sent by the application as the x-request-id header (PostgREST
-- exposes request headers to Postgres). Malformed values are ignored.
create function private.request_id()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when value ~ '^[A-Za-z0-9-]{1,64}$' then value
  end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-request-id' as value) h
$$;

-- Writes one audit event. SECURITY DEFINER because no API role may insert into
-- audit_events directly.
create function private.write_audit(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_parent_entity_type text default null,
  p_parent_entity_id text default null,
  p_changes jsonb default null,
  p_reason text default null,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_process text := nullif(current_setting('orderpilot.process', true), '');
begin
  insert into public.audit_events
    (organization_id, actor_type, actor_user_id, action, entity_type, entity_id,
     parent_entity_type, parent_entity_id, changes, reason, metadata, request_id)
  values
    (p_organization_id,
     case when v_actor is null then 'system'::public.actor_type else 'user'::public.actor_type end,
     v_actor, p_action, p_entity_type, p_entity_id, p_parent_entity_type, p_parent_entity_id,
     p_changes, coalesce(p_reason, nullif(current_setting('orderpilot.audit_reason', true), '')),
     case when v_process is null then p_metadata else coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('process', v_process) end,
     private.request_id());
end
$$;

revoke all on function private.write_audit(uuid, text, text, text, text, text, jsonb, text, jsonb) from public, anon, authenticated;

-- Generic row trigger. Arguments: entity_type, [parent_entity_type, parent_column].
-- Records inserts and deletes as snapshots and updates as field-level diffs.
-- Derived, bookkeeping and secret columns are never recorded.
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_ignored text[] := array[
    'created_at', 'updated_at', 'created_by', 'updated_by', 'version',
    'token_hash', 'raw_output',
    'account_number_normalized', 'sku_normalized', 'customer_part_number_normalized',
    'customer_po_number_normalized', 'match_key', 'storage_path', 'available',
    'authorizes_duplicate', 'duplicate_override', 'duplicate_override_marker'
  ];
  v_changes jsonb;
  v_entity_type text := tg_argv[0];
  v_parent_type text := case when tg_nargs > 1 then tg_argv[1] end;
  v_parent_column text := case when tg_nargs > 2 then tg_argv[2] end;
  v_org uuid := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> 'organization_id')::uuid end;
  v_entity_id text := coalesce(v_row ->> 'id', v_row ->> 'product_id');
  v_verb text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(v_old -> n.key, n.value))
      into v_changes
      from jsonb_each(v_new) n
     where n.key <> all (v_ignored)
       and (v_old -> n.key) is distinct from n.value;
    if v_changes is null then
      return null; -- nothing meaningful changed
    end if;
  else
    select jsonb_object_agg(r.key, case when tg_op = 'INSERT' then jsonb_build_array(null, r.value) else jsonb_build_array(r.value, null) end)
      into v_changes
      from jsonb_each(v_row) r
     where r.key <> all (v_ignored)
       and r.value <> 'null'::jsonb;
  end if;

  perform private.write_audit(
    v_org,
    v_entity_type || '.' || v_verb,
    v_entity_type,
    v_entity_id,
    v_parent_type,
    case when v_parent_column is not null then v_row ->> v_parent_column end,
    v_changes
  );
  return null;
end
$$;

revoke all on function private.audit_row_change() from public, anon, authenticated;

-- Audit records can never be changed or removed, by any role.
create function private.reject_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only' using errcode = 'restrict_violation';
end
$$;

revoke all on function private.reject_audit_change() from public, anon, authenticated;

create trigger audit_events_no_update before update on public.audit_events
  for each row execute function private.reject_audit_change();
create trigger audit_events_no_delete before delete on public.audit_events
  for each row execute function private.reject_audit_change();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.reject_audit_change();

alter table public.audit_events enable row level security;

-- Attach the generic trigger to every audited table.
create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function private.audit_row_change('organization');
create trigger organization_members_audit after insert or update or delete on public.organization_members
  for each row execute function private.audit_row_change('member');
create trigger organization_invitations_audit after insert or update or delete on public.organization_invitations
  for each row execute function private.audit_row_change('invitation');
create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function private.audit_row_change('customer');
create trigger customer_addresses_audit after insert or update or delete on public.customer_addresses
  for each row execute function private.audit_row_change('customer_address', 'customer', 'customer_id');
create trigger products_audit after insert or update or delete on public.products
  for each row execute function private.audit_row_change('product');
create trigger customer_item_aliases_audit after insert or update or delete on public.customer_item_aliases
  for each row execute function private.audit_row_change('customer_item_alias', 'customer', 'customer_id');
create trigger customer_prices_audit after insert or update or delete on public.customer_prices
  for each row execute function private.audit_row_change('customer_price', 'customer', 'customer_id');
create trigger locations_audit after insert or update or delete on public.locations
  for each row execute function private.audit_row_change('location');
create trigger inventory_movements_audit after insert on public.inventory_movements
  for each row execute function private.audit_row_change('inventory_movement', 'product', 'product_id');
create trigger source_documents_audit after insert or update or delete on public.source_documents
  for each row execute function private.audit_row_change('source_document');
create trigger inbound_orders_audit after insert or update or delete on public.inbound_orders
  for each row execute function private.audit_row_change('inbound_order');
create trigger inbound_order_lines_audit after insert or update or delete on public.inbound_order_lines
  for each row execute function private.audit_row_change('inbound_order_line', 'inbound_order', 'inbound_order_id');
create trigger extraction_runs_audit after insert or update or delete on public.extraction_runs
  for each row execute function private.audit_row_change('extraction_run', 'inbound_order', 'inbound_order_id');
create trigger order_exceptions_audit after insert or update or delete on public.order_exceptions
  for each row execute function private.audit_row_change('exception', 'inbound_order', 'inbound_order_id');
create trigger sales_orders_audit after insert or update or delete on public.sales_orders
  for each row execute function private.audit_row_change('sales_order');
create trigger sales_order_lines_audit after insert or update or delete on public.sales_order_lines
  for each row execute function private.audit_row_change('sales_order_line', 'sales_order', 'sales_order_id');
