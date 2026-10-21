-- Phase 5: backorders handled externally, timelines, dashboard figures.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

create function pg_temp.run(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
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

-- A fully backordered, approved order (JAN-4402 has 48; order 60, reserve 48).
do $$
declare v_doc uuid := gen_random_uuid(); v_intake uuid := gen_random_uuid(); v_line uuid := gen_random_uuid();
begin
  insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
  values (v_doc, '00000000-0000-4000-a000-000000000001', 'b.pdf', 'application/pdf', 10, 1, repeat('c', 64), 'stored', '00000000-0000-4000-a500-000000000004', now());
  insert into public.inbound_orders (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number, currency, ship_to,
    validated_version, submitted_by, submitted_at)
  values (v_intake, '00000000-0000-4000-a000-000000000001', 'IN-940001', v_doc, 'pending_approval', '00000000-0000-4000-a200-000000000002', 'NG-BO-1', 'USD',
    '{"line1": "1 Way"}', 1, '00000000-0000-4000-a500-000000000004', now());
  insert into public.inbound_order_lines (id, organization_id, inbound_order_id, line_no, product_id, match_method, quantity, unit_price, price_source)
  values (v_line, '00000000-0000-4000-a000-000000000001', v_intake, 1, '00000000-0000-4000-a400-000000000003', 'sku', 60, 38.50, 'list_price');
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a500-000000000003', 'role', 'authenticated')::text, true);
  perform public.approve_inbound_order(v_intake, 1, jsonb_build_object(v_line::text, 'backorder'));
  perform set_config('request.jwt.claims', '', true);
end $$;
create temp table so as select l.id as line_id, l.sales_order_id from public.sales_order_lines l join public.sales_orders s on s.id = l.sales_order_id where s.customer_po_number = 'NG-BO-1';
grant select on so to authenticated;

select is((select backordered_qty from public.sales_order_lines where id = (select line_id from so)), 12.000::numeric, 'the line has a 12 unit backorder');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.mark_backorder_handled(%L, 'Shipped by supplier')::text$$, (select line_id from so))), '^ERR:42501', 'a Processor cannot mark a backorder handled');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  format($$select public.mark_backorder_handled(%L, ' ')::text$$, (select line_id from so))), '^ERR:22023', 'a reason is required');
create temp table before_stock as select on_hand, reserved from public.inventory_balances where product_id = '00000000-0000-4000-a400-000000000003';
select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  format($$select public.mark_backorder_handled(%L, 'Drop-shipped by supplier on 21 Oct')::text$$, (select line_id from so)))::jsonb ->> 'ok',
  'true', 'an Inventory Manager marks the backorder handled externally');
select is((select on_hand::text || '/' || reserved from public.inventory_balances where product_id = '00000000-0000-4000-a400-000000000003'),
  (select on_hand::text || '/' || reserved from before_stock), 'inventory is unchanged (D-35)');
select is((select backordered_qty::text || '/' || backorder_handled_reason from public.sales_order_lines where id = (select line_id from so)),
  '12.000/Drop-shipped by supplier on 21 Oct', 'the backordered quantity stays; the reason is recorded');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  format($$select public.mark_backorder_handled(%L, 'again')::text$$, (select line_id from so))), '^ERR:55000', 'it can be marked only once');
select ok(exists (select 1 from public.audit_events where action = 'sales_order_line.backorder_handled'), 'the decision is audited');

-- Timelines: every member sees a record's history; other workspaces do not.
select ok(pg_temp.run('00000000-0000-4000-a500-000000000006',
  format($$select count(*)::text from public.entity_timeline('sales_order', %L)$$, (select sales_order_id from so)))::int >= 3,
  'a Viewer sees the sales order timeline, including its lines');
select matches(pg_temp.run('00000000-0000-4000-b500-000000000003',
  format($$select count(*)::text from public.entity_timeline('sales_order', %L)$$, (select sales_order_id from so))), '^ERR:P0002',
  'another workspace sees not found');
select is(pg_temp.run('00000000-0000-4000-a500-000000000006',
  $$select count(*)::text from public.audit_events$$), '0', 'the full audit log stays Approver and above');

-- Dashboard figures.
select is(pg_temp.run('00000000-0000-4000-a500-000000000006',
  $$select (public.dashboard_summary('00000000-0000-4000-a000-000000000001') ->> 'to_fulfil')$$), '1', 'the dashboard counts orders to fulfil');
select matches(pg_temp.run('00000000-0000-4000-b500-000000000006',
  $$select public.dashboard_summary('00000000-0000-4000-a000-000000000001')::text$$), '^ERR:P0002', 'another workspace''s figures are not visible');

select * from finish();
rollback;
