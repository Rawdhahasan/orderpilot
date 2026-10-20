-- OrderPilot Phase 2B · Migration 9: append-only and immutability protections.
-- docs/DATABASE_ARCHITECTURE.md §1 (facts are append-only, no hard deletes),
-- §6.3, §6.4 and §6.5. These triggers apply to every role, including the
-- service role, so a bug in any layer cannot rewrite history.

create function private.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows cannot be %d', tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
end
$$;

-- Ledger and integration events: insert only.
create trigger inventory_movements_no_update before update on public.inventory_movements
  for each row execute function private.reject_change();
create trigger inventory_movements_no_delete before delete on public.inventory_movements
  for each row execute function private.reject_change();
create trigger inventory_movements_no_truncate before truncate on public.inventory_movements
  for each statement execute function private.reject_change();

-- Business records are never hard-deleted (status fields instead).
create trigger customers_no_delete before delete on public.customers
  for each row execute function private.reject_change();
create trigger products_no_delete before delete on public.products
  for each row execute function private.reject_change();
create trigger source_documents_no_delete before delete on public.source_documents
  for each row execute function private.reject_change();
create trigger inbound_orders_no_delete before delete on public.inbound_orders
  for each row execute function private.reject_change();
create trigger inbound_order_lines_no_delete before delete on public.inbound_order_lines
  for each row execute function private.reject_change();
create trigger extraction_runs_no_delete before delete on public.extraction_runs
  for each row execute function private.reject_change();
create trigger order_exceptions_no_delete before delete on public.order_exceptions
  for each row execute function private.reject_change();
create trigger sales_orders_no_delete before delete on public.sales_orders
  for each row execute function private.reject_change();
create trigger sales_order_lines_no_delete before delete on public.sales_order_lines
  for each row execute function private.reject_change();
create trigger integration_outbox_no_delete before delete on public.integration_outbox
  for each row execute function private.reject_change();

-- A stored document never changes: its file, hash and metadata are fixed (PR-03).
create function private.protect_source_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.upload_status = 'stored' and (
       new.upload_status is distinct from old.upload_status
    or new.sha256 is distinct from old.sha256
    or new.size_bytes is distinct from old.size_bytes
    or new.mime_type is distinct from old.mime_type
    or new.page_count is distinct from old.page_count
    or new.original_filename is distinct from old.original_filename
    or new.uploaded_by is distinct from old.uploaded_by
    or new.stored_at is distinct from old.stored_at
  ) then
    raise exception 'a stored source document is immutable' using errcode = 'restrict_violation';
  end if;
  if old.upload_status = 'rejected' and new.upload_status is distinct from old.upload_status then
    raise exception 'a rejected upload cannot be reinstated' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;

create trigger source_documents_protect before update on public.source_documents
  for each row execute function private.protect_source_document();

-- Raw extraction output is written once and never changed.
create function private.protect_raw_output()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.raw_output is not null and new.raw_output is distinct from old.raw_output then
    raise exception 'raw extraction output is write-once' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;

create trigger extraction_runs_protect_raw_output before update on public.extraction_runs
  for each row execute function private.protect_raw_output();

-- Sales order lines are immutable. The only permitted change is recording,
-- once, that a backorder was handled externally (FR-SO-08).
create function private.protect_sales_order_line()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['backorder_handled_at', 'backorder_handled_by', 'backorder_handled_reason', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['backorder_handled_at', 'backorder_handled_by', 'backorder_handled_reason', 'updated_at']) then
    raise exception 'sales order lines are immutable' using errcode = 'restrict_violation';
  end if;
  if old.backorder_handled_at is not null then
    raise exception 'a backorder can be marked handled only once' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;

create trigger sales_order_lines_protect before update on public.sales_order_lines
  for each row execute function private.protect_sales_order_line();

-- Outbox events keep their content; only delivery bookkeeping changes.
create function private.protect_outbox_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.organization_id, new.event_type, new.aggregate_type, new.aggregate_id, new.payload, new.schema_version, new.created_at)
     is distinct from
     (old.organization_id, old.event_type, old.aggregate_type, old.aggregate_id, old.payload, old.schema_version, old.created_at) then
    raise exception 'integration events cannot be rewritten' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;

create trigger integration_outbox_protect before update on public.integration_outbox
  for each row execute function private.protect_outbox_event();

-- created_by and updated_by always reflect the signed-in user; callers cannot
-- set them to someone else, and created_by never changes.
create function private.stamp_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.created_by := v_actor;
      new.updated_by := v_actor;
    end if;
  else
    new.created_by := old.created_by;
    if v_actor is not null then
      new.updated_by := v_actor;
    end if;
  end if;
  return new;
end
$$;

create trigger organizations_stamp before insert or update on public.organizations
  for each row execute function private.stamp_actor();
create trigger organization_members_stamp before insert or update on public.organization_members
  for each row execute function private.stamp_actor();
create trigger customers_stamp before insert or update on public.customers
  for each row execute function private.stamp_actor();
create trigger customer_addresses_stamp before insert or update on public.customer_addresses
  for each row execute function private.stamp_actor();
create trigger products_stamp before insert or update on public.products
  for each row execute function private.stamp_actor();
create trigger customer_item_aliases_stamp before insert or update on public.customer_item_aliases
  for each row execute function private.stamp_actor();
create trigger customer_prices_stamp before insert or update on public.customer_prices
  for each row execute function private.stamp_actor();
create trigger locations_stamp before insert or update on public.locations
  for each row execute function private.stamp_actor();
create trigger inbound_orders_stamp before insert or update on public.inbound_orders
  for each row execute function private.stamp_actor();
create trigger inbound_order_lines_stamp before insert or update on public.inbound_order_lines
  for each row execute function private.stamp_actor();

revoke all on function private.reject_change() from public, anon, authenticated;
revoke all on function private.protect_source_document() from public, anon, authenticated;
revoke all on function private.protect_raw_output() from public, anon, authenticated;
revoke all on function private.protect_sales_order_line() from public, anon, authenticated;
revoke all on function private.protect_outbox_event() from public, anon, authenticated;
revoke all on function private.stamp_actor() from public, anon, authenticated;
