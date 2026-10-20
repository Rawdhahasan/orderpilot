-- Inventory shape rules (DATABASE_ARCHITECTURE.md §6.3, §10).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select is(
  (select available from public.inventory_balances
    where product_id = '00000000-0000-4000-a400-000000000001'),
  640.000::numeric,
  'available is computed as on hand minus reserved'
);
select throws_ok(
  $$update public.inventory_balances set on_hand = -1 where product_id = '00000000-0000-4000-a400-000000000001'$$,
  '23514', null, 'on hand can never go negative (D-09)'
);
select throws_ok(
  $$update public.inventory_balances set reserved = -1 where product_id = '00000000-0000-4000-a400-000000000001'$$,
  '23514', null, 'reserved can never go negative'
);
select lives_ok(
  $$update public.inventory_balances set reserved = 50 where product_id = '00000000-0000-4000-a400-000000000003'$$,
  'reserved above on hand is allowed (over-committed, FR-INV-05)'
);
select is(
  (select available from public.inventory_balances where product_id = '00000000-0000-4000-a400-000000000003'),
  -2.000::numeric,
  'over-committed stock shows negative availability'
);
select throws_ok(
  $$insert into public.inventory_balances (organization_id, product_id, location_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b400-000000000001', '00000000-0000-4000-a100-000000000001')$$,
  '23503', null, 'a balance cannot reference a product in another workspace'
);
select throws_ok(
  $$insert into public.locations (organization_id, code, name, is_default)
    values ('00000000-0000-4000-a000-000000000001', 'CMH-2', 'Second default', true)$$,
  '23505', null, 'one default location per workspace (D-11)'
);
select lives_ok(
  $$insert into public.locations (organization_id, code, name)
    values ('00000000-0000-4000-a000-000000000001', 'CMH-2', 'Overflow store')$$,
  'additional non-default locations are allowed (D-11)'
);

-- Movement shapes ---------------------------------------------------------------
select lives_ok(
  $$insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 'receipt', 10, 0, 650, 0, 'DN-1')$$,
  'a receipt adds on hand only'
);
select throws_ok(
  $$insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, on_hand_delta, reserved_delta, on_hand_after, reserved_after)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 'receipt', -10, 0, 630, 0)$$,
  '23514', null, 'a receipt cannot reduce stock'
);
select throws_ok(
  $$insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, on_hand_delta, reserved_delta, on_hand_after, reserved_after)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 'adjustment', -3, 0, 637, 0)$$,
  '23514', null, 'an adjustment needs a reason code'
);
select throws_ok(
  $$insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, on_hand_delta, reserved_delta, on_hand_after, reserved_after)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 'reservation', 0, 5, 640, 5)$$,
  '23514', null, 'a reservation must belong to a sales order line'
);
select throws_ok(
  $$insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, adjustment_reason, on_hand_delta, reserved_delta, on_hand_after, reserved_after)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 'adjustment', 'damaged', -700, 0, -60, 0)$$,
  '23514', null, 'a movement can never leave on hand below zero'
);
select is(
  (select count(*)::int from public.inventory_movements where adjustment_reason = 'opening_balance'),
  (select count(*)::int from public.inventory_balances),
  'every seeded balance is explained by an opening-balance movement (invariant I-2)'
);

select * from finish();
rollback;
