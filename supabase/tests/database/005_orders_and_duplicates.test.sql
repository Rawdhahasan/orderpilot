-- Intake, exception, sales order and duplicate-safety constraints.
-- docs/DATABASE_ARCHITECTURE.md §6.4–§6.5 and §12.1.
--
-- Phase 2A proves what the schema guarantees on its own. The approval-time
-- conflict re-check, advisory lock and concurrent-approval tests are Phase 2D
-- (TESTING_STRATEGY.md §5.5, §5.7, §7).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

-- This file proves what the schema guarantees on its own, so the Phase 2D
-- status guard (tested in 010) is switched off for this transaction only.
alter table public.inbound_orders disable trigger inbound_orders_guard_status;
alter table public.sales_orders disable trigger sales_orders_guard_status;
alter table public.extraction_runs disable trigger extraction_runs_guard_status;

-- Fixtures (fictional) ----------------------------------------------------------
-- Northstar workspace, customers Harbor & Pine (a2…01) and Northgate (a2…02).
create function pg_temp.profile(p_id uuid, p_name text) returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, lower(replace(p_name, ' ', '.')) || '@test.example', jsonb_build_object('full_name', p_name));
  return p_id;
end $$;

-- A stored document plus an intake awaiting approval.
create function pg_temp.intake(p_id uuid, p_ref text, p_customer uuid, p_po text) returns uuid language plpgsql as $$
declare v_doc uuid := gen_random_uuid();
begin
  insert into public.source_documents
    (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
  values
    (v_doc, '00000000-0000-4000-a000-000000000001', p_ref || '.pdf', 'application/pdf', 1000, 1,
     encode(sha256(convert_to(p_ref, 'UTF8')), 'hex'), 'stored', '00000000-0000-4000-c000-000000000002', now());
  insert into public.inbound_orders
    (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number, submitted_by, submitted_at)
  values
    (p_id, '00000000-0000-4000-a000-000000000001', p_ref, v_doc, 'pending_approval', p_customer, p_po,
     '00000000-0000-4000-c000-000000000002', now());
  return p_id;
end $$;

-- Creates the sales order and marks the intake approved, as approval will.
create function pg_temp.approve(p_intake uuid, p_so uuid, p_number text, p_override uuid default null)
returns uuid language plpgsql as $$
declare v_customer uuid; v_po text;
begin
  select customer_id, customer_po_number into v_customer, v_po from public.inbound_orders where id = p_intake;
  insert into public.sales_orders
    (id, organization_id, order_number, inbound_order_id, customer_id, customer_po_number,
     duplicate_override_exception_id, currency, ship_to, subtotal, approved_by, approved_at)
  values
    (p_so, '00000000-0000-4000-a000-000000000001', p_number, p_intake, v_customer, v_po,
     p_override, 'USD', '{"line1": "77 Industrial Ct"}', 0, '00000000-0000-4000-c000-000000000001', now());
  update public.inbound_orders
     set status = 'approved', sales_order_id = p_so,
         decided_by = '00000000-0000-4000-c000-000000000001', decided_at = now()
   where id = p_intake;
  return p_so;
end $$;

-- An Approver's override of a duplicate PO number on an intake.
create function pg_temp.duplicate_override(p_intake uuid, p_conflicts jsonb) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.order_exceptions
    (id, organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
     override_reason, overridden_by, overridden_at, override_fingerprint, override_conflicts)
  values
    (v_id, '00000000-0000-4000-a000-000000000001', p_intake, 'DUPLICATE_PO_NUMBER', 'blocking', true, 'overridden',
     'PO 88213 from Harbor & Pine was already received.', repeat('a', 64),
     'Customer reuses PO numbers for weekly releases', '00000000-0000-4000-c000-000000000001', now(),
     repeat('b', 64), p_conflicts);
  return v_id;
end $$;

do $$
begin
  perform pg_temp.profile('00000000-0000-4000-c000-000000000001', 'Test Approver');
  perform pg_temp.profile('00000000-0000-4000-c000-000000000002', 'Test Processor');
  -- Intakes A, B and D are Harbor & Pine with PO numbers that normalise to 88213;
  -- C is Northgate with the same number.
  perform pg_temp.intake('00000000-0000-4000-d000-00000000000a', 'IN-900001', '00000000-0000-4000-a200-000000000001', 'PO-88213');
  perform pg_temp.intake('00000000-0000-4000-d000-00000000000b', 'IN-900002', '00000000-0000-4000-a200-000000000001', '88213');
  perform pg_temp.intake('00000000-0000-4000-d000-00000000000c', 'IN-900003', '00000000-0000-4000-a200-000000000002', '88213');
  perform pg_temp.intake('00000000-0000-4000-d000-00000000000d', 'IN-900004', '00000000-0000-4000-a200-000000000001', 'po 88213');
  -- An upload still being verified (pending).
  insert into public.source_documents (organization_id, original_filename, mime_type, uploaded_by)
  values ('00000000-0000-4000-a000-000000000001', 'pending-upload.pdf', 'application/pdf', '00000000-0000-4000-c000-000000000002');
end $$;

-- Intake rules -----------------------------------------------------------------
select is(
  (select storage_path from public.source_documents d join public.inbound_orders i on i.source_document_id = d.id
    where i.reference = 'IN-900001'),
  (select d.organization_id::text || '/' || d.id::text from public.source_documents d join public.inbound_orders i on i.source_document_id = d.id
    where i.reference = 'IN-900001'),
  'storage path is always {organization_id}/{document_id}'
);
select is(
  (select customer_po_number_normalized from public.inbound_orders where reference = 'IN-900004'),
  '88213',
  'intake PO numbers are normalised with the fixed rule'
);
select throws_ok(
  $$update public.inbound_orders set status = 'approved' where reference = 'IN-900001'$$,
  '23514', null, 'an intake cannot be approved without its sales order'
);
select throws_ok(
  $$update public.inbound_orders set status = 'cancelled', cancelled_by = '00000000-0000-4000-c000-000000000002', cancelled_at = now()
     where reference = 'IN-900001'$$,
  '23514', null, 'a cancelled intake needs a cancel reason'
);
select throws_ok(
  $$update public.inbound_orders set status = 'cancelled', cancel_reason = 'other', cancelled_by = '00000000-0000-4000-c000-000000000002', cancelled_at = now()
     where reference = 'IN-900001'$$,
  '23514', null, 'cancel reason "other" needs a note'
);
select throws_ok(
  $$update public.inbound_orders set status = 'rejected', decided_by = '00000000-0000-4000-c000-000000000001', decided_at = now()
     where reference = 'IN-900001'$$,
  '23514', null, 'a rejected intake needs a decision reason'
);
select throws_ok(
  $$insert into public.inbound_orders (organization_id, reference, source_document_id)
    select organization_id, 'IN-900099', source_document_id from public.inbound_orders where reference = 'IN-900001'$$,
  '23505', null, 'one intake per document'
);
select throws_ok(
  $$update public.inbound_orders set customer_id = '00000000-0000-4000-b200-000000000001' where reference = 'IN-900001'$$,
  '23503', null, 'an intake cannot reference a customer in another workspace'
);
select throws_ok(
  $$update public.inbound_orders set ship_to_address_id = '00000000-0000-4000-a300-000000000003' where reference = 'IN-900001'$$,
  '23503', null, 'a selected ship-to address must belong to the confirmed customer'
);
select throws_ok(
  $$update public.source_documents set upload_status = 'rejected' where original_filename = 'pending-upload.pdf'$$,
  '23514', null, 'a rejected upload needs a reason'
);

-- Exceptions and overrides (D-34) ---------------------------------------------
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'DUPLICATE_PO_NUMBER', 'blocking', false, 'x', repeat('a', 64))$$,
  '23514', null, 'the overridable flag must match the exception catalogue'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
      override_reason, overridden_by, overridden_at, override_fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'UOM_MISMATCH', 'blocking', false, 'overridden', 'x', repeat('a', 64),
      'Approver says fine', '00000000-0000-4000-c000-000000000001', now(), repeat('b', 64))$$,
  '23514', null, 'exceptions outside the catalogue can never be overridden'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
      overridden_by, overridden_at, override_fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'CUSTOMER_ON_HOLD', 'blocking', true, 'overridden', 'x', repeat('a', 64),
      '00000000-0000-4000-c000-000000000001', now(), repeat('b', 64))$$,
  '23514', null, 'an override needs a written reason'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
      override_reason, overridden_by, overridden_at, override_fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'CUSTOMER_ON_HOLD', 'blocking', true, 'overridden', 'x', repeat('a', 64),
      '    ', '00000000-0000-4000-c000-000000000001', now(), repeat('b', 64))$$,
  '23514', null, 'a blank override reason is rejected'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
      override_reason, overridden_at, override_fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'CUSTOMER_ON_HOLD', 'blocking', true, 'overridden', 'x', repeat('a', 64),
      'Payment in transit', now(), repeat('b', 64))$$,
  '23514', null, 'an override records who made it'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
      override_reason, overridden_by, overridden_at)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'CUSTOMER_ON_HOLD', 'blocking', true, 'overridden', 'x', repeat('a', 64),
      'Payment in transit', '00000000-0000-4000-c000-000000000001', now())$$,
  '23514', null, 'an override records the fingerprint of what was reviewed'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
      override_reason, overridden_by, overridden_at, override_fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'DUPLICATE_PO_NUMBER', 'blocking', true, 'overridden', 'x', repeat('a', 64),
      'Weekly release', '00000000-0000-4000-c000-000000000001', now(), repeat('b', 64))$$,
  '23514', null, 'a duplicate override names the specific conflicts reviewed'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint, resolved_by, resolved_at)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'SHIP_TO_MISSING', 'blocking', false, 'acknowledged', 'x', repeat('a', 64),
      '00000000-0000-4000-c000-000000000002', now())$$,
  '23514', null, 'only warnings can be acknowledged'
);
select lives_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'SHIP_TO_MISSING', 'blocking', false, 'No ship-to found', repeat('a', 64))$$,
  'an open header exception can be recorded'
);
select throws_ok(
  $$insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000a', 'SHIP_TO_MISSING', 'blocking', false, 'Again', repeat('c', 64))$$,
  '23505', null, 'one row per rule and scope, header exceptions included'
);

