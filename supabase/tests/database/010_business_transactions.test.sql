-- Phase 2D: approval, hard gate, duplicates, stock, fulfilment, cancellation,
-- rollback, status guards, session revocation, audit and integrity.
-- docs/DATABASE_ARCHITECTURE.md §8–§10, §12.1, §13. All data is fictional.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(94);

-- Helpers ----------------------------------------------------------------------
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

-- Runs a statement returning one value as a signed-in user. Errors come back
-- as 'ERR:<sqlstate>:<message>'.
create function pg_temp.run_claims(p_claims text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', p_claims, true);
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

create function pg_temp.run(p_user uuid, p_sql text, p_aal text default 'aal1') returns text language sql as $$
  select pg_temp.run_claims(pg_temp.claims(p_user, p_aal), p_sql)
$$;

-- Runs a statement as a database role (anon, service_role) without JWT claims.
create function pg_temp.as_role(p_role text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.id(p_key text) returns uuid language sql as $$
  select ('00000000-0000-4000-e000-' || lpad(to_hex(abs(hashtext(p_key))), 12, '0'))::uuid
$$;

-- An intake ready for approval: stored document, confirmed values, validated.
-- p_lines: [{"sku": "JAN-1001", "qty": 10, "price": 8.95}, ...]
create function pg_temp.intake(
  p_ref text, p_customer uuid, p_po text, p_lines jsonb,
  p_submitted_by uuid default '00000000-0000-4000-a500-000000000004',
  p_status public.inbound_order_status default 'pending_approval'
) returns uuid language plpgsql as $$
declare
  v_id uuid := pg_temp.id(p_ref);
  v_doc uuid := gen_random_uuid();
  v_line jsonb;
  v_no integer := 0;
begin
  insert into public.source_documents
    (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
  values (v_doc, '00000000-0000-4000-a000-000000000001', p_ref || '.pdf', 'application/pdf', 1000, 1,
          encode(sha256(convert_to(p_ref, 'UTF8')), 'hex'), 'stored', '00000000-0000-4000-a500-000000000004', now());
  insert into public.inbound_orders
    (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number, currency,
     ship_to, validated_version, submitted_by, submitted_at)
  values (v_id, '00000000-0000-4000-a000-000000000001', 'IN-' || lpad((abs(hashtext(p_ref)) % 1000000000)::text, 9, '0'), v_doc, p_status, p_customer, p_po, 'USD',
          '{"line1": "1 Test Way", "city": "Columbus", "country_code": "US"}', 1,
          case when p_status = 'pending_approval' then p_submitted_by end,
          case when p_status = 'pending_approval' then now() end);
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into public.inbound_order_lines
      (organization_id, inbound_order_id, line_no, customer_part_number, description, product_id, match_method,
       quantity, unit_price, price_source)
    select '00000000-0000-4000-a000-000000000001', v_id, v_no, 'CP-' || v_no, p.name, p.id, 'sku',
           (v_line ->> 'qty')::numeric, (v_line ->> 'price')::numeric,
           case when v_line ? 'price' and v_line ->> 'price' is not null then 'list_price'::public.price_source end
      from public.products p
     where p.organization_id = '00000000-0000-4000-a000-000000000001' and p.sku = v_line ->> 'sku';
  end loop;
  return v_id;
end $$;

create function pg_temp.approve(p_user uuid, p_intake uuid, p_decisions jsonb default '{}', p_aal text default 'aal1')
returns text language sql as $$
  select pg_temp.run(p_user, format('select public.approve_inbound_order(%L, %s, %L)::text', p_intake,
    (select version from public.inbound_orders where id = p_intake), p_decisions), p_aal)
$$;

create function pg_temp.balance(p_sku text) returns text language sql as $$
  select b.on_hand::text || '/' || b.reserved::text
    from public.inventory_balances b join public.products p on p.id = b.product_id
   where p.organization_id = '00000000-0000-4000-a000-000000000001' and p.sku = p_sku
$$;

create function pg_temp.so(p_intake uuid) returns public.sales_orders language sql as $$
  select * from public.sales_orders where inbound_order_id = p_intake
$$;

create function pg_temp.failures(p_result text) returns text[] language sql as $$
  select coalesce(array_agg(f ->> 'code' order by f ->> 'code'), '{}')
    from jsonb_array_elements(case when p_result like 'ERR:%' then '[]'::jsonb else coalesce(p_result::jsonb -> 'failures', '[]'::jsonb) end) f
$$;

-- Users (supabase/seed.sql): Northstar a5…01 Owner, 02 Admin, 03 Approver (Ahmed),
-- 04 Processor (Jordan), 05 Inventory Manager (Marc), 06 Viewer; Bayview b5…03 Approver.
create temp table u (role text primary key, id uuid);
insert into u values
  ('owner', '00000000-0000-4000-a500-000000000001'), ('admin', '00000000-0000-4000-a500-000000000002'),
  ('approver', '00000000-0000-4000-a500-000000000003'), ('processor', '00000000-0000-4000-a500-000000000004'),
  ('inventory', '00000000-0000-4000-a500-000000000005'), ('viewer', '00000000-0000-4000-a500-000000000006'),
  ('bv_approver', '00000000-0000-4000-b500-000000000003');
grant select on u to authenticated;

-- Customers: a2…01 Harbor & Pine, a2…02 Northgate, a2…03 Kestrel (on hold), a2…04 Granite Peak (inactive).
-- Stock at start: JAN-1001 640, JAN-2207 210, JAN-4402 48, FS-6300 142.5 (1 decimal), FS-7002 untracked,
-- FS-5320 discontinued.

-- ============================================================================
-- 1. Successful approval
-- ============================================================================
select pg_temp.intake('T-A', '00000000-0000-4000-a200-000000000001', 'PO-T1001',
  '[{"sku": "JAN-1001", "qty": 10, "price": 8.95}, {"sku": "FS-7002", "qty": 3, "price": 12.90}]');
create temp table r (k text primary key, v text);
insert into r select 'A', pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('T-A'));

select is((select v::jsonb ->> 'ok' from r where k = 'A'), 'true', 'an Approver approves a valid order');
select matches((pg_temp.so(pg_temp.id('T-A'))).order_number, '^SO-[0-9]{4}-[0-9]{6}$', 'the sales order gets a number in the approved format (D-21)');
select is((pg_temp.so(pg_temp.id('T-A'))).status::text, 'confirmed', 'the sales order is confirmed');
select is((pg_temp.so(pg_temp.id('T-A'))).subtotal, 128.20::numeric, 'the subtotal is the sum of rounded line totals');
select is(
  (select array_agg(allocated_qty::text || '/' || backordered_qty::text order by line_no) from public.sales_order_lines
    where sales_order_id = (pg_temp.so(pg_temp.id('T-A'))).id),
  array['10.000/0.000', '3.000/0.000'], 'tracked and untracked lines are fully allocated');
select is(pg_temp.balance('JAN-1001'), '640.000/10.000', 'the tracked line reserves stock; on hand is unchanged');
select is(
  (select count(*)::int from public.inventory_movements where sales_order_id = (pg_temp.so(pg_temp.id('T-A'))).id),
  1, 'only the tracked line has a reservation movement (M-01)');
select is(
  (select status::text || '/' || version from public.inbound_orders where id = pg_temp.id('T-A')),
  'approved/2', 'the intake is approved and its version bumped');
select is(
  (select count(*)::int from public.integration_outbox where aggregate_id = (pg_temp.so(pg_temp.id('T-A'))).id and event_type = 'sales_order.confirmed'),
  1, 'a sales_order.confirmed outbox event is written in the same transaction');
select is(
  pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('T-A'))::jsonb ->> 'already_approved',
  'true', 'approving again is idempotent and returns the same order');
select is(
  (select count(*)::int from public.sales_orders where inbound_order_id = pg_temp.id('T-A')),
  1, 'still exactly one sales order for the intake');

-- ============================================================================
-- 2. Invalid approval attempts
-- ============================================================================
select pg_temp.intake('T-B', '00000000-0000-4000-a200-000000000001', 'PO-T2001', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
select matches(pg_temp.approve((select id from u where role = 'viewer'), pg_temp.id('T-B')), '^ERR:42501:insufficient_privilege', 'a Viewer cannot approve');
select matches(pg_temp.approve((select id from u where role = 'processor'), pg_temp.id('T-B')), '^ERR:42501:insufficient_privilege', 'a Processor cannot approve');
select matches(pg_temp.approve((select id from u where role = 'bv_approver'), pg_temp.id('T-B')), '^ERR:P0002:not_found', 'an Approver from another workspace sees not found');
select matches(pg_temp.approve((select id from u where role = 'owner'), pg_temp.id('T-B')), '^ERR:42501:mfa_required', 'an Owner without MFA is refused (D-24)');
select matches(
  pg_temp.run((select id from u where role = 'approver'), format('select public.approve_inbound_order(%L, 99)::text', pg_temp.id('T-B'))),
  '^ERR:55000:stale_version', 'a stale version is refused');
select is(pg_temp.approve((select id from u where role = 'owner'), pg_temp.id('T-B'), '{}', 'aal2')::jsonb ->> 'ok', 'true', 'an Owner with a live MFA session can approve');

-- Independent approval (D-05).
select pg_temp.intake('T-C', '00000000-0000-4000-a200-000000000001', 'PO-T3001', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]',
  (select id from u where role = 'approver'));
select matches(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('T-C')), '^ERR:42501:independent_approval_required', 'the submitter cannot approve their own order');
update public.organizations set require_independent_approval = false where id = '00000000-0000-4000-a000-000000000001';
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('T-C'))::jsonb ->> 'ok', 'true', 'with independent approval off, the submitter may approve');
update public.organizations set require_independent_approval = true where id = '00000000-0000-4000-a000-000000000001';

