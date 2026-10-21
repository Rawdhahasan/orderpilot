-- OrderPilot Phase 4B · Migration 18: review drafts, validation results,
-- matching. DATABASE_ARCHITECTURE.md §6.4, §6.6, §8.1, §12;
-- TECHNICAL_ARCHITECTURE.md §10, §11.

-- ---------------------------------------------------------------------------
-- Draft saving with optimistic concurrency (FR-REV-10). Header keys and line
-- fields are an allow-list; status, decisions and actor columns are never
-- writable here. A save invalidates the previous validation (version moves).
-- ---------------------------------------------------------------------------
create function public.save_inbound_order_draft(
  p_inbound_order_id uuid,
  p_expected_version integer,
  p_header jsonb default '{}'::jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_key text;
  v_line jsonb;
  v_allowed text[] := array['customer_id', 'customer_po_number', 'po_date', 'requested_delivery_date', 'currency',
    'payment_terms', 'bill_to', 'ship_to', 'bill_to_address_id', 'ship_to_address_id', 'notes', 'document_total',
    'document_tax_total', 'field_meta'];
  v_line_allowed text[] := array['id', 'line_no', 'page_number', 'customer_part_number', 'description', 'po_quantity',
    'po_uom', 'po_unit_price', 'po_line_total', 'product_id', 'match_method', 'match_score', 'remember_alias',
    'quantity', 'uom_conversion_note', 'unit_price', 'price_source', 'expected_unit_price', 'field_meta', 'removed',
    'removed_reason'];
  v_next_no integer;
begin
  perform private.assert_permission(v.organization_id, 'intake.review');
  perform private.assert_intake_status(v, '{in_review}');
  if p_expected_version is null or v.version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'object_not_in_prerequisite_state',
      detail = json_build_object('updated_by', (select full_name from public.profiles where id = v.updated_by),
                                 'updated_at', v.updated_at)::text;
  end if;
  if jsonb_typeof(coalesce(p_header, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'validation_failed: invalid draft' using errcode = 'invalid_parameter_value';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_header, '{}'::jsonb)) loop
    if not v_key = any (v_allowed) then
      raise exception 'validation_failed: % cannot be changed here', v_key using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  update public.inbound_orders i
     set customer_id = case when p_header ? 'customer_id' then (p_header ->> 'customer_id')::uuid else i.customer_id end,
         customer_po_number = case when p_header ? 'customer_po_number' then nullif(btrim(p_header ->> 'customer_po_number'), '') else i.customer_po_number end,
         po_date = case when p_header ? 'po_date' then (p_header ->> 'po_date')::date else i.po_date end,
         requested_delivery_date = case when p_header ? 'requested_delivery_date' then (p_header ->> 'requested_delivery_date')::date else i.requested_delivery_date end,
         currency = case when p_header ? 'currency' then upper(nullif(p_header ->> 'currency', '')) else i.currency end,
         payment_terms = case when p_header ? 'payment_terms' then nullif(p_header ->> 'payment_terms', '') else i.payment_terms end,
         bill_to = case when p_header ? 'bill_to' then nullif(p_header -> 'bill_to', 'null'::jsonb) else i.bill_to end,
         ship_to = case when p_header ? 'ship_to' then nullif(p_header -> 'ship_to', 'null'::jsonb) else i.ship_to end,
         bill_to_address_id = case when p_header ? 'bill_to_address_id' then (p_header ->> 'bill_to_address_id')::uuid else i.bill_to_address_id end,
         ship_to_address_id = case when p_header ? 'ship_to_address_id' then (p_header ->> 'ship_to_address_id')::uuid else i.ship_to_address_id end,
         notes = case when p_header ? 'notes' then nullif(p_header ->> 'notes', '') else i.notes end,
         document_total = case when p_header ? 'document_total' then (p_header ->> 'document_total')::numeric else i.document_total end,
         document_tax_total = case when p_header ? 'document_tax_total' then (p_header ->> 'document_tax_total')::numeric else i.document_tax_total end,
         field_meta = case when p_header ? 'field_meta' then p_header -> 'field_meta' else i.field_meta end,
         version = i.version + 1
   where i.id = v.id;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    for v_key in select jsonb_object_keys(v_line) loop
      if not v_key = any (v_line_allowed) then
        raise exception 'validation_failed: line field % cannot be changed here', v_key using errcode = 'invalid_parameter_value';
      end if;
    end loop;
    if v_line ? 'id' and v_line ->> 'id' is not null then
      update public.inbound_order_lines l
         set customer_part_number = case when v_line ? 'customer_part_number' then nullif(v_line ->> 'customer_part_number', '') else l.customer_part_number end,
             description = case when v_line ? 'description' then nullif(v_line ->> 'description', '') else l.description end,
             po_quantity = case when v_line ? 'po_quantity' then (v_line ->> 'po_quantity')::numeric else l.po_quantity end,
             po_uom = case when v_line ? 'po_uom' then nullif(v_line ->> 'po_uom', '') else l.po_uom end,
             po_unit_price = case when v_line ? 'po_unit_price' then (v_line ->> 'po_unit_price')::numeric else l.po_unit_price end,
             product_id = case when v_line ? 'product_id' then (v_line ->> 'product_id')::uuid else l.product_id end,
             match_method = case when v_line ? 'match_method' then (v_line ->> 'match_method')::public.match_method else l.match_method end,
             match_score = case when v_line ? 'match_score' then (v_line ->> 'match_score')::numeric else l.match_score end,
             remember_alias = case when v_line ? 'remember_alias' then coalesce((v_line ->> 'remember_alias')::boolean, false) else l.remember_alias end,
             quantity = case when v_line ? 'quantity' then (v_line ->> 'quantity')::numeric else l.quantity end,
             uom_conversion_note = case when v_line ? 'uom_conversion_note' then nullif(v_line ->> 'uom_conversion_note', '') else l.uom_conversion_note end,
             unit_price = case when v_line ? 'unit_price' then (v_line ->> 'unit_price')::numeric else l.unit_price end,
             price_source = case when v_line ? 'price_source' then (v_line ->> 'price_source')::public.price_source else l.price_source end,
             expected_unit_price = case when v_line ? 'expected_unit_price' then (v_line ->> 'expected_unit_price')::numeric else l.expected_unit_price end,
             field_meta = case when v_line ? 'field_meta' then v_line -> 'field_meta' else l.field_meta end,
             removed_at = case when coalesce((v_line ->> 'removed')::boolean, false) then coalesce(l.removed_at, now()) when v_line ? 'removed' then null else l.removed_at end,
             removed_by = case when coalesce((v_line ->> 'removed')::boolean, false) then coalesce(l.removed_by, auth.uid()) when v_line ? 'removed' then null else l.removed_by end,
             removed_reason = case when v_line ? 'removed_reason' then nullif(v_line ->> 'removed_reason', '') else l.removed_reason end
       where l.id = (v_line ->> 'id')::uuid and l.inbound_order_id = v.id;
      if not found then
        raise exception 'not_found' using errcode = 'no_data_found';
      end if;
    else
      select coalesce(max(line_no), 0) + 1 into v_next_no from public.inbound_order_lines where inbound_order_id = v.id;
      insert into public.inbound_order_lines
        (organization_id, inbound_order_id, line_no, customer_part_number, description, po_quantity, po_uom, po_unit_price,
         product_id, match_method, match_score, remember_alias, quantity, uom_conversion_note, unit_price, price_source,
         expected_unit_price, field_meta)
      values
        (v.organization_id, v.id, v_next_no, nullif(v_line ->> 'customer_part_number', ''), nullif(v_line ->> 'description', ''),
         (v_line ->> 'po_quantity')::numeric, nullif(v_line ->> 'po_uom', ''), (v_line ->> 'po_unit_price')::numeric,
         (v_line ->> 'product_id')::uuid, (v_line ->> 'match_method')::public.match_method, (v_line ->> 'match_score')::numeric,
         coalesce((v_line ->> 'remember_alias')::boolean, false), (v_line ->> 'quantity')::numeric,
         nullif(v_line ->> 'uom_conversion_note', ''), (v_line ->> 'unit_price')::numeric,
         (v_line ->> 'price_source')::public.price_source, (v_line ->> 'expected_unit_price')::numeric,
         coalesce(v_line -> 'field_meta', '{}'::jsonb));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

-- ---------------------------------------------------------------------------
-- Validation results (TECHNICAL_ARCHITECTURE.md §10.3). The server computes
-- exceptions with the domain rules and stores them for one version. A change
-- in fingerprint re-opens a closed exception; exceptions no longer raised are
-- closed. Overrides cannot be created here.
-- ---------------------------------------------------------------------------
create function public.record_validation(p_inbound_order_id uuid, p_version integer, p_exceptions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_item jsonb;
  v_existing public.order_exceptions;
  v_code public.exception_code;
  v_line uuid;
  v_seen uuid[] := '{}';
  v_id uuid;
begin
  perform private.assert_permission(v.organization_id, 'intake.review');
  perform private.assert_intake_status(v, '{in_review,pending_approval}');
  if v.version <> p_version then
    raise exception 'stale_version' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if jsonb_typeof(p_exceptions) <> 'array' then
    raise exception 'validation_failed: exceptions must be a list' using errcode = 'invalid_parameter_value';
  end if;

  for v_item in select * from jsonb_array_elements(p_exceptions) loop
    v_code := (v_item ->> 'code')::public.exception_code;
    v_line := (v_item ->> 'line_id')::uuid;
    if v_line is not null and not exists (select 1 from public.inbound_order_lines where id = v_line and inbound_order_id = v.id) then
      raise exception 'not_found' using errcode = 'no_data_found';
    end if;
    select * into v_existing from public.order_exceptions e
     where e.inbound_order_id = v.id and e.inbound_order_line_id is not distinct from v_line and e.code = v_code
     for update;
    if found then
      if v_existing.fingerprint <> (v_item ->> 'fingerprint') and v_existing.status in ('resolved', 'acknowledged', 'overridden') then
        update public.order_exceptions
           set status = 'open', resolved_by = null, resolved_at = null, resolution_note = null,
               overridden_by = null, overridden_at = null, override_reason = null, override_fingerprint = null,
               override_conflicts = null
         where id = v_existing.id;
      end if;
      update public.order_exceptions
         set message = left(v_item ->> 'message', 1000), details = coalesce(v_item -> 'details', '{}'::jsonb),
             fingerprint = v_item ->> 'fingerprint'
       where id = v_existing.id;
      v_id := v_existing.id;
    else
      insert into public.order_exceptions
        (organization_id, inbound_order_id, inbound_order_line_id, code, severity, overridable, message, details, fingerprint)
      values
        (v.organization_id, v.id, v_line, v_code, (v_item ->> 'severity')::public.exception_severity,
         util.exception_is_overridable(v_code), left(v_item ->> 'message', 1000), coalesce(v_item -> 'details', '{}'::jsonb),
         v_item ->> 'fingerprint')
      returning id into v_id;
    end if;
    v_seen := v_seen || v_id;
  end loop;

  -- No longer raised: close it (an override is no longer needed either).
  update public.order_exceptions e
     set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
         resolution_note = 'No longer applies after changes', overridden_by = null, overridden_at = null,
         override_reason = null, override_fingerprint = null, override_conflicts = null
   where e.inbound_order_id = v.id and e.status <> 'resolved' and not e.id = any (v_seen);

  update public.inbound_orders set validated_version = p_version where id = v.id;
  return jsonb_build_object('ok', true, 'validated_version', p_version);
end
$$;

-- Warnings are acknowledged by a reviewer (§9); blocking ones never are.
create function public.acknowledge_exception(p_exception_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exception public.order_exceptions;
  v_intake public.inbound_orders;
begin
  select * into v_exception from public.order_exceptions where id = p_exception_id;
  if not found or not private.is_member(v_exception.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  v_intake := private.lock_intake(v_exception.inbound_order_id);
  perform private.assert_permission(v_exception.organization_id, 'intake.review');
  perform private.assert_intake_status(v_intake, '{in_review}');
  if v_exception.severity <> 'warning' or v_exception.status <> 'open' then
    raise exception 'invalid_state: only open warnings can be acknowledged' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.order_exceptions
     set status = 'acknowledged', resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(p_note), '')
   where id = p_exception_id;
  return jsonb_build_object('ok', true);
end
$$;

-- "Assign to me" (FR-REV-11): others see who is working on it; nobody is locked out.
create function public.assign_inbound_order(p_inbound_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
begin
  perform private.assert_permission(v.organization_id, 'intake.review');
  perform private.assert_intake_status(v, '{extracting,extraction_failed,in_review}');
  update public.inbound_orders set assigned_to = auth.uid() where id = v.id;
  return jsonb_build_object('ok', true);
end
$$;

-- Duplicate context for the validator, for one intake the caller can see.
create function public.intake_duplicate_info(p_inbound_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders;
  v_po jsonb;
  v_doc jsonb;
begin
  select * into v from public.inbound_orders where id = p_inbound_order_id;
  if not found or not private.is_member(v.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  v_po := private.po_conflicts(v);
  v_doc := private.document_conflicts(v);
  return jsonb_build_object(
    'po_conflicts', v_po, 'po_fingerprint', private.conflict_fingerprint(v_po),
    'document_conflicts', v_doc, 'document_fingerprint', private.conflict_fingerprint(v_doc),
    -- Same customer, same products and quantities, recent, different PO number (warning).
    'possible_duplicates', (
      select coalesce(jsonb_agg(s.id), '[]'::jsonb)
        from public.sales_orders s
        join public.organizations o on o.id = s.organization_id
       where s.organization_id = v.organization_id and s.customer_id = v.customer_id and s.status <> 'cancelled'
         and s.approved_at > now() - make_interval(days => o.duplicate_lookback_days)
         and s.customer_po_number_normalized is distinct from v.customer_po_number_normalized
         and (select coalesce(jsonb_agg(jsonb_build_array(l.product_id, l.quantity) order by l.product_id, l.quantity), '[]'::jsonb)
                from public.sales_order_lines l where l.sales_order_id = s.id)
           = (select coalesce(jsonb_agg(jsonb_build_array(l.product_id, l.quantity) order by l.product_id, l.quantity), '[]'::jsonb)
                from public.inbound_order_lines l where l.inbound_order_id = v.id and l.removed_at is null and l.product_id is not null))
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Matching (TECHNICAL_ARCHITECTURE.md §10.1, §10.2). Caller's rights (RLS):
-- only the caller's workspace data is ever considered.
-- ---------------------------------------------------------------------------
create function public.match_customers(p_organization_id uuid, p_name text, p_account text default null)
returns table (customer_id uuid, name text, status public.customer_status, method text, score real)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.status, x.method, x.score
    from public.customers c
    cross join lateral (
      select case
               when p_account is not null and c.account_number_normalized = util.normalize_code(p_account) then 'account_number'
               else 'name' end as method,
             case
               when p_account is not null and c.account_number_normalized = util.normalize_code(p_account) then 1.0::real
               else extensions.similarity(lower(c.name), lower(coalesce(p_name, ''))) end as score
    ) x
   where c.organization_id = p_organization_id
     and c.status <> 'inactive'
     and x.score >= 0.3
   order by x.score desc, c.name
   limit 3
$$;

-- One round trip for a whole PO: p_lines = [{"key": "...", "part": "...", "description": "..."}].
create function public.match_products(p_organization_id uuid, p_customer_id uuid, p_lines jsonb)
returns table (line_key text, product_id uuid, sku text, name text, method text, score real)
language sql
stable
set search_path = ''
as $$
  with lines as (
    select l ->> 'key' as line_key, l ->> 'part' as part, l ->> 'description' as description
      from jsonb_array_elements(p_lines) l
  ),
  candidates as (
    select ln.line_key, a.product_id, 'alias'::text as method, 1.0::real as score
      from lines ln
      join public.customer_item_aliases a
        on a.organization_id = p_organization_id and a.customer_id = p_customer_id and a.status = 'active'
       and a.customer_part_number_normalized = util.normalize_code(ln.part)
    union all
    select ln.line_key, p.id, 'sku', 0.95
      from lines ln join public.products p
        on p.organization_id = p_organization_id and p.sku_normalized = util.normalize_code(ln.part)
    union all
    select ln.line_key, p.id, 'gtin', 0.95
      from lines ln join public.products p
        on p.organization_id = p_organization_id and p.gtin = regexp_replace(coalesce(ln.part, ''), '\D', '', 'g')
    union all
    select ln.line_key, p.id, 'description', extensions.similarity(lower(p.name), lower(ln.description))
      from lines ln join public.products p
        on p.organization_id = p_organization_id and ln.description is not null
       and extensions.similarity(lower(p.name), lower(ln.description)) >= 0.2
  ),
  best as (
    select distinct on (c.line_key, c.product_id) c.*
      from candidates c
     order by c.line_key, c.product_id, c.score desc
  )
  select b.line_key, b.product_id, p.sku, p.name, b.method, b.score
    from (select *, row_number() over (partition by line_key order by score desc) as rank from best) b
    join public.products p on p.id = b.product_id
   where b.rank <= 5
   order by b.line_key, b.score desc
$$;

revoke all on function public.save_inbound_order_draft(uuid, integer, jsonb, jsonb) from public, anon;
revoke all on function public.record_validation(uuid, integer, jsonb) from public, anon;
revoke all on function public.acknowledge_exception(uuid, text) from public, anon;
revoke all on function public.assign_inbound_order(uuid) from public, anon;
revoke all on function public.intake_duplicate_info(uuid) from public, anon;
revoke all on function public.match_customers(uuid, text, text) from public, anon;
revoke all on function public.match_products(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_inbound_order_draft(uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.record_validation(uuid, integer, jsonb) to authenticated;
grant execute on function public.acknowledge_exception(uuid, text) to authenticated;
grant execute on function public.assign_inbound_order(uuid) to authenticated;
grant execute on function public.intake_duplicate_info(uuid) to authenticated;
grant execute on function public.match_customers(uuid, text, text) to authenticated;
grant execute on function public.match_products(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Expected price (D-14, D-32): customer price valid on the PO date (else
-- today), otherwise the list price.
-- ---------------------------------------------------------------------------
create function private.expected_price(p_organization_id uuid, p_customer_id uuid, p_product_id uuid, p_on date)
returns table (unit_price numeric, source public.price_source)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cp.unit_price, p.list_price),
         case when cp.unit_price is not null then 'customer_price'::public.price_source else 'list_price'::public.price_source end
    from public.products p
    left join lateral (
      select c.unit_price from public.customer_prices c
       where c.organization_id = p_organization_id and c.customer_id = p_customer_id and c.product_id = p.id
         and c.valid_from <= coalesce(p_on, current_date) and (c.valid_to is null or c.valid_to >= coalesce(p_on, current_date))
       limit 1
    ) cp on true
   where p.organization_id = p_organization_id and p.id = p_product_id
$$;

create function public.expected_prices(p_inbound_order_id uuid)
returns table (line_id uuid, unit_price numeric, source public.price_source)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders;
begin
  select * into v from public.inbound_orders where id = p_inbound_order_id;
  if not found or not private.is_member(v.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  return query
    select l.id, e.unit_price, e.source
      from public.inbound_order_lines l
      cross join lateral private.expected_price(v.organization_id, v.customer_id, l.product_id, v.po_date) e
     where l.inbound_order_id = v.id and l.removed_at is null and l.product_id is not null;
end
$$;

-- The hard gate also requires a recorded human decision whenever a line's
-- price differs from the expected price beyond the workspace tolerance (C-05:
-- compared at the stored four-decimal precision).
alter function private.intake_gate(public.inbound_orders, text) rename to intake_gate_core;

create function private.intake_gate(p_intake public.inbound_orders, p_mode text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_failures jsonb := private.intake_gate_core(p_intake, p_mode);
  v_line record;
  v_tolerance numeric;
begin
  select price_tolerance_pct into v_tolerance from public.organizations where id = p_intake.organization_id;
  for v_line in
    select l.id, l.line_no, l.unit_price, l.field_meta, e.unit_price as expected
      from public.inbound_order_lines l
      cross join lateral private.expected_price(p_intake.organization_id, p_intake.customer_id, l.product_id, p_intake.po_date) e
     where l.inbound_order_id = p_intake.id and l.removed_at is null and l.product_id is not null and l.unit_price is not null
  loop
    if abs(v_line.unit_price - v_line.expected) > v_line.expected * v_tolerance / 100
       and coalesce(v_line.field_meta -> 'unit_price' ->> 'price_decision', '') not in ('po', 'expected', 'manual') then
      v_failures := v_failures || jsonb_build_object('code', 'PRICE_MISMATCH', 'line_id', v_line.id,
        'message', 'Line ' || v_line.line_no || ': the price differs from the expected price and no decision was recorded.');
    end if;
  end loop;
  return v_failures;
end
$$;

revoke all on function private.expected_price(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.intake_gate_core(public.inbound_orders, text) from public, anon, authenticated;
revoke all on function private.intake_gate(public.inbound_orders, text) from public, anon, authenticated;
revoke all on function public.expected_prices(uuid) from public, anon;
grant execute on function public.expected_prices(uuid) to authenticated;