-- Extraction runs (durable queue, M-04) ---------------------------------------
select lives_ok(
  $$insert into public.extraction_runs (organization_id, inbound_order_id, source_document_id, provider)
    select organization_id, id, source_document_id, 'simulated' from public.inbound_orders where reference = 'IN-900001'$$,
  'a queued extraction run can be created'
);
select throws_ok(
  $$update public.extraction_runs set status = 'running' where provider = 'simulated'$$,
  '23514', null, 'a running job must hold a claim token and lease'
);
select throws_ok(
  $$insert into public.extraction_runs (organization_id, inbound_order_id, source_document_id, provider, attempt, max_attempts)
    select organization_id, id, source_document_id, 'simulated', 4, 3 from public.inbound_orders where reference = 'IN-900001'$$,
  '23514', null, 'attempts never exceed the retry limit'
);
select throws_ok(
  $$update public.extraction_runs set status = 'failed', finished_at = now() where provider = 'simulated'$$,
  '23514', null, 'a failed run records its failure kind and error code'
);

-- Sales orders and duplicate safety (§12.1) -------------------------------------
select lives_ok(
  $$select pg_temp.approve('00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-e000-00000000000a', 'SO-2026-900001')$$,
  'the first order for Harbor & Pine PO-88213 is created'
);
select throws_ok(
  $$select pg_temp.approve('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-e000-00000000000b', 'SO-2026-900002')$$,
  '23505', null, 'an accidental duplicate (88213 = PO-88213) is rejected by the database'
);
select lives_ok(
  $$select pg_temp.approve('00000000-0000-4000-d000-00000000000c', '00000000-0000-4000-e000-00000000000c', 'SO-2026-900003')$$,
  'the same PO number from a different customer is not a duplicate (Q-1)'
);
select throws_ok(
  $$select pg_temp.approve('00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-e000-0000000000aa', 'SO-2026-900010')$$,
  '23505', null, 'an intake can never produce a second sales order'
);

