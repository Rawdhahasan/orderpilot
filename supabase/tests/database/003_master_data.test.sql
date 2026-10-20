-- Master data constraints and tenant-safe references.
-- Seed: Northstar 0000…a000…01, Bayview 0000…b000…01 (supabase/seed.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- Workspaces ------------------------------------------------------------------
select is(
  (select require_independent_approval from public.organizations where slug = 'northstar'),
  true,
  'independent approval is on by default (D-05)'
);
select throws_ok(
  $$insert into public.organizations (name, slug, country_code, base_currency, timezone)
    values ('Bad slug', 'Bad Slug', 'US', 'USD', 'America/New_York')$$,
  '23514', null, 'workspace slugs are lowercase letters, digits and hyphens'
);
select throws_ok(
  $$insert into public.organizations (name, slug, country_code, base_currency, timezone)
    values ('Yen shop', 'yen-shop', 'JP', 'JPY', 'Asia/Tokyo')$$,
  '23503', null, 'base currency must be one of the supported currencies (D-12)'
);
select throws_ok(
  $$update public.organizations set confidence_threshold = 1.5 where slug = 'northstar'$$,
  '23514', null, 'confidence threshold stays between 0 and 1'
);

-- Customers -------------------------------------------------------------------
select throws_ok(
  $$insert into public.customers (organization_id, name, status)
    values ('00000000-0000-4000-a000-000000000001', 'Hold without reason', 'on_hold')$$,
  '23514', null, 'a customer on hold needs a hold reason'
);
select throws_ok(
  $$insert into public.customers (organization_id, name, status, hold_reason)
    values ('00000000-0000-4000-a000-000000000001', 'Blank reason', 'on_hold', '   ')$$,
  '23514', null, 'a blank hold reason is rejected'
);
select throws_ok(
  $$insert into public.customers (organization_id, name, status, hold_reason)
    values ('00000000-0000-4000-a000-000000000001', 'Active with reason', 'active', 'Stale reason')$$,
  '23514', null, 'only customers on hold keep a hold reason'
);
select throws_ok(
  $$insert into public.customers (organization_id, account_number, name)
    values ('00000000-0000-4000-a000-000000000001', 'c 1042', 'Duplicate account')$$,
  '23505', null, 'account numbers are unique per workspace after normalisation'
);
select lives_ok(
  $$insert into public.customers (organization_id, account_number, name)
    values ('00000000-0000-4000-b000-000000000001', 'C-1042', 'Same account, other workspace')$$,
  'the same account number may exist in another workspace'
);
select throws_ok(
  $$update public.customers set account_number_normalized = 'X' where account_number = 'C-1042'$$,
  '428C9', null, 'normalised keys cannot be written directly'
);

-- Addresses -------------------------------------------------------------------
select throws_ok(
  $$insert into public.customer_addresses (organization_id, customer_id, type, line1, country_code)
    values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a200-000000000001', 'shipping', '1 Elsewhere', 'GB')$$,
  '23503', null, 'an address cannot attach to a customer in another workspace'
);
select throws_ok(
  $$insert into public.customer_addresses (organization_id, customer_id, type, line1, country_code, is_default)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', 'shipping', '88 Ouellette Ave', 'CA', true)$$,
  '23505', null, 'one default address per customer and type'
);
select is(
  (select match_key from public.customer_addresses where id = '00000000-0000-4000-a300-000000000002'),
  '2250WALKERRDDOCK4|N8W3P6',
  'address match key is generated'
);

-- Products --------------------------------------------------------------------
select throws_ok(
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price)
    values ('00000000-0000-4000-a000-000000000001', 'jan-1001', 'Case clash', 'EA', 1)$$,
  '23505', null, 'SKUs are unique per workspace regardless of case'
);
select lives_ok(
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price)
    values ('00000000-0000-4000-b000-000000000001', 'JAN-2207', 'Same SKU, other workspace', 'CS', 1)$$,
  'the same SKU may exist in another workspace'
);
select throws_ok(
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price, gtin)
    values ('00000000-0000-4000-a000-000000000001', 'BAD-GTIN', 'Bad GTIN', 'EA', 1, '4006381333932')$$,
  '23514', null, 'GTIN check digits are validated'
);
select throws_ok(
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price)
    values ('00000000-0000-4000-a000-000000000001', 'NEG-1', 'Negative price', 'EA', -0.01)$$,
  '23514', null, 'list prices cannot be negative'
);
select throws_ok(
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price)
    values ('00000000-0000-4000-a000-000000000001', 'UOM-1', 'Unknown unit', 'XYZ', 1)$$,
  '23503', null, 'selling unit must be a known unit of measure'
);
select throws_ok(
  $$insert into public.products (organization_id, sku, name, selling_uom, list_price, quantity_decimals, reorder_point)
    values ('00000000-0000-4000-a000-000000000001', 'DEC-1', 'Whole units', 'EA', 1, 0, 2.5)$$,
  '23514', null, 'reorder point respects the product''s allowed decimals'
);

-- Aliases and customer prices -------------------------------------------------
select throws_ok(
  $$insert into public.customer_item_aliases (organization_id, customer_id, product_id, customer_part_number)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000003', 'hp 221')$$,
  '23505', null, 'one active alias per customer part number (after normalisation)'
);
select throws_ok(
  $$insert into public.customer_item_aliases (organization_id, customer_id, product_id, customer_part_number)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-b400-000000000001', 'HP-999')$$,
  '23503', null, 'an alias cannot point at a product in another workspace'
);
select throws_ok(
  $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from, valid_to)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000002', 42.0000, '2026-10-01', '2026-12-31')$$,
  '23P01', null, 'customer price validity ranges cannot overlap'
);
select lives_ok(
  $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from, valid_to)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000001', 8.5000, '2026-01-01', '2026-06-30')$$,
  'non-overlapping price for another product is accepted'
);
select lives_ok(
  $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from, valid_to)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000001', 8.7500, '2026-07-01', null)$$,
  'an adjacent, open-ended price range is accepted'
);

select * from finish();
rollback;
