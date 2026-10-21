-- Role permission matrix (TESTING_STRATEGY.md §5.3; PRODUCT_REQUIREMENTS.md §8).
-- Northstar users: …a5…01 Owner, 02 Admin, 03 Approver, 04 Processor,
-- 05 Inventory Manager, 06 Viewer.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(94);

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
create function pg_temp.count_as(p_user uuid, p_sql text, p_aal text default 'aal1') returns bigint language plpgsql as $$
declare v bigint; e text; m text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
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


-- Permission map parity: the database copy equals the documented matrix ------------
create temporary table expected_matrix (permission text primary key, roles text);
insert into expected_matrix values
  ('records.view', 'OAPPIV'), ('timeline.view', 'OAPPIV'), ('intake.upload', 'OAPP--'),
  ('intake.review', 'OAPP--'), ('intake.submit', 'OAPP--'), ('intake.withdraw_any', 'OAP---'),
  ('intake.withdraw_own', 'OAPP--'), ('intake.cancel', 'OAPP--'), ('intake.approve', 'OAP---'),
  ('exception.override', 'OAP---'), ('sales_order.cancel', 'OAP---'), ('sales_order.fulfil', 'OAP-I-'),
  ('customer.edit', 'OAPP--'), ('customer.hold', 'OAP---'), ('customer.deactivate', 'OA----'),
  ('customer_alias.manage', 'OAPP--'), ('product.edit', 'OA--I-'), ('price.change', 'OA----'),
  ('stock.change', 'OA--I-'), ('import.run', 'OA----'), ('audit.view', 'OAP---'),
  ('audit.export', 'OA----'), ('member.manage', 'OA----'), ('owner.grant', 'O-----'),
  ('settings.change', 'OA----');

select is(
  (select array_agg(r::text order by r::text) from unnest(private.permission_roles(permission)) r),
  (select array_agg(role order by role) from unnest(array['owner', 'admin', 'approver', 'processor', 'inventory_manager', 'viewer'])
     with ordinality as x(role, i) where substr(roles, i::int, 1) <> '-'),
  'database permission ' || permission || ' matches PRODUCT_REQUIREMENTS.md §8'
) from expected_matrix order by permission;

-- Direct writes: customers (customer.edit) --------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'By owner')$$, 'aal2'), 'ok', 'Owner can create customers');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'By admin')$$, 'aal2'), 'ok', 'Admin can create customers');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'By approver')$$), 'ok', 'Approver can create customers');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'By processor')$$), 'ok', 'Processor can create customers');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'By IM')$$), '42501:%', 'Inventory Manager cannot create customers');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000006', $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'By viewer')$$), '42501:%', 'Viewer cannot create customers');
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000006', $$with u as (update public.customers set notes = 'x' where organization_id = '00000000-0000-4000-a000-000000000001' returning 1) select count(*) from u$$), 0::bigint, 'Viewer cannot edit customers');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$update public.customers set status = 'inactive' where id = '00000000-0000-4000-a200-000000000002'$$, 'aal2'), '42501:%', 'not even the Owner can change customer status directly');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$insert into public.customers (organization_id, name, status, hold_reason) values ('00000000-0000-4000-a000-000000000001', 'Born on hold', 'on_hold', 'x')$$), '42501:%', 'a customer cannot be created already on hold');

-- Direct writes: products (product.edit), prices (price.change) -------------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$insert into public.products (organization_id, sku, name, selling_uom, list_price) values ('00000000-0000-4000-a000-000000000001', 'P-OWN', 'x', 'EA', 1)$$, 'aal2'), 'ok', 'Owner can create products');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$insert into public.products (organization_id, sku, name, selling_uom, list_price) values ('00000000-0000-4000-a000-000000000001', 'P-ADM', 'x', 'EA', 1)$$, 'aal2'), 'ok', 'Admin can create products');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$insert into public.products (organization_id, sku, name, selling_uom, list_price) values ('00000000-0000-4000-a000-000000000001', 'P-IM', 'x', 'EA', 1)$$), 'ok', 'Inventory Manager can create products with an initial price (M-08)');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$insert into public.products (organization_id, sku, name, selling_uom, list_price) values ('00000000-0000-4000-a000-000000000001', 'P-APR', 'x', 'EA', 1)$$), '42501:%', 'Approver cannot create products');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$insert into public.products (organization_id, sku, name, selling_uom, list_price) values ('00000000-0000-4000-a000-000000000001', 'P-PRO', 'x', 'EA', 1)$$), '42501:%', 'Processor cannot create products');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$update public.products set list_price = 1 where id = '00000000-0000-4000-a400-000000000001'$$, 'aal2'), '42501:%', 'not even the Owner can change a list price directly');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$update public.products set track_inventory = false where id = '00000000-0000-4000-a400-000000000001'$$), '42501:%', 'tracking cannot be changed directly');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$update public.products set name = 'Renamed by IM' where id = '00000000-0000-4000-a400-000000000001'$$), 'ok', 'Inventory Manager can edit product details');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a400-000000000001', 8, '2026-01-01')$$, 'aal2'), 'ok', 'Admin can set customer prices');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a400-000000000003', 8, '2026-01-01')$$), '42501:%', 'Approver cannot set customer prices');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a400-000000000003', 8, '2026-01-01')$$), '42501:%', 'Inventory Manager cannot set customer prices');
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000004', $$with d as (delete from public.customer_prices returning 1) select count(*) from d$$), 0::bigint, 'Processor cannot delete customer prices');