select pg_temp.intake('T-D', '00000000-0000-4000-a200-000000000001', 'PO-T4001', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]', null, 'in_review');
select matches(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('T-D')), '^ERR:55000:invalid_state', 'an order that is not pending approval cannot be approved');

-- ============================================================================
-- 3. Hard gate (§8.1): failures are listed and nothing is written
-- ============================================================================
select pg_temp.intake('G-AI', '00000000-0000-4000-a200-000000000001', 'PO-G1', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
update public.inbound_orders set field_meta = '{"customer_po_number": {"source": "ai", "state": "suggested"}}' where id = pg_temp.id('G-AI');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-AI'))), array['UNCONFIRMED_FIELDS'], 'unconfirmed AI values block approval');
update public.inbound_orders set field_meta = '{}' where id = pg_temp.id('G-AI');
update public.inbound_order_lines set field_meta = '{"quantity": {"source": "ai", "state": "suggested"}}' where inbound_order_id = pg_temp.id('G-AI');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-AI'))), array['UNCONFIRMED_FIELDS'], 'unconfirmed AI values on a line block approval');
select is((select count(*)::int from public.sales_orders where inbound_order_id = pg_temp.id('G-AI')), 0, 'a refused approval writes nothing');

select pg_temp.intake('G-EX', '00000000-0000-4000-a200-000000000001', 'PO-G2', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
values ('00000000-0000-4000-a000-000000000001', pg_temp.id('G-EX'), 'PRICE_MISMATCH', 'blocking', false, 'Price differs', repeat('c', 64));
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-EX'))), array['OPEN_EXCEPTIONS'], 'an open blocking exception blocks approval');

select pg_temp.intake('G-IN', '00000000-0000-4000-a200-000000000004', 'PO-G3', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-IN'))), array['CUSTOMER_INACTIVE'], 'an inactive customer blocks approval');

select pg_temp.intake('G-HOLD', '00000000-0000-4000-a200-000000000003', 'PO-G4', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-HOLD'))), array['CUSTOMER_ON_HOLD'], 'a customer on hold blocks approval without an override');
insert into public.order_exceptions (id, organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
values (pg_temp.id('X-HOLD'), '00000000-0000-4000-a000-000000000001', pg_temp.id('G-HOLD'), 'CUSTOMER_ON_HOLD', 'blocking', true, 'On hold', repeat('d', 64));
select is(pg_temp.run((select id from u where role = 'approver'), format('select public.override_exception(%L, %L)::text', pg_temp.id('X-HOLD'), 'Credit team approved this order'))::jsonb ->> 'ok',
  'true', 'an Approver overrides the hold with a reason');
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-HOLD'))::jsonb ->> 'ok', 'true', 'with the override recorded, the order can be approved');

select pg_temp.intake('G-LINES', '00000000-0000-4000-a200-000000000001', 'PO-G5',
  '[{"sku": "FS-5320", "qty": 1, "price": 5.10}, {"sku": "JAN-1001", "qty": 1.5, "price": 8.95}, {"sku": "JAN-2207", "qty": 1, "price": null}]');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-LINES'))),
  array['PRICE_MISSING', 'PRODUCT_DISCONTINUED', 'QUANTITY_INVALID'], 'line rules: discontinued product, quantity decimals, missing price');

select pg_temp.intake('G-HDR', '00000000-0000-4000-a200-000000000001', 'PO-G6', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
update public.inbound_orders set currency = 'GBP', ship_to = null, validated_version = null where id = pg_temp.id('G-HDR');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-HDR'))),
  array['CURRENCY_MISMATCH', 'NOT_VALIDATED', 'SHIP_TO_MISSING'], 'header rules: currency, validation version, ship-to');

-- ============================================================================
-- 4. Duplicate protection (§12.1)
-- ============================================================================
select pg_temp.intake('D-1', '00000000-0000-4000-a200-000000000001', 'po t1001', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
select is(pg_temp.failures(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('D-1'))), array['DUPLICATE_PO_NUMBER'],
  'a PO number already on a sales order (PO-T1001 = po t1001) blocks approval');
insert into public.order_exceptions (id, organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
values (pg_temp.id('X-DUP'), '00000000-0000-4000-a000-000000000001', pg_temp.id('D-1'), 'DUPLICATE_PO_NUMBER', 'blocking', true, 'Duplicate PO', repeat('e', 64));
select matches(pg_temp.run((select id from u where role = 'processor'), format('select public.override_exception(%L, %L)::text', pg_temp.id('X-DUP'), 'reason')),
  '^ERR:42501', 'a Processor cannot override');
select matches(pg_temp.run((select id from u where role = 'approver'), format('select public.override_exception(%L, %L)::text', pg_temp.id('X-DUP'), '  ')),
  '^ERR:22023', 'an override needs a reason');
select is(pg_temp.run((select id from u where role = 'approver'), format('select public.override_exception(%L, %L)::text', pg_temp.id('X-DUP'), 'Weekly release reuses the PO'))::jsonb ->> 'ok',
  'true', 'an Approver overrides the duplicate');
select is((select override_conflicts from public.order_exceptions where id = pg_temp.id('X-DUP')),
  jsonb_build_array(jsonb_build_object('type', 'sales_order', 'id', (pg_temp.so(pg_temp.id('T-A'))).id)),
  'the override records exactly the conflict that was reviewed');

-- A new conflicting intake appears after the override: the override is stale.
select pg_temp.intake('D-2', '00000000-0000-4000-a200-000000000001', 'PO T1001', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]', null, 'in_review');
insert into r select 'D1', pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('D-1'));
select is((select array[v::jsonb ->> 'ok', v::jsonb ->> 'reopened_overrides'] from r where k = 'D1'), array['false', '1'],
  'a new conflict invalidates the earlier override and approval is refused');
select is((select status::text from public.order_exceptions where id = pg_temp.id('X-DUP')), 'open', 'the stale override is re-opened');
select ok(exists (select 1 from public.audit_events where action = 'exception.reopened' and entity_id = pg_temp.id('X-DUP')::text),
  'the re-opening is audited');
select is(pg_temp.run((select id from u where role = 'approver'), format('select public.override_exception(%L, %L)::text', pg_temp.id('X-DUP'), 'Reviewed both, still intended'))::jsonb ->> 'ok',
  'true', 'the Approver reviews the new conflict set and overrides again');
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('D-1'))::jsonb ->> 'ok', 'true', 'the authorised duplicate is approved');
select is((pg_temp.so(pg_temp.id('D-1'))).duplicate_override_exception_id, pg_temp.id('X-DUP'), 'the sales order points at its own override');

-- ============================================================================
-- 5. Stock: partial reservation, backorders, untracked products
-- ============================================================================
select pg_temp.intake('S-PART', '00000000-0000-4000-a200-000000000002', 'NG-S1', '[{"sku": "JAN-4402", "qty": 60, "price": 38.50}]');
insert into r select 'SP', pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('S-PART'));
select is((select v::jsonb ->> 'code' from r where k = 'SP'), 'needs_stock_decision', 'a shortfall without a decision stops approval');
select is((select (v::jsonb -> 'shortfalls' -> 0 ->> 'available')::numeric from r where k = 'SP'), 48::numeric, 'the shortfall shows what can be reserved');
select is(pg_temp.balance('JAN-4402'), '48.000/0.000', 'nothing was reserved');
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('S-PART'),
  jsonb_build_object((select id from public.inbound_order_lines where inbound_order_id = pg_temp.id('S-PART'))::text, 'backorder'))::jsonb ->> 'ok',
  'true', 'with a backorder decision the order is approved');
