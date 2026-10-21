-- Performance check on a large fictional reference dataset (NFR targets,
-- PRODUCT_REQUIREMENTS.md §10). Everything runs in one transaction and is
-- rolled back. Run with: corepack pnpm perf:check
\timing on
\set ON_ERROR_STOP 1
begin;
set local orderpilot.transition = 'on';

-- A workspace for the check, with the Northstar Owner and Approver as members.
select public.create_organization('Perf Lab (fictional)', 'perf-lab', 'US', 'USD', 'America/Chicago', 'en-US',
  '00000000-0000-4000-a500-000000000001') as org \gset
insert into public.organization_members (organization_id, user_id, role)
values (:'org', '00000000-0000-4000-a500-000000000003', 'approver'), (:'org', '00000000-0000-4000-a500-000000000004', 'processor');

-- 5,000 products with stock, 2,000 customers.
insert into public.products (organization_id, sku, name, selling_uom, list_price)
select :'org', 'P-' || lpad(g::text, 5, '0'), 'Reference product ' || g, 'EA', 1 + (g % 50) from generate_series(1, 5000) g;
update public.inventory_balances set on_hand = 100000 where organization_id = :'org';
insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, adjustment_reason, on_hand_delta, reserved_delta, on_hand_after, reserved_after)
select organization_id, product_id, location_id, 'adjustment', 'opening_balance', 100000, 0, 100000, 0 from public.inventory_balances where organization_id = :'org';
insert into public.customers (organization_id, account_number, name)
select :'org', 'R-' || g, 'Reference customer ' || g from generate_series(1, 2000) g;

-- 50,000 customer POs across statuses.
insert into public.source_documents (organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
select :'org', 'po-' || g || '.pdf', 'application/pdf', 1000, 1, encode(sha256(convert_to('perf' || g, 'UTF8')), 'hex'), 'stored',
       '00000000-0000-4000-a500-000000000004', now()
  from generate_series(1, 50000) g;
insert into public.inbound_orders (organization_id, reference, source_document_id, status, customer_id, customer_po_number, created_at)
select d.organization_id, 'IN-' || lpad(row_number() over ()::text, 7, '0'), d.id,
       (array['in_review', 'received', 'extraction_failed', 'in_review'])[1 + (row_number() over ()) % 4]::public.inbound_order_status,
       (select id from public.customers where organization_id = :'org' order by id limit 1), 'REF-' || row_number() over (),
       now() - (row_number() over ()) * interval '1 minute'
  from public.source_documents d where d.organization_id = :'org';
analyze public.inbound_orders, public.source_documents, public.products, public.customers;

-- Signed in as the Processor (RLS applies) for the list queries.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a500-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
\echo '--- Customer PO list, first page (50,000 rows in the workspace)'
explain (analyze, costs off, timing off, summary on)
select id, reference, customer_po_number, status, created_at from public.inbound_orders
 where organization_id = :'org' order by created_at desc limit 25;
\echo '--- Customer PO list filtered by status'
explain (analyze, costs off, timing off, summary on)
select id, reference, status from public.inbound_orders
 where organization_id = :'org' and status = 'in_review' order by created_at desc limit 25;
\echo '--- Product search across 5,000 products'
explain (analyze, costs off, timing off, summary on)
select id, sku, name from public.products where organization_id = :'org' and (sku ilike '%P-0421%' or name ilike '%P-0421%') order by sku limit 25;
reset role;

-- A 200-line order for the approval target (under 2 s).
insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
values ('00000000-0000-4000-f000-000000000001', :'org', 'big.pdf', 'application/pdf', 1000, 5, repeat('f', 64), 'stored', '00000000-0000-4000-a500-000000000004', now());
insert into public.inbound_orders (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number, currency, ship_to,
  validated_version, submitted_by, submitted_at)
select '00000000-0000-4000-f000-000000000002', :'org', 'IN-9999999', '00000000-0000-4000-f000-000000000001', 'pending_approval',
       (select id from public.customers where organization_id = :'org' order by id offset 5 limit 1), 'BIG-200', 'USD', '{"line1": "1 Way"}', 1,
       '00000000-0000-4000-a500-000000000004', now();
insert into public.inbound_order_lines (organization_id, inbound_order_id, line_no, product_id, match_method, quantity, unit_price, price_source)
select :'org', '00000000-0000-4000-f000-000000000002', g, p.id, 'sku', 3, p.list_price, 'list_price'
  from generate_series(1, 200) g join lateral (select id, list_price from public.products where organization_id = :'org' order by sku offset g - 1 limit 1) p on true;

\echo '--- Review data for 200 lines (lines with products and expected prices)'
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a500-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, costs off, timing off, summary on)
select l.*, p.sku, p.name from public.inbound_order_lines l join public.products p on p.id = l.product_id
 where l.inbound_order_id = '00000000-0000-4000-f000-000000000002' order by l.line_no;
select count(*) as expected_prices from public.expected_prices('00000000-0000-4000-f000-000000000002');
reset role;

\echo '--- Approval of the 200-line order (one transaction: gate, locks, reservations, order, audit)'
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a500-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.approve_inbound_order('00000000-0000-4000-f000-000000000002', 1) ->> 'ok' as approved;
reset role;
select count(*) as integrity_violations from private.inventory_integrity_report(:'org');
rollback;
