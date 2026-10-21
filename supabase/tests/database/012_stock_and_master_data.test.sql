-- Phase 3: stock receipts and adjustments, stock levels, duplicate customers.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

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

-- Northstar: a5…05 Inventory Manager (Marc), a5…04 Processor, a5…06 Viewer; b5…05 Bayview Inventory Manager.
-- JAN-1001 (a4…01) 640 on hand, whole units; FS-6300 (a4…04) 142.5, 1 decimal; FS-7002 (a4…05) untracked.
select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000001', 60, 'DN-4471', 'Pallet 3')::text$$)::jsonb ->> 'on_hand',
  '700.000', 'an Inventory Manager receives stock');
select is((select reference || '/' || note || '/' || movement_type from public.inventory_movements
            where product_id = '00000000-0000-4000-a400-000000000001' order by id desc limit 1),
  'DN-4471/Pallet 3/receipt', 'the receipt movement keeps its reference and note');
select ok((select actor_user_id = '00000000-0000-4000-a500-000000000005' from public.inventory_movements
            where product_id = '00000000-0000-4000-a400-000000000001' order by id desc limit 1),
  'the movement is attributed to the person');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000001', 1)::text$$), '^ERR:42501', 'a Processor cannot change stock');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000006',
  $$select public.adjust_stock('00000000-0000-4000-a400-000000000001', 'delta', -1, 'damaged')::text$$), '^ERR:42501', 'a Viewer cannot change stock');
select matches(pg_temp.run('00000000-0000-4000-b500-000000000005',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000001', 1)::text$$), '^ERR:P0002', 'another workspace sees not found');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000001', 1.5)::text$$), '^ERR:22023', 'quantities respect the product decimals');
select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000004', 0.5)::text$$)::jsonb ->> 'on_hand', '143.000', 'decimal products accept decimal quantities');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000001', 0)::text$$), '^ERR:22023', 'a receipt needs a positive quantity');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.receive_stock('00000000-0000-4000-a400-000000000005', 5)::text$$), '^ERR:55000', 'untracked products take no stock movements (M-01)');

select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.adjust_stock('00000000-0000-4000-a400-000000000001', 'delta', -20, 'damaged', 'Water damage')::text$$)::jsonb ->> 'on_hand',
  '680.000', 'an adjustment by a quantity');
select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.adjust_stock('00000000-0000-4000-a400-000000000001', 'count', 650, 'cycle_count')::text$$)::jsonb ->> 'delta',
  '-30.000', 'a counted quantity is turned into a delta under the lock');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.adjust_stock('00000000-0000-4000-a400-000000000001', 'delta', -700, 'lost')::text$$), '^ERR:22023:validation_failed: on hand cannot go below zero',
  'on hand never goes below zero (FR-INV-05)');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.adjust_stock('00000000-0000-4000-a400-000000000001', 'delta', 5, null)::text$$), '^ERR:22023', 'an adjustment needs a reason');

-- Over-commitment: reserve 10, then count 4 on hand.
update public.inventory_balances set reserved = 10 where product_id = '00000000-0000-4000-a400-000000000003';
select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$select public.adjust_stock('00000000-0000-4000-a400-000000000003', 'count', 4, 'cycle_count')::text$$)::jsonb ->> 'over_committed',
  'true', 'a count below the reserved quantity is allowed and reported as over-committed');
select is((select stock_status from public.stock_levels where product_id = '00000000-0000-4000-a400-000000000003'), 'over_committed',
  'the stock list flags the product as over-committed');
update public.inventory_balances set reserved = 0 where product_id = '00000000-0000-4000-a400-000000000003';

select is((select count(*)::int from public.stock_levels where product_id = '00000000-0000-4000-a400-000000000005'), 0,
  'untracked products are not in the stock list');
select is(pg_temp.run('00000000-0000-4000-b500-000000000006', $$select count(*)::text from public.stock_levels where organization_id = '00000000-0000-4000-a000-000000000001'$$),
  '0', 'the stock list shows only the caller''s workspace');

-- New tracked products get a balance immediately.
select is(pg_temp.run('00000000-0000-4000-a500-000000000005',
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price) values ('00000000-0000-4000-a000-000000000001', 'NEW-1', 'New item', 'EA', 2) returning 'ok'$$),
  'ok', 'an Inventory Manager creates a product');
select is((select on_hand::text || '/' || stock_status from public.stock_levels where sku = 'NEW-1'), '0.000/out_of_stock',
  'a new tracked product appears in the stock list with zero stock');

-- Possible duplicate customers (FR-CUST-08).
select is(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select string_agg(name, ',') from public.find_similar_customers('00000000-0000-4000-a000-000000000001', 'Harbour and Pine Supply')$$),
  'Harbor & Pine Supply', 'a close name match is suggested as a possible duplicate');
select is(pg_temp.run('00000000-0000-4000-b500-000000000004',
  $$select count(*)::text from public.find_similar_customers('00000000-0000-4000-a000-000000000001', 'Harbor & Pine Supply')$$),
  '0', 'the duplicate check never reveals another workspace''s customers');

select * from finish();
rollback;