select is((select allocated_qty::text || '/' || backordered_qty::text from public.sales_order_lines where sales_order_id = (pg_temp.so(pg_temp.id('S-PART'))).id),
  '48.000/12.000', 'partial reservation: 48 reserved, 12 backordered (D-35)');
select is(pg_temp.balance('JAN-4402'), '48.000/48.000', 'available stock is now zero, never negative');

select pg_temp.intake('S-FULL', '00000000-0000-4000-a200-000000000002', 'NG-S2', '[{"sku": "JAN-4402", "qty": 5, "price": 38.50}]');
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('S-FULL'),
  jsonb_build_object((select id from public.inbound_order_lines where inbound_order_id = pg_temp.id('S-FULL'))::text, 'backorder'))::jsonb ->> 'ok',
  'true', 'a fully backordered order can be approved with a decision');
select is((select allocated_qty::text || '/' || backordered_qty::text from public.sales_order_lines where sales_order_id = (pg_temp.so(pg_temp.id('S-FULL'))).id),
  '0.000/5.000', 'full backorder: nothing reserved');
select is((select count(*)::int from public.inventory_movements where sales_order_id = (pg_temp.so(pg_temp.id('S-FULL'))).id), 0,
  'a full backorder writes no movement');

select pg_temp.intake('S-TWO', '00000000-0000-4000-a200-000000000002', 'NG-S3',
  '[{"sku": "JAN-2207", "qty": 150, "price": 44.20}, {"sku": "JAN-2207", "qty": 100, "price": 44.20}]');
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('S-TWO'),
  jsonb_build_object((select id from public.inbound_order_lines where inbound_order_id = pg_temp.id('S-TWO') and line_no = 2)::text, 'backorder'))::jsonb ->> 'ok',
  'true', 'two lines of the same product are allocated in line order');
