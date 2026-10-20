-- Audit trail, append-only protections and actor stamping
-- (TESTING_STRATEGY.md §5.6, §5.8; DATABASE_ARCHITECTURE.md §13).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

-- Run SQL as a signed-in user (authenticated role + JWT claims), returning
-- 'ok' or 'SQLSTATE:message'.
create function pg_temp.as_user(p_user uuid, p_sql text, p_aal text default 'aal1') returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
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
create function pg_temp.count_as(p_user uuid, p_sql text) returns bigint language plpgsql as $$
declare v bigint; e text; m text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
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


-- Audit capture ------------------------------------------------------------------------
-- The application sends x-request-id; PostgREST exposes it as request.headers.
select set_config('request.headers', '{"x-request-id": "req-2b-0001"}', true);
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004',
  $$insert into public.customers (organization_id, name, notes) values ('00000000-0000-4000-a000-000000000001', 'Audit Test Co', 'first')$$),
  'ok', 'Processor creates a customer');
select is(
  (select actor_type::text || '/' || actor_user_id::text || '/' || request_id || '/' || organization_id::text
     from public.audit_events where action = 'customer.created' and entity_id = (select id::text from public.customers where name = 'Audit Test Co')),
  'user/00000000-0000-4000-a500-000000000004/req-2b-0001/00000000-0000-4000-a000-000000000001',
  'creation is recorded with the actor, request ID and workspace');
select is(
  (select changes -> 'name' from public.audit_events where action = 'customer.created' and entity_id = (select id::text from public.customers where name = 'Audit Test Co')),
  '[null, "Audit Test Co"]'::jsonb,
  'creation records the new values');
select ok(
  (select not (changes ?| array['created_at', 'updated_at', 'created_by', 'version', 'account_number_normalized'])
     from public.audit_events where action = 'customer.created' and entity_id = (select id::text from public.customers where name = 'Audit Test Co')),
  'bookkeeping and derived columns are not recorded');

select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004',
  $$update public.customers set notes = 'second' where id = (select id from public.customers where name = 'Audit Test Co')$$), 'ok', 'Processor edits the customer');
select is(
  (select changes from public.audit_events where action = 'customer.updated' and entity_id = (select id::text from public.customers where name = 'Audit Test Co')),
  '{"notes": ["first", "second"]}'::jsonb,
  'an update records exactly the field that changed, with old and new values');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004',
  $$update public.customers set notes = 'second' where id = (select id from public.customers where name = 'Audit Test Co')$$), 'ok', 'a no-op update');
select is(
  (select count(*)::int from public.audit_events where action = 'customer.updated' and entity_id = (select id::text from public.customers where name = 'Audit Test Co')),
  1, 'an update that changes nothing writes no audit event');

select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003',
  $$select public.set_customer_status((select id from public.customers where name = 'Audit Test Co'), 'on_hold', 'Overdue invoices')$$), 'ok', 'Approver places a hold');
select is(
  (select reason || '/' || (changes -> 'status' ->> 1) from public.audit_events
    where action = 'customer.updated' and entity_id = (select id::text from public.customers where name = 'Audit Test Co') and changes ? 'status'),
  'Overdue invoices/on_hold',
  'role-checked functions record their reason with the change');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002',
  $$select public.set_product_price('00000000-0000-4000-a400-000000000003', 39.0000, 'Supplier increase')$$), 'ok', 'Admin changes a price');
select is(
  (select changes -> 'list_price' from public.audit_events where action = 'product.updated' and entity_id = '00000000-0000-4000-a400-000000000003'),
  '[38.5000, 39.0000]'::jsonb,
  'price changes are audited with old and new values (FR-PROD-04)');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001',
  $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"require_independent_approval": false}')$$, 'aal2'), 'ok', 'Owner turns off independent approval');
select is(
  (select actor_user_id::text || '/' || (changes -> 'require_independent_approval')::text from public.audit_events
    where action = 'organization.updated' and changes ? 'require_independent_approval'),
  '00000000-0000-4000-a500-000000000001/[true, false]',
  'turning off independent approval writes an audit record (D-05)');

