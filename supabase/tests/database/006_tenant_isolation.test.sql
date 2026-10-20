-- Tenant isolation matrix (TESTING_STRATEGY.md §5.2). Every tenant table holds
-- rows for both fictional workspaces; each user must see only their own.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(127);

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

-- Rows of one workspace a user can see in a table: -1 when the table is not
-- accessible at all (no grant), otherwise the RLS-filtered count.
create function pg_temp.visible(p_user uuid, p_table text, p_column text, p_org uuid) returns bigint language plpgsql as $$
declare v bigint; e text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  begin
    if p_org is null then
      execute format('select count(*) from public.%I', p_table) into v;
    else
      execute format('select count(*) from public.%I where %I = %L', p_table, p_column, p_org) into v;
    end if;
  exception when insufficient_privilege then
    v := -1;
  when others then
    e := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if e is not null then raise exception 'visible() failed on %: %', p_table, e; end if;
  return v;
end $$;

create function pg_temp.as_anon(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

-- Give one workspace a row in every tenant table that the seed leaves empty.
create function pg_temp.populate(p_org uuid, p_customer uuid, p_product uuid, p_user uuid, p_ref text, p_so text, p_currency char(3))
returns void language plpgsql as $$
declare v_doc uuid := gen_random_uuid(); v_intake uuid := gen_random_uuid(); v_line uuid := gen_random_uuid(); v_so uuid := gen_random_uuid();
begin
  insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
  values (v_doc, p_org, p_ref || '.pdf', 'application/pdf', 100, 1, encode(sha256(convert_to(p_ref, 'UTF8')), 'hex'), 'stored', p_user, now());
  insert into public.inbound_orders (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number, submitted_by, submitted_at)
  values (v_intake, p_org, p_ref, v_doc, 'pending_approval', p_customer, 'ISO-' || p_ref, p_user, now());
  insert into public.inbound_order_lines (id, organization_id, inbound_order_id, line_no, product_id, match_method)
  values (v_line, p_org, v_intake, 1, p_product, 'manual');
  insert into public.extraction_runs (organization_id, inbound_order_id, source_document_id, provider)
  values (p_org, v_intake, v_doc, 'simulated');
  insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, message, fingerprint)
  values (p_org, v_intake, 'SHIP_TO_MISSING', 'blocking', false, 'No ship-to', repeat('a', 64));
  insert into public.sales_orders (id, organization_id, order_number, inbound_order_id, customer_id, customer_po_number, currency, ship_to, subtotal, approved_by, approved_at)
  values (v_so, p_org, p_so, v_intake, p_customer, 'ISO-' || p_ref, p_currency, '{}', 1, p_user, now());
  update public.inbound_orders set status = 'approved', sales_order_id = v_so, decided_by = p_user, decided_at = now() where id = v_intake;
  insert into public.sales_order_lines (organization_id, sales_order_id, line_no, product_id, sku, product_name, quantity, uom, unit_price,
    currency_minor_unit, line_total, price_source, match_method, allocated_qty, backordered_qty, source_inbound_order_line_id)
  values (p_org, v_so, 1, p_product, 'ISO', 'Isolation fixture', 1, 'BX', 1, 2, 1.00, 'list_price', 'manual', 1, 0, v_line);
  insert into public.integration_outbox (organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (p_org, 'sales_order.confirmed', 'sales_order', v_so, '{}');
  insert into public.organization_invitations (organization_id, email, role, token_hash, expires_at, invited_by)
  values (p_org, lower(p_ref) || '@invite.example', 'viewer', encode(sha256(convert_to('token-' || p_ref, 'UTF8')), 'hex'), now() + interval '7 days', p_user);
  insert into public.customer_item_aliases (organization_id, customer_id, product_id, customer_part_number)
  values (p_org, p_customer, p_product, 'ISO-' || p_ref);
end $$;

select pg_temp.populate('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001',
  '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a500-000000000001', 'IN-910001', 'SO-2026-910001', 'USD');
select pg_temp.populate('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b200-000000000001',
  '00000000-0000-4000-b400-000000000001', '00000000-0000-4000-b500-000000000001', 'IN-920001', 'BV-2026-920001', 'GBP');

-- A signed-in user who belongs to no workspace.
insert into auth.users (id, email) values ('00000000-0000-4000-c000-0000000000ff', 'outsider@test.example');
insert into public.profiles (id, full_name, email) values ('00000000-0000-4000-c000-0000000000ff', 'Outsider', 'outsider@test.example');

create temporary table tenant_tables (name text primary key, org_column text not null, member_visible boolean not null);
insert into tenant_tables values
  ('organizations', 'id', true), ('organization_members', 'organization_id', true),
  ('organization_invitations', 'organization_id', true), ('document_sequences', 'organization_id', false),
  ('customers', 'organization_id', true), ('customer_addresses', 'organization_id', true),
  ('products', 'organization_id', true), ('customer_item_aliases', 'organization_id', true),
  ('customer_prices', 'organization_id', true), ('locations', 'organization_id', true),
  ('inventory_balances', 'organization_id', true), ('inventory_movements', 'organization_id', true),
  ('source_documents', 'organization_id', true), ('inbound_orders', 'organization_id', true),
  ('inbound_order_lines', 'organization_id', true), ('extraction_runs', 'organization_id', true),
  ('order_exceptions', 'organization_id', true), ('sales_orders', 'organization_id', true),
  ('sales_order_lines', 'organization_id', true), ('integration_outbox', 'organization_id', false),
  ('audit_events', 'organization_id', true);

-- The fixture really covers every tenant table (otherwise isolation is not proven).
select is(
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'organization_id'
      and c.table_name not in (select name from tenant_tables)),
  0,
  'every tenant table is part of the isolation matrix'
);
select is(
  (select coalesce(array_agg(t.name order by t.name), '{}') from tenant_tables t
    where (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where %I = %L', t.name, t.org_column, '00000000-0000-4000-b000-000000000001'), false, true, '')))[1]::text::int = 0),
  '{}'::text[],
  'both workspaces have rows in every tenant table (Bayview)'
);
select is(
  (select coalesce(array_agg(t.name order by t.name), '{}') from tenant_tables t
    where (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where %I = %L', t.name, t.org_column, '00000000-0000-4000-a000-000000000001'), false, true, '')))[1]::text::int = 0),
  '{}'::text[],
  'both workspaces have rows in every tenant table (Northstar)'
);

-- 21 tables × Northstar Owner: no Bayview rows visible.
select ok(
  pg_temp.visible('00000000-0000-4000-a500-000000000001', name, org_column, '00000000-0000-4000-b000-000000000001') <= 0,
  name || ': Northstar Owner sees no Bayview rows'
) from tenant_tables order by name;

-- 21 tables × Bayview Owner: no Northstar rows visible.
select ok(
  pg_temp.visible('00000000-0000-4000-b500-000000000001', name, org_column, '00000000-0000-4000-a000-000000000001') <= 0,
  name || ': Bayview Owner sees no Northstar rows'
) from tenant_tables order by name;

-- 21 tables × Northstar Owner: own rows visible exactly where members may read.
select is(
  sign(pg_temp.visible('00000000-0000-4000-a500-000000000001', name, org_column, '00000000-0000-4000-a000-000000000001'))::bigint,
  case when member_visible then 1::bigint else -1::bigint end,
  name || case when member_visible then ': Northstar Owner sees own rows' else ': no API access even to own rows' end
) from tenant_tables order by name;

-- 21 tables × a signed-in user with no membership: nothing at all.
select ok(
  pg_temp.visible('00000000-0000-4000-c000-0000000000ff', name, org_column, null) <= 0,
  name || ': a user with no workspace sees nothing'
) from tenant_tables order by name;

-- 21 tables × Northstar Viewer: own records readable, audit log and invitations are not.
select is(
  pg_temp.visible('00000000-0000-4000-a500-000000000006', name, org_column, '00000000-0000-4000-a000-000000000001') > 0,
  member_visible and name not in ('audit_events', 'organization_invitations'),
  name || ': Northstar Viewer visibility'
) from tenant_tables order by name;

-- Anonymous visitors --------------------------------------------------------------
select alike(pg_temp.as_anon('select count(*) from public.customers'), '42501:%', 'anon cannot read customers');
select alike(pg_temp.as_anon('select count(*) from public.currencies'), '42501:%', 'anon cannot read reference data');
select alike(pg_temp.as_anon($$select public.set_customer_status('00000000-0000-4000-a200-000000000001', 'on_hold', 'x')$$), '42501:%', 'anon cannot call workflow functions');

-- Cross-tenant writes are impossible -------------------------------------------------
select alike(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-b000-000000000001', 'Planted')$$),
  '42501:%', 'Northstar Owner cannot create a customer in Bayview');
select is(
  pg_temp.count_as('00000000-0000-4000-a500-000000000001',
    $$with u as (update public.customers set name = 'Renamed' where organization_id = '00000000-0000-4000-b000-000000000001' returning 1) select count(*) from u$$),
  0::bigint, 'Northstar Owner cannot update Bayview customers');
select is(
  pg_temp.count_as('00000000-0000-4000-a500-000000000001',
    $$with d as (delete from public.customer_prices where organization_id = '00000000-0000-4000-b000-000000000001' returning 1) select count(*) from d$$),
  0::bigint, 'Northstar Owner cannot delete Bayview prices');
select alike(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$insert into public.customer_addresses (organization_id, customer_id, type, line1, country_code)
      values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b200-000000000001', 'shipping', '1 Planted St', 'GB')$$),
  '23503:%', 'a Northstar address cannot attach to a Bayview customer');
select alike(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from)
      values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-b400-000000000002', 1, '2026-01-01')$$),
  '23503:%', 'a Northstar price cannot reference a Bayview product');
select alike(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$update public.customers set organization_id = '00000000-0000-4000-b000-000000000001' where id = '00000000-0000-4000-a200-000000000002'$$),
  '42501:%', 'a record cannot be moved to another workspace');

-- Workflow functions never reveal or change other workspaces' records ---------------
select is(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$select public.set_customer_status('00000000-0000-4000-b200-000000000001', 'on_hold', 'x')$$),
  'P0002:not_found', 'set_customer_status on a Bayview customer: not found');
select is(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$select public.set_product_price('00000000-0000-4000-b400-000000000001', 1)$$),
  'P0002:not_found', 'set_product_price on a Bayview product: not found');