select is((select array_agg(allocated_qty::text || '/' || backordered_qty::text order by line_no) from public.sales_order_lines where sales_order_id = (pg_temp.so(pg_temp.id('S-TWO'))).id),
  array['150.000/0.000', '60.000/40.000'], 'the second line gets what is left');

select pg_temp.intake('S-DEC', '00000000-0000-4000-a200-000000000002', 'NG-S4', '[{"sku": "FS-6300", "qty": 2.5, "price": 6.20}]');
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('S-DEC'))::jsonb ->> 'ok', 'true', 'decimal quantities are reserved for a 1-decimal product');
select is(pg_temp.balance('FS-6300'), '142.500/2.500', 'the decimal reservation is exact');

-- ============================================================================
-- 6. Fulfilment and cancellation
-- ============================================================================
select matches(pg_temp.run((select id from u where role = 'viewer'),
  format('select public.fulfill_sales_order(%L, %s)::text', (pg_temp.so(pg_temp.id('T-A'))).id, (pg_temp.so(pg_temp.id('T-A'))).version)),
  '^ERR:42501', 'a Viewer cannot fulfil');
select is(pg_temp.run((select id from u where role = 'inventory'),
  format('select public.fulfill_sales_order(%L, %s)::text', (pg_temp.so(pg_temp.id('T-A'))).id, (pg_temp.so(pg_temp.id('T-A'))).version))::jsonb ->> 'ok',
  'true', 'an Inventory Manager fulfils a confirmed order');