-- Direct writes: aliases, locations ------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$insert into public.customer_item_aliases (organization_id, customer_id, product_id, customer_part_number) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a400-000000000001', 'NG-1')$$), 'ok', 'Processor can manage customer aliases');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$insert into public.customer_item_aliases (organization_id, customer_id, product_id, customer_part_number) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a400-000000000001', 'NG-2')$$), '42501:%', 'Inventory Manager cannot manage customer aliases');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$insert into public.locations (organization_id, code, name) values ('00000000-0000-4000-a000-000000000001', 'CMH-9', 'Overflow')$$, 'aal2'), 'ok', 'Admin can add locations');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$insert into public.locations (organization_id, code, name) values ('00000000-0000-4000-a000-000000000001', 'CMH-8', 'Overflow')$$), '42501:%', 'Inventory Manager cannot add locations');

-- Function-only tables cannot be written directly by anyone -----------------------------
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$update public.inventory_balances set on_hand = 9999$$), '42501:%', 'stock balances change only through inventory functions');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, on_hand_delta, reserved_delta, on_hand_after, reserved_after) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 'receipt', 1, 0, 641, 0)$$), '42501:%', 'movements cannot be inserted directly');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$insert into public.source_documents (organization_id, original_filename, mime_type, uploaded_by) values ('00000000-0000-4000-a000-000000000001', 'x.pdf', 'application/pdf', '00000000-0000-4000-a500-000000000004')$$), '42501:%', 'documents are created only by the upload flow');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$update public.organizations set require_independent_approval = false$$, 'aal2'), '42501:%', 'workspace settings cannot be changed directly');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$update public.organization_members set role = 'viewer'$$, 'aal2'), '42501:%', 'memberships cannot be changed directly');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$insert into public.audit_events (organization_id, actor_type, action, entity_type, entity_id) values ('00000000-0000-4000-a000-000000000001', 'system', 'fake.event', 'fake', '1')$$, 'aal2'), '42501:%', 'nobody can write audit events directly');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select count(*) from public.document_sequences$$, 'aal2'), '42501:%', 'document sequences are not exposed');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$update public.profiles set full_name = 'Jordan E.' where id = '00000000-0000-4000-a500-000000000004'$$), 'ok', 'users can change their own name');
select is(pg_temp.count_as('00000000-0000-4000-a500-000000000004', $$with u as (update public.profiles set full_name = 'Renamed' where id = '00000000-0000-4000-a500-000000000001' returning 1) select count(*) from u$$), 0::bigint, 'users cannot rename other people');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$update public.profiles set email = 'x@example.com' where id = '00000000-0000-4000-a500-000000000004'$$), '42501:%', 'users cannot change their profile email directly');

-- set_customer_status: hold/release Approver+, deactivate/reactivate Admin+ ---------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'on_hold', 'Overdue invoices')$$), 'ok', 'Approver can place a hold');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'active', 'Paid')$$), 'ok', 'Approver can release a hold');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'on_hold', 'x')$$), '42501:insufficient_privilege', 'Processor cannot place a hold');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000006', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'on_hold', 'x')$$), '42501:insufficient_privilege', 'Viewer cannot place a hold');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'on_hold', '   ')$$), '22023:validation_failed%', 'a hold needs a reason');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'inactive', 'Closed')$$), '42501:insufficient_privilege', 'Approver cannot deactivate a customer');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'inactive', 'Closed')$$, 'aal2'), 'ok', 'Admin can deactivate a customer');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'active', 'Reopened')$$), '42501:insufficient_privilege', 'Approver cannot reactivate a customer');
select is((select hold_reason from public.customers where id = '00000000-0000-4000-a200-000000000002'), null, 'leaving on_hold clears the hold reason');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.set_customer_status('00000000-0000-4000-a200-000000000002', 'inactive', 'Again')$$, 'aal2'), '55000:invalid_state%', 'setting the same status again is refused');