-- An open (not overridden) duplicate exception does not authorise a duplicate.
insert into public.order_exceptions (id, organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
values ('00000000-0000-4000-f000-0000000000b0', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000b',
        'DUPLICATE_PO_NUMBER', 'blocking', true, 'Already received', repeat('a', 64));
select throws_ok(
  $$select pg_temp.approve('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-e000-00000000000b', 'SO-2026-900002',
      '00000000-0000-4000-f000-0000000000b0')$$,
  '23503', null, 'an open duplicate exception cannot authorise a duplicate order'
);
-- Exceptions are never deleted (Phase 2B); this one is overridden below instead.

-- An override recorded on a different intake does not authorise this one.
select throws_ok(
  format(
    $$select pg_temp.approve('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-e000-00000000000b', 'SO-2026-900002', %L)$$,
    pg_temp.duplicate_override('00000000-0000-4000-d000-00000000000d', '[{"type": "sales_order", "id": "00000000-0000-4000-e000-00000000000a"}]')
  ),
  '23503', null, 'an override from another intake cannot be reused'
);

-- The intake's own, complete override authorises exactly this duplicate.
update public.order_exceptions
   set status = 'overridden', override_reason = 'Customer reuses PO numbers for weekly releases',
       overridden_by = '00000000-0000-4000-c000-000000000001', overridden_at = now(),
       override_fingerprint = repeat('b', 64),
       override_conflicts = '[{"type": "sales_order", "id": "00000000-0000-4000-e000-00000000000a"}]'
 where id = '00000000-0000-4000-f000-0000000000b0';
create temporary table b_override as select '00000000-0000-4000-f000-0000000000b0'::uuid as id;
select lives_ok(
  format(
    $$select pg_temp.approve('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-e000-00000000000b', 'SO-2026-900002', %L)$$,
    (select id from b_override)
  ),
  'an authorised duplicate is created with its own recorded override'
);
select is(
  (select duplicate_override from public.sales_orders where order_number = 'SO-2026-900002'),
  true,
  'the authorised duplicate is flagged as an override'
);
select throws_ok(
  format(
    $$update public.order_exceptions
         set status = 'open', override_reason = null, overridden_by = null, overridden_at = null,
             override_fingerprint = null, override_conflicts = null
       where id = %L$$,
    (select id from b_override)
  ),
  '23503', null, 'an override used by a sales order cannot be quietly re-opened'
);
select throws_ok(
  $$update public.sales_orders set duplicate_override_exception_id = null where order_number = 'SO-2026-900002'$$,
  '23505', null, 'removing the override from an authorised duplicate is rejected (the protection still applies)'
);

-- Cancellation frees the PO number (Q-2).
select throws_ok(
  $$update public.sales_orders set status = 'cancelled', cancelled_by = '00000000-0000-4000-c000-000000000001', cancelled_at = now()
     where order_number = 'SO-2026-900001'$$,
  '23514', null, 'a cancelled sales order needs a reason'
);
select lives_ok(
  $$update public.sales_orders
       set status = 'cancelled', cancelled_by = '00000000-0000-4000-c000-000000000001', cancelled_at = now(),
           cancel_reason = 'Customer changed quantities'
     where order_number = 'SO-2026-900001'$$,
  'a sales order can be cancelled with a reason'
);
select lives_ok(
  $$select pg_temp.approve('00000000-0000-4000-d000-00000000000d', '00000000-0000-4000-e000-00000000000d', 'SO-2026-900004')$$,
  'after cancellation the PO number can be used again without an override (Q-2)'
);
select throws_ok(
  $$update public.inbound_orders set sales_order_id = '00000000-0000-4000-e000-00000000000c'
     where id = '00000000-0000-4000-d000-00000000000d'$$,
  '23503', null, 'an intake can only point at its own sales order'
);
select throws_ok(
  $$update public.sales_orders set order_number = 'SO-2026-900003' where order_number = 'SO-2026-900004'$$,
  '23505', null, 'sales order numbers are unique per workspace'
);

-- Sales order lines (D-10, D-35, Q-5) -----------------------------------------
insert into public.inbound_order_lines (id, organization_id, inbound_order_id, line_no)
values ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-d000-00000000000c', 1);

create function pg_temp.line(p_qty numeric, p_price numeric, p_total numeric, p_allocated numeric, p_backordered numeric, p_line_no int)
returns void language sql as $$
  insert into public.sales_order_lines
    (organization_id, sales_order_id, line_no, product_id, sku, product_name, quantity, uom, unit_price,
     currency_minor_unit, line_total, price_source, match_method, allocated_qty, backordered_qty, source_inbound_order_line_id)
  values
    ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-e000-00000000000c', p_line_no,
     '00000000-0000-4000-a400-000000000001', 'JAN-1001', 'Nitrile exam gloves, medium, box of 100', p_qty, 'BX', p_price,
     2, p_total, 'list_price', 'alias', p_allocated, p_backordered, '00000000-0000-4000-f000-0000000000c1')