select is(pg_temp.balance('JAN-1001'), '630.000/4.000', 'fulfilment issues only the reserved quantity (on hand and reserved both drop)');
select is((pg_temp.so(pg_temp.id('T-A'))).status::text, 'fulfilled', 'the order is fulfilled');
select matches(pg_temp.run((select id from u where role = 'inventory'),
  format('select public.fulfill_sales_order(%L, %s)::text', (pg_temp.so(pg_temp.id('T-A'))).id, (pg_temp.so(pg_temp.id('T-A'))).version)),
  '^ERR:55000:invalid_state', 'an order cannot be fulfilled twice');
select matches(pg_temp.run((select id from u where role = 'approver'),
  format('select public.cancel_sales_order(%L, %s, %L)::text', (pg_temp.so(pg_temp.id('T-A'))).id, (pg_temp.so(pg_temp.id('T-A'))).version, 'Customer changed mind')),
  '^ERR:55000:invalid_state', 'a fulfilled order cannot be cancelled');

select matches(pg_temp.run((select id from u where role = 'inventory'),
  format('select public.cancel_sales_order(%L, %s, %L)::text', (pg_temp.so(pg_temp.id('S-PART'))).id, (pg_temp.so(pg_temp.id('S-PART'))).version, 'x')),
  '^ERR:42501', 'an Inventory Manager cannot cancel');