select is(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$select public.set_product_tracking('00000000-0000-4000-b400-000000000001', false)$$),
  'P0002:not_found', 'set_product_tracking on a Bayview product: not found');
select is(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$select public.update_workspace_settings('00000000-0000-4000-b000-000000000001', '{"name": "Taken over"}')$$, 'aal2'),
  'P0002:not_found', 'update_workspace_settings on Bayview: not found');
select is(
  pg_temp.as_user('00000000-0000-4000-a500-000000000001',
    $$select public.set_base_currency('00000000-0000-4000-b000-000000000001', 'USD')$$, 'aal2'),
  'P0002:not_found', 'set_base_currency on Bayview: not found');

-- Profiles: yourself and co-members only ------------------------------------------
select is(
  pg_temp.count_as('00000000-0000-4000-a500-000000000001', 'select count(*) from public.profiles'),
  6::bigint, 'Northstar Owner sees exactly the six Northstar profiles');
select is(
  pg_temp.count_as('00000000-0000-4000-c000-0000000000ff', 'select count(*) from public.profiles'),
  1::bigint, 'a user with no workspace sees only their own profile');

-- Losing access takes effect immediately (FR-AUTH-07) ---------------------------------
update public.organization_members set status = 'suspended' where user_id = '00000000-0000-4000-a500-000000000004';
select is(
  pg_temp.count_as('00000000-0000-4000-a500-000000000004', 'select count(*) from public.customers'),
  0::bigint, 'a suspended member sees nothing');
select alike(
  pg_temp.as_user('00000000-0000-4000-a500-000000000004',
    $$insert into public.customers (organization_id, name) values ('00000000-0000-4000-a000-000000000001', 'After suspension')$$),
  '42501:%', 'a suspended member cannot write');
update public.organization_members set status = 'active' where user_id = '00000000-0000-4000-a500-000000000004';

update public.organizations set status = 'suspended' where id = '00000000-0000-4000-b000-000000000001';
select is(
  pg_temp.count_as('00000000-0000-4000-b500-000000000001', 'select count(*) from public.customers'),
  0::bigint, 'members of a suspended workspace see nothing');

select * from finish();
rollback;
