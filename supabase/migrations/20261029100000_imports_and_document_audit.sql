-- OrderPilot · Migration 21: CSV imports with a validation preview
-- (FR-CUST-09, FR-PROD-06, FR-INV-08; D-31) and document download events
-- (FR-AUD-07). Imports are Owner and Admin only (import.run), all or nothing.
--
-- Each import function takes the parsed rows as JSON and p_dry_run. A dry run
-- validates every row and writes nothing; a real run validates again and
-- writes all rows in one transaction, or none if any row is invalid.

create function private.import_report(p_errors jsonb, p_rows integer, p_dry_run boolean, p_created integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', jsonb_array_length(p_errors) = 0, 'dry_run', p_dry_run, 'rows', p_rows,
                            'created', p_created, 'errors', p_errors)
$$;

-- Customers with optional shipping and billing addresses.
-- Row keys: account_number, name, email, phone, payment_terms, date_order_hint,
-- ship_line1, ship_city, ship_region, ship_postal_code, ship_country,
-- bill_line1, bill_city, bill_region, bill_postal_code, bill_country.
create function public.import_customers(p_organization_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_n integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_account text;
  v_customer uuid;
  v_created integer := 0;
  v_err text;
begin
  perform private.assert_permission(p_organization_id, 'import.run');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'validation_failed: the file must have between 1 and 5,000 rows' using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_err := null;
    v_account := util.normalize_code(v_row ->> 'account_number');
    if not util.has_text(v_row ->> 'name') or length(v_row ->> 'name') > 200 then
      v_err := 'name is required (at most 200 characters)';
    elsif v_account is not null and v_account = any (v_seen) then
      v_err := 'account number appears twice in the file';
    elsif v_account is not null and exists (select 1 from public.customers c where c.organization_id = p_organization_id and c.account_number_normalized = v_account) then
      v_err := 'a customer with this account number already exists';
    elsif util.has_text(v_row ->> 'email') and (v_row ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_err := 'email is not valid';
    elsif coalesce(nullif(v_row ->> 'date_order_hint', ''), 'unknown') not in ('dmy', 'mdy', 'ymd', 'unknown') then
      v_err := 'date_order_hint must be dmy, mdy, ymd or empty';
    elsif util.has_text(v_row ->> 'ship_line1') and coalesce(upper(v_row ->> 'ship_country'), '') !~ '^[A-Z]{2}$' then
      v_err := 'ship_country must be a two-letter country code';
    elsif util.has_text(v_row ->> 'bill_line1') and coalesce(upper(v_row ->> 'bill_country'), '') !~ '^[A-Z]{2}$' then
      v_err := 'bill_country must be a two-letter country code';
    elsif length(coalesce(v_row ->> 'payment_terms', '')) > 200 or length(coalesce(v_row ->> 'phone', '')) > 40
       or length(coalesce(v_row ->> 'account_number', '')) > 40 then
      v_err := 'a value is too long';
    end if;
    if v_err is not null then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message', v_err);
    end if;
    if v_account is not null then
      v_seen := v_seen || v_account;
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 or p_dry_run then
    return private.import_report(v_errors, v_n, p_dry_run, 0);
  end if;

  perform set_config('orderpilot.audit_reason', 'CSV import', true);
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.customers (organization_id, account_number, name, email, phone, payment_terms, date_order_hint)
    values (p_organization_id, nullif(btrim(v_row ->> 'account_number'), ''), btrim(v_row ->> 'name'),
            nullif(btrim(v_row ->> 'email'), ''), nullif(btrim(v_row ->> 'phone'), ''), nullif(btrim(v_row ->> 'payment_terms'), ''),
            coalesce(nullif(v_row ->> 'date_order_hint', ''), 'unknown'))
    returning id into v_customer;
    if util.has_text(v_row ->> 'ship_line1') then
      insert into public.customer_addresses (organization_id, customer_id, type, label, line1, city, region, postal_code, country_code, is_default)
      values (p_organization_id, v_customer, 'shipping', 'Imported', btrim(v_row ->> 'ship_line1'), nullif(v_row ->> 'ship_city', ''),
              nullif(v_row ->> 'ship_region', ''), nullif(v_row ->> 'ship_postal_code', ''), upper(v_row ->> 'ship_country'), true);
    end if;
    if util.has_text(v_row ->> 'bill_line1') then
      insert into public.customer_addresses (organization_id, customer_id, type, label, line1, city, region, postal_code, country_code, is_default)
      values (p_organization_id, v_customer, 'billing', 'Imported', btrim(v_row ->> 'bill_line1'), nullif(v_row ->> 'bill_city', ''),
              nullif(v_row ->> 'bill_region', ''), nullif(v_row ->> 'bill_postal_code', ''), upper(v_row ->> 'bill_country'), true);
    end if;
    v_created := v_created + 1;
  end loop;
  perform private.write_audit(p_organization_id, 'import.customers', 'organization', p_organization_id::text, null, null, null, null,
    jsonb_build_object('rows', v_created));
  return private.import_report(v_errors, v_n, false, v_created);
end
$$;

-- Products. Row keys: sku, name, description, selling_uom, quantity_decimals,
-- list_price, gtin, track_inventory (true/false), reorder_point.
create function public.import_products(p_organization_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_n integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_sku text;
  v_decimals integer;
  v_created integer := 0;
  v_err text;
begin
  perform private.assert_permission(p_organization_id, 'import.run');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'validation_failed: the file must have between 1 and 5,000 rows' using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_err := null;
    v_sku := lower(btrim(coalesce(v_row ->> 'sku', '')));
    v_decimals := case when coalesce(v_row ->> 'quantity_decimals', '') ~ '^[0-3]$' then (v_row ->> 'quantity_decimals')::integer
                       when coalesce(v_row ->> 'quantity_decimals', '') = '' then 0 end;
    if v_sku = '' or length(v_sku) > 64 then
      v_err := 'sku is required (at most 64 characters)';
    elsif v_sku = any (v_seen) then
      v_err := 'sku appears twice in the file';
    elsif exists (select 1 from public.products p where p.organization_id = p_organization_id and lower(p.sku) = v_sku) then
      v_err := 'a product with this SKU already exists';
    elsif not util.has_text(v_row ->> 'name') or length(v_row ->> 'name') > 200 then
      v_err := 'name is required (at most 200 characters)';
    elsif not exists (select 1 from public.uom_codes u where u.code = upper(coalesce(v_row ->> 'selling_uom', ''))) then
      v_err := 'selling_uom is not a known unit (for example EA, CS, BX, KG)';
    elsif v_decimals is null then
      v_err := 'quantity_decimals must be 0, 1, 2 or 3';
    elsif coalesce(v_row ->> 'list_price', '') !~ '^\d+(\.\d{1,4})?$' then
      v_err := 'list_price must be a number with at most 4 decimals';
    elsif util.has_text(v_row ->> 'gtin') and not util.gtin_is_valid(v_row ->> 'gtin') then
      v_err := 'gtin is not valid (check digit)';
    elsif util.has_text(v_row ->> 'gtin') and exists (select 1 from public.products p where p.organization_id = p_organization_id and p.gtin = v_row ->> 'gtin') then
      v_err := 'another product already has this GTIN';
    elsif lower(coalesce(nullif(v_row ->> 'track_inventory', ''), 'true')) not in ('true', 'false', 'yes', 'no', '1', '0') then
      v_err := 'track_inventory must be true or false';
    elsif util.has_text(v_row ->> 'reorder_point') and ((v_row ->> 'reorder_point') !~ '^\d+(\.\d{1,3})?$'
          or (v_row ->> 'reorder_point')::numeric <> round((v_row ->> 'reorder_point')::numeric, v_decimals)) then
      v_err := 'reorder_point must be a number with the allowed decimals';
    end if;
    if v_err is not null then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message', v_err);
    end if;
    v_seen := v_seen || v_sku;
  end loop;

  if jsonb_array_length(v_errors) > 0 or p_dry_run then
    return private.import_report(v_errors, v_n, p_dry_run, 0);
  end if;

  perform set_config('orderpilot.audit_reason', 'CSV import', true);
  insert into public.products (organization_id, sku, name, description, selling_uom, quantity_decimals, list_price, gtin, track_inventory, reorder_point)
  select p_organization_id, btrim(r ->> 'sku'), btrim(r ->> 'name'), nullif(r ->> 'description', ''), upper(r ->> 'selling_uom'),
         coalesce(nullif(r ->> 'quantity_decimals', ''), '0')::smallint, (r ->> 'list_price')::numeric, nullif(r ->> 'gtin', ''),
         lower(coalesce(nullif(r ->> 'track_inventory', ''), 'true')) in ('true', 'yes', '1'), nullif(r ->> 'reorder_point', '')::numeric
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_created = row_count;
  perform private.write_audit(p_organization_id, 'import.products', 'organization', p_organization_id::text, null, null, null, null,
    jsonb_build_object('rows', v_created));
  return private.import_report(v_errors, v_n, false, v_created);
end
$$;

-- Opening stock (FR-INV-08): sets on hand to the counted quantity with an
-- opening_balance adjustment per row. Row keys: sku, quantity, note.
create function public.import_opening_stock(p_organization_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_n integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_product public.products;
  v_created integer := 0;
  v_err text;
begin
  perform private.assert_permission(p_organization_id, 'import.run');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'validation_failed: the file must have between 1 and 5,000 rows' using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_err := null;
    select * into v_product from public.products p
     where p.organization_id = p_organization_id and lower(p.sku) = lower(btrim(coalesce(v_row ->> 'sku', '')));
    if v_product.id is null then
      v_err := 'no product with this SKU';
    elsif lower(v_product.sku) = any (v_seen) then
      v_err := 'sku appears twice in the file';
    elsif not v_product.track_inventory then
      v_err := 'this product does not track inventory';
    elsif coalesce(v_row ->> 'quantity', '') !~ '^\d+(\.\d{1,3})?$' then
      v_err := 'quantity must be zero or more';
    elsif (v_row ->> 'quantity')::numeric <> round((v_row ->> 'quantity')::numeric, v_product.quantity_decimals) then
      v_err := format('quantity must have at most %s decimal places', v_product.quantity_decimals);
    elsif length(coalesce(v_row ->> 'note', '')) > 1000 then
      v_err := 'note is too long';
    end if;
    if v_err is not null then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message', v_err);
    end if;
    if v_product.id is not null then
      v_seen := v_seen || lower(v_product.sku);
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 or p_dry_run then
    return private.import_report(v_errors, v_n, p_dry_run, 0);
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    select * into v_product from public.products p
     where p.organization_id = p_organization_id and lower(p.sku) = lower(btrim(v_row ->> 'sku'));
    -- Same rules as a manual count (adjust_stock): under the row lock, never below zero.
    if exists (select 1 from public.inventory_balances b where b.product_id = v_product.id and b.on_hand <> (v_row ->> 'quantity')::numeric) then
      perform public.adjust_stock(v_product.id, 'count', (v_row ->> 'quantity')::numeric, 'opening_balance',
        coalesce(nullif(v_row ->> 'note', ''), 'Opening balance (CSV import)'));
      v_created := v_created + 1;
    end if;
  end loop;
  perform private.write_audit(p_organization_id, 'import.opening_stock', 'organization', p_organization_id::text, null, null, null, null,
    jsonb_build_object('rows', v_n, 'changed', v_created));
  return private.import_report(v_errors, v_n, false, v_created);
end
$$;

-- FR-AUD-07: a document download by a member is recorded in the audit trail.
create function public.record_document_download(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.source_documents;
  v_intake uuid;
begin
  select * into v_doc from public.source_documents where id = p_document_id;
  if not found or not private.has_permission(v_doc.organization_id, 'records.view') then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  select id into v_intake from public.inbound_orders where source_document_id = v_doc.id;
  perform private.write_audit(v_doc.organization_id, 'source_document.downloaded', 'source_document', v_doc.id::text,
    case when v_intake is not null then 'inbound_order' end, v_intake::text, null, null,
    jsonb_build_object('file', v_doc.original_filename));
end
$$;

revoke all on function private.import_report(jsonb, integer, boolean, integer) from public, anon, authenticated;
revoke all on function public.import_customers(uuid, jsonb, boolean) from public, anon;
revoke all on function public.import_products(uuid, jsonb, boolean) from public, anon;
revoke all on function public.import_opening_stock(uuid, jsonb, boolean) from public, anon;
revoke all on function public.record_document_download(uuid) from public, anon;
grant execute on function public.import_customers(uuid, jsonb, boolean) to authenticated;
grant execute on function public.import_products(uuid, jsonb, boolean) to authenticated;
grant execute on function public.import_opening_stock(uuid, jsonb, boolean) to authenticated;
grant execute on function public.record_document_download(uuid) to authenticated;