select matches(pg_temp.run((select id from u where role = 'approver'),
  format('select public.cancel_sales_order(%L, %s, %L)::text', (pg_temp.so(pg_temp.id('S-PART'))).id, (pg_temp.so(pg_temp.id('S-PART'))).version, ' ')),
  '^ERR:22023', 'cancelling needs a reason');
select is(pg_temp.run((select id from u where role = 'approver'),
  format('select public.cancel_sales_order(%L, %s, %L)::text', (pg_temp.so(pg_temp.id('S-PART'))).id, (pg_temp.so(pg_temp.id('S-PART'))).version, 'Customer cancelled by phone'))::jsonb ->> 'ok',
  'true', 'an Approver cancels a confirmed order');
select is(pg_temp.balance('JAN-4402'), '48.000/0.000', 'cancellation releases the reservation');
select matches(pg_temp.run((select id from u where role = 'inventory'),
  format('select public.fulfill_sales_order(%L, %s)::text', (pg_temp.so(pg_temp.id('S-PART'))).id, (pg_temp.so(pg_temp.id('S-PART'))).version)),
  '^ERR:55000:invalid_state', 'a cancelled order cannot be fulfilled');
select matches(pg_temp.run((select id from u where role = 'approver'),
  format('select public.cancel_sales_order(%L, %s, %L)::text', (pg_temp.so(pg_temp.id('S-PART'))).id, (pg_temp.so(pg_temp.id('S-PART'))).version, 'again')),
  '^ERR:55000:invalid_state', 'an order cannot be cancelled twice');

select is(pg_temp.run((select id from u where role = 'inventory'),
  format('select public.fulfill_sales_order(%L, %s)::text', (pg_temp.so(pg_temp.id('S-FULL'))).id, (pg_temp.so(pg_temp.id('S-FULL'))).version))::jsonb ->> 'ok',
  'true', 'a fully backordered order can be marked fulfilled');
select is((select backordered_qty from public.sales_order_lines where sales_order_id = (pg_temp.so(pg_temp.id('S-FULL'))).id), 5.000::numeric,
  'the backordered quantity stays on the line after fulfilment (D-35)');
select is((select payload -> 'lines' -> 0 ->> 'backordered_qty' from public.integration_outbox
            where aggregate_id = (pg_temp.so(pg_temp.id('S-FULL'))).id and event_type = 'sales_order.fulfilled'),
  '5.000', 'the fulfilment event carries the backordered quantity');

-- Over-committed stock (a later count reduced on hand): fulfilment is refused.
insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, adjustment_reason,
  on_hand_delta, reserved_delta, on_hand_after, reserved_after)
select b.organization_id, b.product_id, b.location_id, 'adjustment', 'cycle_count', -b.on_hand, 0, 0, b.reserved
  from public.inventory_balances b join public.products p on p.id = b.product_id where p.sku = 'FS-6300' and p.organization_id = '00000000-0000-4000-a000-000000000001';
update public.inventory_balances b set on_hand = 0 from public.products p where p.id = b.product_id and p.sku = 'FS-6300' and p.organization_id = '00000000-0000-4000-a000-000000000001';
select matches(pg_temp.run((select id from u where role = 'inventory'),
  format('select public.fulfill_sales_order(%L, %s)::text', (pg_temp.so(pg_temp.id('S-DEC'))).id, (pg_temp.so(pg_temp.id('S-DEC'))).version)),
  '^ERR:55000:insufficient_on_hand', 'fulfilment is refused when on hand is below the reservation');
select is(pg_temp.balance('FS-6300'), '0.000/2.500', 'the refused fulfilment changed nothing');