insert into public.organization_invitations (organization_id, email, role, token_hash, expires_at, invited_by)
values ('00000000-0000-4000-a000-000000000001', 'new.person@test.example', 'viewer', repeat('c', 64), now() + interval '7 days', '00000000-0000-4000-a500-000000000002');
select ok(
  (select not (changes ? 'token_hash') and changes ? 'email' from public.audit_events where action = 'invitation.created'),
  'invitation token hashes are never written to the audit trail');
select is(
  (select actor_type::text from public.audit_events where action = 'invitation.created'),
  'system', 'changes without a signed-in user are recorded as system actions');

-- Who can read the audit log ------------------------------------------------------------
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000004', 'select count(*) from public.audit_events'), 0::bigint, 'Processors cannot read the workspace audit log');
select ok(pg_temp.count_as('00000000-0000-4000-a500-000000000003', 'select count(*) from public.audit_events') > 0, 'Approvers can read their workspace audit log');
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000003',
  $$select count(*) from public.audit_events where organization_id = '00000000-0000-4000-b000-000000000001'$$), 0::bigint, 'Approvers cannot read other workspaces'' audit logs');

-- Audit records are immutable, even for the database owner ----------------------------
select throws_ok($$update public.audit_events set reason = 'edited'$$, '23001', null, 'audit events cannot be updated');
select throws_ok($$delete from public.audit_events$$, '23001', null, 'audit events cannot be deleted');
select throws_ok($$truncate public.audit_events$$, '23001', null, 'audit events cannot be truncated');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$delete from public.audit_events$$), '42501:%', 'signed-in users have no delete access to audit events');

-- Append-only ledger and immutable history ------------------------------------------
select throws_ok($$update public.inventory_movements set reference = 'edited'$$, '23001', null, 'stock movements cannot be updated');
select throws_ok($$delete from public.inventory_movements$$, '23001', null, 'stock movements cannot be deleted');
select throws_ok($$truncate public.inventory_movements cascade$$, '23001', null, 'stock movements cannot be truncated');
select throws_ok($$delete from public.customers where id = '00000000-0000-4000-a200-000000000004'$$, '23001', null, 'customers are never hard-deleted');
select throws_ok($$delete from public.products where id = '00000000-0000-4000-a400-000000000006'$$, '23001', null, 'products are never hard-deleted');

