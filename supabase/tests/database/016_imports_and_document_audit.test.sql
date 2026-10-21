-- CSV imports (FR-CUST-09, FR-PROD-06, FR-INV-08) and download events (FR-AUD-07).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

create function pg_temp.run(p_user uuid, p_sql text, p_aal text default 'aal1') returns text language plpgsql as $$
declare v text; v_session uuid;
begin
  if p_aal = 'aal2' then
    insert into auth.sessions (id, user_id, aal, created_at, updated_at) values (gen_random_uuid(), p_user, 'aal2', now(), now()) returning id into v_session;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', v_session)::text, true);
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

-- Owner (a5…01, AAL2), Admin (a5…02), Processor (a5…04).
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select public.import_customers('00000000-0000-4000-a000-000000000001', '[{"name": "X"}]')::text$$), '^ERR:42501', 'a Processor cannot import');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000002',
  $$select public.import_customers('00000000-0000-4000-a000-000000000001', '[{"name": "X"}]')::text$$), '^ERR:42501:mfa_required', 'an Admin needs MFA to import');

-- Customers: preview, row errors, all-or-nothing.
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select public.import_customers('00000000-0000-4000-a000-000000000001', '[{"name": "Cedar Lane Clinics", "account_number": "C-2001", "ship_line1": "9 Elm St", "ship_country": "us"}, {"name": "", "account_number": "C-1042"}, {"name": "Dup", "account_number": "C-2001"}]')::text$$, 'aal2')::jsonb -> 'errors',
  '[{"row": 2, "message": "name is required (at most 200 characters)"}, {"row": 3, "message": "account number appears twice in the file"}]'::jsonb,
  'the preview lists every invalid row');
select is((select count(*)::int from public.customers where name = 'Cedar Lane Clinics'), 0, 'a preview writes nothing');
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_customers('00000000-0000-4000-a000-000000000001', '[{"name": "Cedar Lane Clinics", "account_number": "C-2001"}, {"name": "Bad", "email": "nope"}]', false) ->> 'ok')$$, 'aal2'),
  'false', 'an import with an invalid row is refused');
select is((select count(*)::int from public.customers where name = 'Cedar Lane Clinics'), 0, 'nothing is written when any row is invalid');
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_customers('00000000-0000-4000-a000-000000000001', '[{"name": "Cedar Lane Clinics", "account_number": "C-2001", "ship_line1": "9 Elm St", "ship_country": "us"}, {"name": "Birch Row Dental"}]', false) ->> 'created')$$, 'aal2'),
  '2', 'valid rows are imported');
select is((select country_code::text || '/' || is_default from public.customer_addresses a join public.customers c on c.id = a.customer_id where c.name = 'Cedar Lane Clinics'),
  'US/true', 'the shipping address becomes the default');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_customers('00000000-0000-4000-a000-000000000001', '[{"name": "Again", "account_number": "c 2001"}]') -> 'errors' -> 0 ->> 'message')$$, 'aal2'),
  'already exists', 'existing account numbers are caught (normalised)');

-- Products.
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_products('00000000-0000-4000-a000-000000000001', '[{"sku": "jan-1001", "name": "X", "selling_uom": "EA", "list_price": "1"}, {"sku": "NEW-9", "name": "Y", "selling_uom": "ZZ", "list_price": "1"}, {"sku": "NEW-10", "name": "Z", "selling_uom": "EA", "list_price": "1.12345"}]') -> 'errors')$$, 'aal2')::jsonb,
  '[{"row": 1, "message": "a product with this SKU already exists"}, {"row": 2, "message": "selling_uom is not a known unit (for example EA, CS, BX, KG)"}, {"row": 3, "message": "list_price must be a number with at most 4 decimals"}]'::jsonb,
  'product rows are validated (existing SKU, unit, price decimals)');
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_products('00000000-0000-4000-a000-000000000001', '[{"sku": "TAPE-75", "name": "Packing tape 75 mm", "selling_uom": "rl", "list_price": "4.10", "reorder_point": "20"}, {"sku": "SVC-1", "name": "Delivery fee", "selling_uom": "EA", "list_price": "15", "track_inventory": "false"}]', false) ->> 'created')$$, 'aal2'),
  '2', 'products are imported');
select is((select count(*)::int from public.stock_levels where sku in ('TAPE-75', 'SVC-1')), 1, 'only the tracked import appears in the stock list');

-- Opening stock.
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_opening_stock('00000000-0000-4000-a000-000000000001', '[{"sku": "NOPE", "quantity": "1"}, {"sku": "SVC-1", "quantity": "1"}, {"sku": "JAN-1001", "quantity": "1.5"}]') -> 'errors')$$, 'aal2')::jsonb,
  '[{"row": 1, "message": "no product with this SKU"}, {"row": 2, "message": "this product does not track inventory"}, {"row": 3, "message": "quantity must have at most 0 decimal places"}]'::jsonb,
  'opening stock rows are validated');
select is(pg_temp.run('00000000-0000-4000-a500-000000000001',
  $$select (public.import_opening_stock('00000000-0000-4000-a000-000000000001', '[{"sku": "TAPE-75", "quantity": "120"}, {"sku": "JAN-1001", "quantity": "640"}]', false) ->> 'created')$$, 'aal2'),
  '1', 'only rows that change stock are recorded');
select is((select on_hand::text || '/' || (select adjustment_reason::text from public.inventory_movements m where m.product_id = s.product_id order by id desc limit 1)
             from public.stock_levels s where sku = 'TAPE-75'), '120.000/opening_balance', 'stock is set with an opening-balance adjustment');
select is((select count(*)::int from private.inventory_integrity_report('00000000-0000-4000-a000-000000000001')), 0, 'the ledger still explains every balance');

-- Document downloads.
insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
values ('00000000-0000-4000-e900-000000000001', '00000000-0000-4000-a000-000000000001', 'po.pdf', 'application/pdf', 10, 1, repeat('9', 64), 'stored', '00000000-0000-4000-a500-000000000004', now());
select is(pg_temp.run('00000000-0000-4000-a500-000000000006',
  $$select public.record_document_download('00000000-0000-4000-e900-000000000001')::text$$), '', 'a member''s download is recorded');
select matches(pg_temp.run('00000000-0000-4000-b500-000000000006',
  $$select public.record_document_download('00000000-0000-4000-e900-000000000001')::text$$), '^ERR:P0002', 'another workspace cannot record (or see) it');

select * from finish();
rollback;