-- ============================================================================
-- 7. Transaction rollback: a failure after the order and a reservation were
--    written leaves no trace
-- ============================================================================
select pg_temp.intake('R-1', '00000000-0000-4000-a200-000000000002', 'NG-R1',
  '[{"sku": "JAN-1001", "qty": 4, "price": 8.95}, {"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
create temp table before_r as select pg_temp.balance('JAN-1001') b, (select next_value from public.document_sequences where sequence_name = 'sales_order' and organization_id = '00000000-0000-4000-a000-000000000001') n;
-- Fault injection (this transaction only): the second sales order line fails,
-- after the order, the first line and its reservation have been written.
create function public.zz_test_fail_second_line() returns trigger language plpgsql as $$
begin
  if new.line_no = 2 then raise exception 'injected failure' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger zz_test_fail before insert on public.sales_order_lines for each row execute function public.zz_test_fail_second_line();
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('R-1')),
  'ERR:P0001:injected failure', 'a failure partway through approval raises an error');
select is((select count(*)::int from public.sales_orders where inbound_order_id = pg_temp.id('R-1')), 0, 'rollback: no sales order remains');
select is(pg_temp.balance('JAN-1001'), (select b from before_r), 'rollback: the reservation of the first line is undone');
select is((select next_value from public.document_sequences where sequence_name = 'sales_order' and organization_id = '00000000-0000-4000-a000-000000000001'),
  (select n from before_r), 'rollback: the sales order number is not consumed (gap-free)');
select is((select status::text from public.inbound_orders where id = pg_temp.id('R-1')), 'pending_approval', 'rollback: the intake is still pending');
drop trigger zz_test_fail on public.sales_order_lines;
drop function public.zz_test_fail_second_line();

-- ============================================================================
-- 8. Status guards and direct writes
-- ============================================================================
select throws_ok(format($$update public.inbound_orders set status = 'in_review' where id = %L$$, pg_temp.id('G-AI')),
  '55000', null, 'status cannot be changed outside workflow functions (even by the table owner)');
select matches(pg_temp.as_role('service_role', format($$update public.sales_orders set status = 'cancelled', cancelled_by = '00000000-0000-4000-a500-000000000003', cancelled_at = now(), cancel_reason = 'x' where id = '%s' returning 'x'$$, (pg_temp.so(pg_temp.id('T-C'))).id)),
  '^ERR:55000', 'the service role cannot change status directly either');
select set_config('orderpilot.transition', 'on', true);
select throws_ok(format($$update public.inbound_orders set status = 'in_review' where id = %L$$, pg_temp.id('T-A')),
  '55000', null, 'even inside a workflow, only allowed transitions are possible (approved → in review is not)');
select set_config('orderpilot.transition', '', true);
select matches(pg_temp.run((select id from u where role = 'owner'),
  format($$update public.sales_orders set subtotal = 0 where id = '%s' returning 'x'$$, (pg_temp.so(pg_temp.id('T-C'))).id), 'aal2'),
  '^ERR:42501', 'signed-in users cannot write sales orders directly');
select matches(pg_temp.as_role('anon', format('select public.approve_inbound_order(%L, 1)::text', pg_temp.id('T-B'))),
  '^ERR:42501', 'anonymous callers cannot execute approval');
select matches(pg_temp.run((select id from u where role = 'owner'), 'select (public.claim_extraction_job(60)).run_id::text', 'aal2'),
  '^ERR:42501', 'signed-in users cannot run worker functions');

-- ============================================================================
-- 9. Session revocation (Phase 2C follow-up)
-- ============================================================================
select pg_temp.intake('M-1', '00000000-0000-4000-a200-000000000001', 'PO-M1', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]');
select is(pg_temp.run((select id from u where role = 'admin'), 'select private.has_permission(''00000000-0000-4000-a000-000000000001'', ''intake.approve'')::text', 'aal2'),
  'true', 'an Admin with a live MFA session holds privileged permissions');
create temp table admin_claims as select pg_temp.claims('00000000-0000-4000-a500-000000000002', 'aal2') c;
select ok(pg_temp.as_role('service_role', $$select public.record_mfa_reset('00000000-0000-4000-a500-000000000002', 'Lost phone; identity verified by video call')::text$$)::int >= 1,
  'an operator MFA reset ends the person''s sessions');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-4000-a500-000000000002'), 0, 'no session of the person remains');