-- Fixture: a stored document, intake, extraction run, sales order with a backorder, outbox event.
do $$
declare v_line uuid := '00000000-0000-4000-d200-000000000003';
begin
  insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
  values ('00000000-0000-4000-d200-000000000001', '00000000-0000-4000-a000-000000000001', 'po.pdf', 'application/pdf', 100, 1, repeat('d', 64), 'stored', '00000000-0000-4000-a500-000000000004', now());
  insert into public.inbound_orders (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number, submitted_by, submitted_at)
  values ('00000000-0000-4000-d200-000000000002', '00000000-0000-4000-a000-000000000001', 'IN-930001', '00000000-0000-4000-d200-000000000001', 'pending_approval',
          '00000000-0000-4000-a200-000000000002', 'NG-1', '00000000-0000-4000-a500-000000000004', now());
  insert into public.inbound_order_lines (id, organization_id, inbound_order_id, line_no)
  values (v_line, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d200-000000000002', 1);
  insert into public.extraction_runs (id, organization_id, inbound_order_id, source_document_id, provider)
  values ('00000000-0000-4000-d200-000000000004', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d200-000000000002', '00000000-0000-4000-d200-000000000001', 'simulated');
  insert into public.sales_orders (id, organization_id, order_number, inbound_order_id, customer_id, customer_po_number, currency, ship_to, subtotal, approved_by, approved_at)
  values ('00000000-0000-4000-d200-000000000005', '00000000-0000-4000-a000-000000000001', 'SO-2026-930001', '00000000-0000-4000-d200-000000000002',
          '00000000-0000-4000-a200-000000000002', 'NG-1', 'USD', '{}', 89.50, '00000000-0000-4000-a500-000000000003', now());
  update public.inbound_orders set status = 'approved', sales_order_id = '00000000-0000-4000-d200-000000000005',
         decided_by = '00000000-0000-4000-a500-000000000003', decided_at = now() where id = '00000000-0000-4000-d200-000000000002';
  insert into public.sales_order_lines (id, organization_id, sales_order_id, line_no, product_id, sku, product_name, quantity, uom, unit_price,
    currency_minor_unit, line_total, price_source, match_method, allocated_qty, backordered_qty, source_inbound_order_line_id)
  values ('00000000-0000-4000-d200-000000000006', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d200-000000000005', 1,
          '00000000-0000-4000-a400-000000000001', 'JAN-1001', 'Gloves', 10, 'BX', 8.95, 2, 89.50, 'list_price', 'manual', 7, 3, v_line);
  insert into public.integration_outbox (organization_id, event_type, aggregate_type, aggregate_id, payload)
  values ('00000000-0000-4000-a000-000000000001', 'sales_order.confirmed', 'sales_order', '00000000-0000-4000-d200-000000000005', '{"v": 1}');
end $$;

select throws_ok($$update public.source_documents set sha256 = repeat('e', 64) where id = '00000000-0000-4000-d200-000000000001'$$, '23001', null, 'a stored document''s hash cannot change (PR-03)');
select throws_ok($$update public.source_documents set original_filename = 'renamed.pdf' where id = '00000000-0000-4000-d200-000000000001'$$, '23001', null, 'a stored document''s metadata cannot change');
select throws_ok($$delete from public.source_documents where id = '00000000-0000-4000-d200-000000000001'$$, '23001', null, 'documents are never deleted');
select lives_ok($$update public.extraction_runs set status = 'succeeded', finished_at = now(), raw_output = '{"status": "complete"}' where id = '00000000-0000-4000-d200-000000000004'$$, 'raw extraction output can be written once');
select throws_ok($$update public.extraction_runs set raw_output = '{"status": "tampered"}' where id = '00000000-0000-4000-d200-000000000004'$$, '23001', null, 'raw extraction output is write-once');
select throws_ok($$update public.sales_order_lines set quantity = 11, backordered_qty = 4 where id = '00000000-0000-4000-d200-000000000006'$$, '23001', null, 'sales order lines are immutable');
select throws_ok($$delete from public.sales_order_lines where id = '00000000-0000-4000-d200-000000000006'$$, '23001', null, 'sales order lines are never deleted');
select throws_ok($$delete from public.sales_orders where id = '00000000-0000-4000-d200-000000000005'$$, '23001', null, 'sales orders are never deleted');
select throws_ok($$delete from public.inbound_orders where id = '00000000-0000-4000-d200-000000000002'$$, '23001', null, 'customer POs are never deleted');
select lives_ok($$update public.sales_order_lines set backorder_handled_at = now(), backorder_handled_by = '00000000-0000-4000-a500-000000000005', backorder_handled_reason = 'Shipped from ERP' where id = '00000000-0000-4000-d200-000000000006'$$, 'a backorder can be marked handled externally');
select throws_ok($$update public.sales_order_lines set backorder_handled_reason = 'Changed my mind' where id = '00000000-0000-4000-d200-000000000006'$$, '23001', null, 'a backorder can be marked handled only once');
select throws_ok($$update public.integration_outbox set payload = '{"v": 2}'$$, '23001', null, 'integration event content cannot be rewritten');
select lives_ok($$update public.integration_outbox set attempts = 1, processed_at = now()$$, 'delivery bookkeeping can be updated');
select throws_ok($$delete from public.integration_outbox$$, '23001', null, 'integration events are never deleted');

-- Actor stamping ---------------------------------------------------------------------------
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000004',
  $$insert into public.customers (organization_id, name, created_by) values ('00000000-0000-4000-a000-000000000001', 'Spoof', '00000000-0000-4000-a500-000000000001')$$),
  '42501:%', 'callers cannot set created_by themselves');
select is(
  (select created_by::text || '/' || updated_by::text from public.customers where id = (select id from public.customers where name = 'Audit Test Co')),
  '00000000-0000-4000-a500-000000000004/00000000-0000-4000-a500-000000000003',
  'created_by is the creator and updated_by the last editor');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001',
  $$update public.customers set notes = 'third' where id = (select id from public.customers where name = 'Audit Test Co')$$), 'ok', 'Owner edits the customer');
select is(
  (select created_by::text || '/' || updated_by::text from public.customers where id = (select id from public.customers where name = 'Audit Test Co')),
  '00000000-0000-4000-a500-000000000004/00000000-0000-4000-a500-000000000001',
  'editing never changes created_by');

select * from finish();
rollback;