$$;

select lives_ok($$select pg_temp.line(30, 8.95, 268.50, 23, 7, 1)$$, 'a partly reserved line records allocated and backordered quantities');
select throws_ok($$select pg_temp.line(30, 8.95, 268.50, 23, 6, 2)$$, '23514', null, 'ordered quantity always equals allocated plus backordered');
select throws_ok($$select pg_temp.line(30, 8.95, 268.50, 31, -1, 3)$$, '23514', null, 'backordered quantity cannot be negative');
select lives_ok($$select pg_temp.line(3, 0.0125, 0.04, 3, 0, 4)$$, 'four-decimal unit prices round the total to cents (3 × 0.0125 = 0.04)');
select throws_ok($$select pg_temp.line(3, 0.0125, 0.03, 3, 0, 5)$$, '23514', null, 'a total that is not correctly rounded is rejected');
select throws_ok($$select pg_temp.line(3, 0.0125, 0.0375, 3, 0, 6)$$, '23514', null, 'an unrounded total is rejected');

select throws_ok(
  $$update public.sales_order_lines set backorder_handled_at = now(), backorder_handled_by = '00000000-0000-4000-c000-000000000001'
     where line_no = 1 and sales_order_id = '00000000-0000-4000-e000-00000000000c'$$,
  '23514', null, 'marking a backorder handled externally requires a reason (FR-SO-08)'
);
select throws_ok(
  $$update public.sales_order_lines set backorder_handled_at = now(), backorder_handled_by = '00000000-0000-4000-c000-000000000001',
         backorder_handled_reason = 'Shipped from ERP'
     where line_no = 4 and sales_order_id = '00000000-0000-4000-e000-00000000000c'$$,
  '23514', null, 'only a line with a backorder can be marked handled externally'
);
select lives_ok(
  $$update public.sales_order_lines set backorder_handled_at = now(), backorder_handled_by = '00000000-0000-4000-c000-000000000001',
         backorder_handled_reason = 'Shipped from ERP on 22 Oct'
     where line_no = 1 and sales_order_id = '00000000-0000-4000-e000-00000000000c'$$,
  'a backorder can be marked handled externally with a reason'
);
select is(
  (select backordered_qty from public.sales_order_lines where line_no = 1 and sales_order_id = '00000000-0000-4000-e000-00000000000c'),
  7.000::numeric,
  'marking a backorder handled never changes the backordered quantity'
);

select * from finish();
rollback;