-- set_product_price: Owner and Admin ---------------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.set_product_price('00000000-0000-4000-a400-000000000001', 9.1500, 'Supplier increase')$$, 'aal2'), 'ok', 'Admin can change a list price');
select is((select list_price from public.products where id = '00000000-0000-4000-a400-000000000001'), 9.1500::numeric, 'the new price is stored');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$select public.set_product_price('00000000-0000-4000-a400-000000000001', 1)$$), '42501:insufficient_privilege', 'Inventory Manager cannot change prices after creation');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$select public.set_product_price('00000000-0000-4000-a400-000000000001', 1)$$), '42501:insufficient_privilege', 'Processor cannot change prices');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.set_product_price('00000000-0000-4000-a400-000000000001', 1.23456)$$, 'aal2'), '22023:validation_failed%', 'prices with more than four decimals are rejected, not rounded');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.set_product_price('00000000-0000-4000-a400-000000000001', -1)$$, 'aal2'), '22023:validation_failed%', 'negative prices are rejected');

-- set_product_tracking (M-01) ------------------------------------------------------------
update public.inventory_balances set reserved = 5 where product_id = '00000000-0000-4000-a400-000000000002';
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$select public.set_product_tracking('00000000-0000-4000-a400-000000000002', false)$$), '55000:invalid_state%', 'tracking cannot be switched off while stock is reserved');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000005', $$select public.set_product_tracking('00000000-0000-4000-a400-000000000005', true)$$), 'ok', 'Inventory Manager can switch tracking on');
select is((select count(*)::int from public.inventory_balances where product_id = '00000000-0000-4000-a400-000000000005'), 1, 'switching tracking on creates the stock balance at the default location');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000004', $$select public.set_product_tracking('00000000-0000-4000-a400-000000000003', false)$$), '42501:insufficient_privilege', 'Processor cannot change tracking');

-- update_workspace_settings: Owner/Admin with MFA; Owner-only to disable independent approval (D-05)
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"confidence_threshold": 0.9}')$$, 'aal1'), '42501:mfa_required', 'settings changes require MFA');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"confidence_threshold": 0.9, "duplicate_lookback_days": 45}')$$, 'aal2'), 'ok', 'Admin with MFA can change order rules');
select is((select confidence_threshold::text || '/' || duplicate_lookback_days from public.organizations where slug = 'northstar'), '0.90/45', 'the changed settings are stored');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"require_independent_approval": false}')$$, 'aal2'), '42501:insufficient_privilege: only an Owner%', 'only an Owner can turn off independent approval (D-05)');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"require_independent_approval": false}')$$, 'aal2'), 'ok', 'the Owner can turn off independent approval');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"require_independent_approval": true}')$$, 'aal2'), 'ok', 'an Admin can turn independent approval back on');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000003', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"name": "x"}')$$, 'aal2'), '42501:insufficient_privilege', 'Approver cannot change settings');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"is_demo": false}')$$, 'aal2'), '22023:validation_failed%', 'operator-only fields cannot be changed through settings');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"timezone": "Mars/Olympus"}')$$, 'aal2'), '22023:validation_failed%', 'unknown time zones are rejected');
select alike(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.update_workspace_settings('00000000-0000-4000-a000-000000000001', '{"confidence_threshold": 7}')$$, 'aal2'), '23514:%', 'out-of-range values are still rejected by the table constraints');

-- set_base_currency (C-04): Owner with MFA, before the first customer PO ------------------
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000002', $$select public.set_base_currency('00000000-0000-4000-a000-000000000001', 'CAD')$$, 'aal2'), '42501:insufficient_privilege', 'Admin cannot change the base currency');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.set_base_currency('00000000-0000-4000-a000-000000000001', 'CAD')$$, 'aal1'), '42501:mfa_required', 'changing the base currency requires MFA');
select is(pg_temp.as_user('00000000-0000-4000-a500-000000000001', $$select public.set_base_currency('00000000-0000-4000-a000-000000000001', 'CAD')$$, 'aal2'), 'ok', 'the Owner can change the base currency before any customer PO exists');
insert into public.source_documents (id, organization_id, original_filename, mime_type, uploaded_by)
values ('00000000-0000-4000-d100-000000000001', '00000000-0000-4000-b000-000000000001', 'first.pdf', 'application/pdf', '00000000-0000-4000-b500-000000000004');
insert into public.inbound_orders (organization_id, reference, source_document_id)
values ('00000000-0000-4000-b000-000000000001', 'IN-000001', '00000000-0000-4000-d100-000000000001');
select alike(pg_temp.as_user('00000000-0000-4000-b500-000000000001', $$select public.set_base_currency('00000000-0000-4000-b000-000000000001', 'EUR')$$, 'aal2'), '55000:invalid_state%', 'the base currency is locked once a customer PO exists');

select * from finish();
rollback;