-- Same claims as before (aal2), but the session no longer exists.
select is(pg_temp.run_claims((select c from admin_claims), format('select public.approve_inbound_order(%L, 1)::text', pg_temp.id('M-1'))),
  'ERR:42501:mfa_required', 'a previously issued AAL2 token no longer grants privileged access after the reset');

-- ============================================================================
-- 10. Audit completeness
-- ============================================================================
select is(
  (select array_agg(distinct action order by action) from public.audit_events
    where action in ('inbound_order.approved', 'sales_order.confirmed', 'sales_order.fulfilled', 'sales_order.cancelled',
                     'exception.overridden', 'exception.reopened', 'inventory_movement.created')),
  array['exception.overridden', 'exception.reopened', 'inbound_order.approved', 'inventory_movement.created',
        'sales_order.cancelled', 'sales_order.confirmed', 'sales_order.fulfilled'],
  'approval, order creation, reservation, fulfilment, cancellation and override decisions are audited');
select is(
  (select count(*)::int from public.audit_events
    where action in ('inbound_order.approved', 'sales_order.confirmed', 'sales_order.fulfilled', 'sales_order.cancelled', 'exception.overridden')
      and (actor_type <> 'user' or actor_user_id is null or organization_id is null or entity_id is null or occurred_at is null)),
  0, 'every business event names the actor, workspace, record and time');
select is(
  (select actor_user_id from public.audit_events where action = 'inbound_order.approved' and entity_id = pg_temp.id('T-A')::text),
  (select id from u where role = 'approver'), 'the approval event names the approver');
select is((select reason from public.audit_events where action = 'sales_order.cancelled' and entity_id = (pg_temp.so(pg_temp.id('S-PART'))).id::text),
  'Customer cancelled by phone', 'the cancellation reason is recorded');

-- ============================================================================
-- 11. Integrity report and negative controls
-- ============================================================================
select is((select count(*)::int from private.inventory_integrity_report('00000000-0000-4000-a000-000000000001')), 0,
  'the inventory integrity report is empty after every operation above');

-- Negative control: a corrupted balance is detected.
update public.inventory_balances b set reserved = reserved + 1 from public.products p
 where p.id = b.product_id and p.sku = 'JAN-2207' and p.organization_id = '00000000-0000-4000-a000-000000000001';
select is((select array_agg(distinct invariant order by invariant) from private.inventory_integrity_report('00000000-0000-4000-a000-000000000001')),
  array['I-3', 'I-4'], 'negative control: a reserved quantity out of step with the ledger and orders is reported');
update public.inventory_balances b set reserved = reserved - 1 from public.products p
 where p.id = b.product_id and p.sku = 'JAN-2207' and p.organization_id = '00000000-0000-4000-a000-000000000001';

-- Negative control: with the hard gate removed, the invalid order above would
-- be approved, so the gate tests really depend on the gate.
create or replace function private.intake_gate(p_intake public.inbound_orders, p_mode text)
returns jsonb language sql stable set search_path = '' as $$ select '[]'::jsonb $$;
select is(pg_temp.approve((select id from u where role = 'approver'), pg_temp.id('G-AI'))::jsonb ->> 'ok', 'true',
  'negative control: without the gate an order with unconfirmed AI values is approved');

-- Negative control: without the partial unique index, an accidental duplicate
-- sales order is accepted, so the backstop is what stops it.
drop index public.sales_orders_po_number_unique_idx;
select pg_temp.intake('N-DUP', '00000000-0000-4000-a200-000000000001', 'PO-T1001', '[{"sku": "JAN-1001", "qty": 1, "price": 8.95}]', null, 'in_review');
select lives_ok(format($$insert into public.sales_orders (organization_id, order_number, inbound_order_id, customer_id, customer_po_number, currency, ship_to, subtotal, approved_by, approved_at)
  values ('00000000-0000-4000-a000-000000000001', 'SO-2026-990001', %L, '00000000-0000-4000-a200-000000000001', 'PO-T1001', 'USD', '{}', 0, '00000000-0000-4000-a500-000000000003', now())$$, pg_temp.id('N-DUP')),
  'negative control: without the backstop index a duplicate PO number would be stored');

select * from finish();
rollback;
