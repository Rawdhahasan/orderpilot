-- OrderPilot Phase 2D · Migration 14: business transactions.
-- docs/DATABASE_ARCHITECTURE.md §8 (hard gate, transitions), §9 (approval),
-- §10 (inventory), §12 (duplicates) and §13 (domain audit events).
--
-- Lock order used by every function (prevents deadlocks):
--   1. intake or sales order row
--   2. advisory lock for (workspace, customer, normalised PO number)
--   3. customer row (share), product rows (share, ascending id)
--   4. inventory balances, ascending (location_id, product_id)
--   5. document sequence row

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create function private.request_uuid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when v ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then v::uuid end
    from (select private.request_id() as v) r
$$;

create function private.begin_transition()
returns void
language sql
set search_path = ''
as $$
  select set_config('orderpilot.transition', 'on', true);
$$;

create function private.end_transition()
returns void
language sql
set search_path = ''
as $$
  select set_config('orderpilot.transition', '', true);
$$;

create function private.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex')
$$;

-- Default location of a workspace (D-11: one default in the MVP).
create function private.default_location(p_organization_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v uuid;
begin
  select l.id into v from public.locations l where l.organization_id = p_organization_id and l.is_default;
  if v is null then
    raise exception 'invalid_state: workspace has no default location' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------------
-- Duplicate conflict sets (§12, §12.1). Recomputed in SQL at decision time.
-- ---------------------------------------------------------------------------
create function private.po_conflicts(p_intake public.inbound_orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by c ->> 'type', c ->> 'id'), '[]'::jsonb)
    from (
      select jsonb_build_object('type', 'inbound_order', 'id', i.id) as c
        from public.inbound_orders i
       where p_intake.customer_id is not null
         and p_intake.customer_po_number_normalized is not null
         and i.organization_id = p_intake.organization_id
         and i.customer_id = p_intake.customer_id
         and i.customer_po_number_normalized = p_intake.customer_po_number_normalized
         and i.id <> p_intake.id
         and i.status not in ('approved', 'rejected', 'cancelled')
      union all
      select jsonb_build_object('type', 'sales_order', 'id', s.id)
        from public.sales_orders s
       where p_intake.customer_id is not null
         and p_intake.customer_po_number_normalized is not null
         and s.organization_id = p_intake.organization_id
         and s.customer_id = p_intake.customer_id
         and s.customer_po_number_normalized = p_intake.customer_po_number_normalized
         and s.inbound_order_id <> p_intake.id
         and s.status <> 'cancelled'
    ) x
$$;

create function private.document_conflicts(p_intake public.inbound_orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select d.sha256 from public.source_documents d
     where d.organization_id = p_intake.organization_id and d.id = p_intake.source_document_id
  )
  select coalesce(jsonb_agg(c order by c ->> 'type', c ->> 'id'), '[]'::jsonb)
    from (
      select case when s.id is not null
                  then jsonb_build_object('type', 'sales_order', 'id', s.id)
                  else jsonb_build_object('type', 'inbound_order', 'id', i.id) end as c
        from public.inbound_orders i
        join public.source_documents d on d.organization_id = i.organization_id and d.id = i.source_document_id
        join mine on mine.sha256 = d.sha256
        left join public.sales_orders s on s.inbound_order_id = i.id and s.status <> 'cancelled'
       where i.organization_id = p_intake.organization_id
         and i.id <> p_intake.id
         and (i.status not in ('approved', 'rejected', 'cancelled') or s.id is not null)
    ) x
$$;

create function private.conflict_fingerprint(p_conflicts jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.sha256_hex(p_conflicts::text)
$$;

-- Re-opens duplicate overrides whose reviewed conflict set no longer matches
-- (§12.1 #3). Returns the number re-opened.
create function private.reopen_stale_duplicate_overrides(p_intake public.inbound_orders)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exception public.order_exceptions;
  v_current text;
  v_count integer := 0;
begin
  for v_exception in
    select * from public.order_exceptions e
     where e.inbound_order_id = p_intake.id
       and e.status = 'overridden'
       and e.code in ('DUPLICATE_PO_NUMBER', 'DUPLICATE_DOCUMENT')
     for update
  loop
    v_current := private.conflict_fingerprint(
      case v_exception.code
        when 'DUPLICATE_PO_NUMBER' then private.po_conflicts(p_intake)
        else private.document_conflicts(p_intake)
      end);
    if v_current is distinct from v_exception.override_fingerprint then
      update public.order_exceptions
         set status = 'open', overridden_by = null, overridden_at = null, override_reason = null,
             override_fingerprint = null, override_conflicts = null
       where id = v_exception.id;
      perform private.write_audit(p_intake.organization_id, 'exception.reopened', 'exception', v_exception.id::text,
        'inbound_order', p_intake.id::text, null, 'The conflicts reviewed for this override have changed',
        jsonb_build_object('code', v_exception.code));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Hard gate (§8.1). Returns a JSON array of failures: [{code, line_id, message}].
-- p_mode 'submit': open blocking exceptions are allowed only when overridable
-- (they reach the approver as Override required, C-01 / D-34).
-- p_mode 'approve': every blocking exception must be resolved or overridden
-- with a fingerprint that still matches.
-- ---------------------------------------------------------------------------
create function private.intake_gate(p_intake public.inbound_orders, p_mode text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_failures jsonb := '[]'::jsonb;
  v_org public.organizations;
  v_customer public.customers;
  v_line record;
  v_conflicts jsonb;
  v_approve boolean := p_mode = 'approve';
begin
  select * into v_org from public.organizations where id = p_intake.organization_id;

  -- Overridden header exception with a fingerprint that still holds.
  -- (Duplicate overrides are compared against the recomputed conflict set below.)

  if p_intake.customer_id is null then
    v_failures := v_failures || jsonb_build_object('code', 'CUSTOMER_UNMATCHED', 'message', 'No customer is selected.');
  else
    select * into v_customer from public.customers where organization_id = p_intake.organization_id and id = p_intake.customer_id;
    if v_customer.status = 'inactive' then
      v_failures := v_failures || jsonb_build_object('code', 'CUSTOMER_INACTIVE', 'message', 'The customer is inactive.');
    elsif v_customer.status = 'on_hold' and v_approve and not exists (
      select 1 from public.order_exceptions e
       where e.inbound_order_id = p_intake.id and e.inbound_order_line_id is null
         and e.code = 'CUSTOMER_ON_HOLD' and e.status = 'overridden'
    ) then
      v_failures := v_failures || jsonb_build_object('code', 'CUSTOMER_ON_HOLD', 'message', 'The customer is on hold and no override was recorded.');
    end if;
  end if;

  if p_intake.customer_po_number_normalized is null and v_approve and not exists (
    select 1 from public.order_exceptions e
     where e.inbound_order_id = p_intake.id and e.inbound_order_line_id is null
       and e.code = 'PO_NUMBER_MISSING' and e.status = 'overridden'
  ) then
    v_failures := v_failures || jsonb_build_object('code', 'PO_NUMBER_MISSING', 'message', 'The customer PO number is missing and no override was recorded.');
  end if;

  if v_approve then
    v_conflicts := private.po_conflicts(p_intake);
    if jsonb_array_length(v_conflicts) > 0 and not exists (
      select 1 from public.order_exceptions e
       where e.inbound_order_id = p_intake.id and e.inbound_order_line_id is null
         and e.code = 'DUPLICATE_PO_NUMBER' and e.status = 'overridden'
         and e.override_fingerprint = private.conflict_fingerprint(v_conflicts)
    ) then
      v_failures := v_failures || jsonb_build_object('code', 'DUPLICATE_PO_NUMBER',
        'message', 'This PO number is already used by another order for this customer.', 'conflicts', v_conflicts);
    end if;
    v_conflicts := private.document_conflicts(p_intake);
    if jsonb_array_length(v_conflicts) > 0 and not exists (
      select 1 from public.order_exceptions e
       where e.inbound_order_id = p_intake.id and e.inbound_order_line_id is null
         and e.code = 'DUPLICATE_DOCUMENT' and e.status = 'overridden'
         and e.override_fingerprint = private.conflict_fingerprint(v_conflicts)
    ) then
      v_failures := v_failures || jsonb_build_object('code', 'DUPLICATE_DOCUMENT',
        'message', 'The same document is on another order.', 'conflicts', v_conflicts);
    end if;
  end if;

  if p_intake.ship_to is null and p_intake.ship_to_address_id is null then
    v_failures := v_failures || jsonb_build_object('code', 'SHIP_TO_MISSING', 'message', 'No ship-to address.');
  end if;

  if p_intake.currency is not null and p_intake.currency <> v_org.base_currency then
    v_failures := v_failures || jsonb_build_object('code', 'CURRENCY_MISMATCH', 'message', 'The PO currency is not the workspace currency.');
  end if;

  if not exists (select 1 from public.inbound_order_lines l where l.inbound_order_id = p_intake.id and l.removed_at is null) then
    v_failures := v_failures || jsonb_build_object('code', 'NO_LINES', 'message', 'The order has no lines.');
  end if;

  for v_line in
    select l.*, p.status as product_status, p.selling_uom, p.quantity_decimals
      from public.inbound_order_lines l
      left join public.products p on p.organization_id = l.organization_id and p.id = l.product_id
     where l.inbound_order_id = p_intake.id and l.removed_at is null
     order by l.line_no
  loop
    if v_line.product_id is null then
      v_failures := v_failures || jsonb_build_object('code', 'PRODUCT_UNMATCHED', 'line_id', v_line.id, 'message', 'Line ' || v_line.line_no || ' has no product.');
    elsif v_line.product_status <> 'active' then
      v_failures := v_failures || jsonb_build_object('code', 'PRODUCT_DISCONTINUED', 'line_id', v_line.id, 'message', 'Line ' || v_line.line_no || ' uses a discontinued product.');
    end if;
    if v_line.quantity is null or v_line.quantity <= 0
       or (v_line.product_id is not null and v_line.quantity <> round(v_line.quantity, v_line.quantity_decimals)) then
      v_failures := v_failures || jsonb_build_object('code', 'QUANTITY_INVALID', 'line_id', v_line.id, 'message', 'Line ' || v_line.line_no || ' has an invalid quantity.');
    end if;
    if v_line.product_id is not null and v_line.po_uom is not null
       and util.normalize_code(v_line.po_uom) is distinct from v_line.selling_uom
       and not util.has_text(v_line.uom_conversion_note) then
      v_failures := v_failures || jsonb_build_object('code', 'UOM_MISMATCH', 'line_id', v_line.id, 'message', 'Line ' || v_line.line_no || ' has an unresolved unit.');
    end if;
    if v_line.unit_price is null then
      v_failures := v_failures || jsonb_build_object('code', 'PRICE_MISSING', 'line_id', v_line.id, 'message', 'Line ' || v_line.line_no || ' has no price.');
    end if;
  end loop;

  -- No AI suggestion may be left unconfirmed (header and active lines).
  if exists (
    select 1 from jsonb_each(p_intake.field_meta) f
     where f.value ->> 'source' = 'ai' and f.value ->> 'state' = 'suggested'
  ) or exists (
    select 1 from public.inbound_order_lines l, jsonb_each(l.field_meta) f
     where l.inbound_order_id = p_intake.id and l.removed_at is null
       and f.value ->> 'source' = 'ai' and f.value ->> 'state' = 'suggested'
  ) then
    v_failures := v_failures || jsonb_build_object('code', 'UNCONFIRMED_FIELDS', 'message', 'Some AI suggestions have not been confirmed.');
  end if;

  if p_intake.validated_version is distinct from p_intake.version then
    v_failures := v_failures || jsonb_build_object('code', 'NOT_VALIDATED', 'message', 'Validation has not run on the latest version.');
  end if;

  if exists (
    select 1 from public.order_exceptions e
     where e.inbound_order_id = p_intake.id and e.severity = 'blocking' and e.status = 'open'
       and (v_approve or not e.overridable)
  ) then
    v_failures := v_failures || jsonb_build_object('code', 'OPEN_EXCEPTIONS', 'message', 'Blocking exceptions are still open.');
  end if;

  -- Non-duplicate overrides must still match the exception they accepted.
  if v_approve and exists (
    select 1 from public.order_exceptions e
     where e.inbound_order_id = p_intake.id and e.status = 'overridden'
       and e.code not in ('DUPLICATE_PO_NUMBER', 'DUPLICATE_DOCUMENT')
       and e.override_fingerprint is distinct from e.fingerprint
  ) then
    v_failures := v_failures || jsonb_build_object('code', 'OVERRIDE_STALE', 'message', 'An override no longer matches the current values.');
  end if;

  return v_failures;
end
$$;

-- Transaction-level lock per (workspace, customer, normalised PO number), so
-- approvals of the same PO number are serialised (§12.1 #4).
create function private.lock_po_number(p_organization_id uuid, p_customer_id uuid, p_po_normalized text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_customer_id is not null and p_po_normalized is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      p_organization_id::text || '|' || p_customer_id::text || '|' || p_po_normalized, 0));
  end if;
end
$$;

-- Locks and returns an intake the caller may see; not_found otherwise.
create function private.lock_intake(p_inbound_order_id uuid)
returns public.inbound_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders;
begin
  select * into v from public.inbound_orders where id = p_inbound_order_id for update;
  if not found or not private.is_member(v.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  return v;
end
$$;

create function private.assert_version(p_actual integer, p_expected integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_expected is null or p_actual <> p_expected then
    raise exception 'stale_version' using errcode = 'object_not_in_prerequisite_state';
  end if;
end
$$;

create function private.assert_intake_status(p_intake public.inbound_orders, p_allowed public.inbound_order_status[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not p_intake.status = any (p_allowed) then
    raise exception 'invalid_state: the order is %', p_intake.status using errcode = 'object_not_in_prerequisite_state';
  end if;
end
$$;

create function private.require_reason(p_reason text, p_label text default 'a reason')
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not util.has_text(p_reason) then
    raise exception 'validation_failed: % is required', p_label using errcode = 'invalid_parameter_value';
  end if;
  if length(p_reason) > 2000 then
    raise exception 'validation_failed: % is too long', p_label using errcode = 'invalid_parameter_value';
  end if;
  return btrim(p_reason);
end
$$;

-- ---------------------------------------------------------------------------
-- Intake transitions (§8.2)
-- ---------------------------------------------------------------------------
create function public.submit_inbound_order(p_inbound_order_id uuid, p_expected_version integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_failures jsonb;
begin
  perform private.assert_permission(v.organization_id, 'intake.submit');
  perform private.assert_intake_status(v, '{in_review}');
  perform private.assert_version(v.version, p_expected_version);
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'validation_failed: note is too long' using errcode = 'invalid_parameter_value';
  end if;

  v_failures := private.intake_gate(v, 'submit');
  if jsonb_array_length(v_failures) > 0 then
    return jsonb_build_object('ok', false, 'code', 'gate_failed', 'failures', v_failures);
  end if;

  perform private.begin_transition();
  update public.inbound_orders
     set status = 'pending_approval', submitted_by = auth.uid(), submitted_at = now(),
         submit_note = nullif(btrim(p_note), ''), decided_by = null, decided_at = null, decision_reason = null,
         version = version + 1, validated_version = validated_version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'inbound_order.submitted', 'inbound_order', v.id::text,
    null, null, null, nullif(btrim(p_note), ''),
    jsonb_build_object('override_required', (
      select coalesce(jsonb_agg(e.code), '[]'::jsonb) from public.order_exceptions e
       where e.inbound_order_id = v.id and e.status = 'open' and e.severity = 'blocking')));
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

create function public.withdraw_inbound_order(p_inbound_order_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
begin
  if v.submitted_by = auth.uid() then
    perform private.assert_permission(v.organization_id, 'intake.withdraw_own');
  else
    perform private.assert_permission(v.organization_id, 'intake.withdraw_any');
  end if;
  perform private.assert_intake_status(v, '{pending_approval}');
  perform private.assert_version(v.version, p_expected_version);

  perform private.begin_transition();
  update public.inbound_orders
     set status = 'in_review', version = version + 1, validated_version = validated_version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'inbound_order.withdrawn', 'inbound_order', v.id::text);
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

create function public.request_changes(p_inbound_order_id uuid, p_expected_version integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_reason text;
begin
  perform private.assert_permission(v.organization_id, 'intake.approve');
  perform private.assert_intake_status(v, '{pending_approval}');
  perform private.assert_version(v.version, p_expected_version);
  v_reason := private.require_reason(p_reason, 'a note for the reviewer');

  perform private.begin_transition();
  update public.inbound_orders
     set status = 'in_review', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason,
         version = version + 1, validated_version = validated_version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'inbound_order.changes_requested', 'inbound_order', v.id::text,
    null, null, null, v_reason);
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

create function public.reject_inbound_order(p_inbound_order_id uuid, p_expected_version integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_reason text;
begin
  perform private.assert_permission(v.organization_id, 'intake.approve');
  perform private.assert_intake_status(v, '{pending_approval}');
  perform private.assert_version(v.version, p_expected_version);
  v_reason := private.require_reason(p_reason);

  perform private.begin_transition();
  update public.inbound_orders
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason,
         version = version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'inbound_order.rejected', 'inbound_order', v.id::text,
    null, null, null, v_reason);
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

create function public.cancel_inbound_order(
  p_inbound_order_id uuid,
  p_expected_version integer,
  p_reason public.cancel_reason,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
begin
  perform private.assert_permission(v.organization_id, 'intake.cancel');
  perform private.assert_intake_status(v, '{in_review,extraction_failed}');
  perform private.assert_version(v.version, p_expected_version);
  if p_reason is null then
    raise exception 'validation_failed: a reason is required' using errcode = 'invalid_parameter_value';
  end if;
  if p_reason = 'other' then
    perform private.require_reason(p_note, 'a note');
  end if;

  perform private.begin_transition();
  update public.inbound_orders
     set status = 'cancelled', cancel_reason = p_reason, cancel_note = nullif(btrim(p_note), ''),
         cancelled_by = auth.uid(), cancelled_at = now(), version = version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'inbound_order.cancelled', 'inbound_order', v.id::text,
    null, null, null, coalesce(nullif(btrim(p_note), ''), p_reason::text), jsonb_build_object('cancel_reason', p_reason));
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

-- Override an overridable blocking exception (D-34). For duplicates the
-- current conflict set is recorded, so the override covers exactly what the
-- Approver reviewed (§12.1 #1).
create function public.override_exception(p_exception_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exception public.order_exceptions;
  v_intake public.inbound_orders;
  v_reason text;
  v_conflicts jsonb;
  v_fingerprint text;
begin
  select * into v_exception from public.order_exceptions where id = p_exception_id;
  if not found or not private.is_member(v_exception.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  v_intake := private.lock_intake(v_exception.inbound_order_id);
  select * into v_exception from public.order_exceptions where id = p_exception_id for update;
  perform private.assert_permission(v_exception.organization_id, 'exception.override');
  perform private.assert_intake_status(v_intake, '{in_review,pending_approval}');
  if not v_exception.overridable or v_exception.status <> 'open' then
    raise exception 'invalid_state: this exception cannot be overridden' using errcode = 'object_not_in_prerequisite_state';
  end if;
  v_reason := private.require_reason(p_reason);

  if v_exception.code in ('DUPLICATE_PO_NUMBER', 'DUPLICATE_DOCUMENT') then
    v_conflicts := case v_exception.code
                     when 'DUPLICATE_PO_NUMBER' then private.po_conflicts(v_intake)
                     else private.document_conflicts(v_intake) end;
    if jsonb_array_length(v_conflicts) = 0 then
      raise exception 'invalid_state: there is no longer a conflict to override' using errcode = 'object_not_in_prerequisite_state';
    end if;
    v_fingerprint := private.conflict_fingerprint(v_conflicts);
  else
    v_fingerprint := v_exception.fingerprint;
  end if;

  update public.order_exceptions
     set status = 'overridden', overridden_by = auth.uid(), overridden_at = now(), override_reason = v_reason,
         override_fingerprint = v_fingerprint, override_conflicts = v_conflicts
   where id = v_exception.id;
  perform private.write_audit(v_exception.organization_id, 'exception.overridden', 'exception', v_exception.id::text,
    'inbound_order', v_intake.id::text, null, v_reason,
    jsonb_build_object('code', v_exception.code, 'conflicts', v_conflicts, 'fingerprint', v_fingerprint));
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Approval (§9)
-- ---------------------------------------------------------------------------
create function private.sales_order_payload(p_sales_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 'v1',
    'sales_order_id', s.id,
    'order_number', s.order_number,
    'status', s.status,
    'customer_id', s.customer_id,
    'customer_po_number', s.customer_po_number,
    'currency', s.currency,
    'po_date', s.po_date,
    'requested_delivery_date', s.requested_delivery_date,
    'bill_to', s.bill_to,
    'ship_to', s.ship_to,
    'subtotal', s.subtotal,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'line_no', l.line_no, 'product_id', l.product_id, 'sku', l.sku, 'quantity', l.quantity,
               'uom', l.uom, 'unit_price', l.unit_price, 'line_total', l.line_total,
               'allocated_qty', l.allocated_qty, 'backordered_qty', l.backordered_qty) order by l.line_no), '[]'::jsonb)
        from public.sales_order_lines l where l.sales_order_id = s.id)
  )
  from public.sales_orders s where s.id = p_sales_order_id
$$;

create function private.next_sales_order_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_year integer;
  v_value bigint;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  v_year := extract(year from now() at time zone v_org.timezone)::integer;
  insert into public.document_sequences as d (organization_id, sequence_name, period, next_value)
  values (p_organization_id, 'sales_order', v_year, 2)
  on conflict (organization_id, sequence_name, period)
    do update set next_value = d.next_value + 1
  returning next_value - 1 into v_value;
  return v_org.sales_order_prefix || '-' || v_year || '-' || lpad(v_value::text, 6, '0');
end
$$;

-- Records one stock movement and moves the balance with it. Callers hold the
-- balance row lock.
create function private.apply_movement(
  p_organization_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_type public.movement_type,
  p_on_hand_delta numeric,
  p_reserved_delta numeric,
  p_sales_order_id uuid,
  p_sales_order_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.inventory_balances;
begin
  update public.inventory_balances
     set on_hand = on_hand + p_on_hand_delta, reserved = reserved + p_reserved_delta, version = version + 1
   where organization_id = p_organization_id and product_id = p_product_id and location_id = p_location_id
  returning * into v_balance;
  if not found then
    raise exception 'invalid_state: no stock balance for the product' using errcode = 'object_not_in_prerequisite_state';
  end if;
  insert into public.inventory_movements
    (organization_id, product_id, location_id, movement_type, on_hand_delta, reserved_delta,
     on_hand_after, reserved_after, sales_order_id, sales_order_line_id, actor_user_id, request_id)
  values
    (p_organization_id, p_product_id, p_location_id, p_type, p_on_hand_delta, p_reserved_delta,
     v_balance.on_hand, v_balance.reserved, p_sales_order_id, p_sales_order_line_id, auth.uid(), private.request_uuid());
end
$$;

-- p_stock_decisions: {"<inbound_order_line_id>": "backorder", ...} for lines
-- that cannot be fully reserved. Without a decision, approval stops with
-- needs_stock_decision and writes nothing.
create function public.approve_inbound_order(
  p_inbound_order_id uuid,
  p_expected_version integer,
  p_stock_decisions jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inbound_orders := private.lock_intake(p_inbound_order_id);
  v_org public.organizations;
  v_customer public.customers;
  v_failures jsonb;
  v_reopened integer;
  v_location uuid;
  v_line record;
  v_shortfalls jsonb := '[]'::jsonb;
  v_remaining jsonb := '{}'::jsonb;
  v_available numeric;
  v_alloc numeric;
  v_alloc_map jsonb := '{}'::jsonb;
  v_so_id uuid := gen_random_uuid();
  v_order_number text;
  v_minor smallint;
  v_dup_exception uuid;
  v_ship jsonb;
  v_bill jsonb;
  v_subtotal numeric := 0;
  v_so_line_id uuid;
  v_line_no integer := 0;
begin
  perform private.assert_permission(v.organization_id, 'intake.approve');
  select * into v_org from public.organizations where id = v.organization_id;

  -- Idempotent: a repeated approval returns the existing sales order.
  if v.status = 'approved' then
    return jsonb_build_object('ok', true, 'already_approved', true, 'sales_order_id', v.sales_order_id,
      'order_number', (select order_number from public.sales_orders where id = v.sales_order_id));
  end if;
  perform private.assert_intake_status(v, '{pending_approval}');
  perform private.assert_version(v.version, p_expected_version);
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'validation_failed: note is too long' using errcode = 'invalid_parameter_value';
  end if;
  if p_stock_decisions is null or jsonb_typeof(p_stock_decisions) <> 'object' then
    raise exception 'validation_failed: stock decisions must be an object' using errcode = 'invalid_parameter_value';
  end if;

  if v_org.require_independent_approval and v.submitted_by = auth.uid() then
    raise exception 'independent_approval_required' using errcode = 'insufficient_privilege';
  end if;

  -- Same PO number approvals run one at a time; each sees the other's order.
  perform private.lock_po_number(v.organization_id, v.customer_id, v.customer_po_number_normalized);

  -- Eligibility is read under share locks so it cannot change mid-approval.
  if v.customer_id is not null then
    select * into v_customer from public.customers
     where organization_id = v.organization_id and id = v.customer_id for share;
  end if;
  perform 1 from public.products p
   where p.organization_id = v.organization_id
     and p.id in (select l.product_id from public.inbound_order_lines l where l.inbound_order_id = v.id and l.removed_at is null)
   order by p.id for share;

  v_reopened := private.reopen_stale_duplicate_overrides(v);
  v_failures := private.intake_gate(v, 'approve');
  if jsonb_array_length(v_failures) > 0 then
    return jsonb_build_object('ok', false, 'code', 'gate_failed', 'failures', v_failures, 'reopened_overrides', v_reopened);
  end if;

  v_location := private.default_location(v.organization_id);

  -- Tracked products without a balance row get one (zero stock), so the
  -- reservation logic below always has a row to lock.
  insert into public.inventory_balances (organization_id, product_id, location_id)
  select distinct v.organization_id, l.product_id, v_location
    from public.inbound_order_lines l
    join public.products p on p.organization_id = l.organization_id and p.id = l.product_id
   where l.inbound_order_id = v.id and l.removed_at is null and p.track_inventory
  on conflict do nothing;

  -- Lock balances in one global order, then read what is available.
  for v_line in
    select b.product_id, b.on_hand - b.reserved as available
      from public.inventory_balances b
     where b.organization_id = v.organization_id and b.location_id = v_location
       and b.product_id in (
         select l.product_id from public.inbound_order_lines l
           join public.products p on p.organization_id = l.organization_id and p.id = l.product_id
          where l.inbound_order_id = v.id and l.removed_at is null and p.track_inventory)
     order by b.location_id, b.product_id
     for update of b
  loop
    v_remaining := v_remaining || jsonb_build_object(v_line.product_id::text, greatest(v_line.available, 0));
  end loop;

  -- Allocate in line order. Over-committed stock allocates nothing.
  for v_line in
    select l.id, l.line_no, l.product_id, l.quantity, p.track_inventory, p.quantity_decimals
      from public.inbound_order_lines l
      join public.products p on p.organization_id = l.organization_id and p.id = l.product_id
     where l.inbound_order_id = v.id and l.removed_at is null
     order by l.line_no
  loop
    if not v_line.track_inventory then
      v_alloc := v_line.quantity;
    else
      v_available := (v_remaining ->> v_line.product_id::text)::numeric;
      v_alloc := least(v_line.quantity, trunc(v_available, v_line.quantity_decimals));
      v_remaining := v_remaining || jsonb_build_object(v_line.product_id::text, v_available - v_alloc);
      if v_alloc < v_line.quantity and coalesce(p_stock_decisions ->> v_line.id::text, '') <> 'backorder' then
        v_shortfalls := v_shortfalls || jsonb_build_object('line_id', v_line.id, 'line_no', v_line.line_no,
          'product_id', v_line.product_id, 'requested', v_line.quantity, 'available', v_alloc);
      end if;
    end if;
    v_alloc_map := v_alloc_map || jsonb_build_object(v_line.id::text, v_alloc);
  end loop;

  if jsonb_array_length(v_shortfalls) > 0 then
    return jsonb_build_object('ok', false, 'code', 'needs_stock_decision', 'shortfalls', v_shortfalls);
  end if;

  -- Address snapshots: a selected saved address wins over the printed one.
  select coalesce(
           (select jsonb_build_object('line1', a.line1, 'line2', a.line2, 'city', a.city, 'region', a.region,
                                      'postal_code', a.postal_code, 'country_code', a.country_code, 'label', a.label)
              from public.customer_addresses a
             where a.organization_id = v.organization_id and a.id = v.ship_to_address_id),
           v.ship_to),
         coalesce(
           (select jsonb_build_object('line1', a.line1, 'line2', a.line2, 'city', a.city, 'region', a.region,
                                      'postal_code', a.postal_code, 'country_code', a.country_code, 'label', a.label)
              from public.customer_addresses a
             where a.organization_id = v.organization_id and a.id = v.bill_to_address_id),
           v.bill_to)
    into v_ship, v_bill;

  select c.minor_unit into v_minor from public.currencies c where c.code = v_org.base_currency;
  select coalesce(sum(round(l.quantity * l.unit_price, v_minor)), 0) into v_subtotal
    from public.inbound_order_lines l where l.inbound_order_id = v.id and l.removed_at is null;

  select e.id into v_dup_exception from public.order_exceptions e
   where e.inbound_order_id = v.id and e.inbound_order_line_id is null
     and e.code = 'DUPLICATE_PO_NUMBER' and e.status = 'overridden'
     and jsonb_array_length(private.po_conflicts(v)) > 0;

  v_order_number := private.next_sales_order_number(v.organization_id);

  begin
    insert into public.sales_orders
      (id, organization_id, order_number, inbound_order_id, customer_id, customer_po_number,
       duplicate_override_exception_id, po_date, requested_delivery_date, currency, bill_to, ship_to,
       payment_terms, notes, subtotal, status, approved_by, approved_at)
    values
      (v_so_id, v.organization_id, v_order_number, v.id, v.customer_id, v.customer_po_number,
       v_dup_exception, v.po_date, v.requested_delivery_date, v_org.base_currency, v_bill, v_ship,
       coalesce(v.payment_terms, v_customer.payment_terms), v.notes, v_subtotal, 'confirmed', auth.uid(), now());
  exception when unique_violation then
    if sqlerrm like '%inbound_order_id%' then
      raise exception 'already_approved' using errcode = 'object_not_in_prerequisite_state';
    end if;
    raise exception 'duplicate_po_number' using errcode = 'unique_violation';
  end;

  for v_line in
    select l.*, p.sku, p.name as product_name, p.selling_uom, p.track_inventory
      from public.inbound_order_lines l
      join public.products p on p.organization_id = l.organization_id and p.id = l.product_id
     where l.inbound_order_id = v.id and l.removed_at is null
     order by l.line_no
  loop
    v_line_no := v_line_no + 1;
    v_alloc := (v_alloc_map ->> v_line.id::text)::numeric;
    v_so_line_id := gen_random_uuid();
    insert into public.sales_order_lines
      (id, organization_id, sales_order_id, line_no, product_id, sku, product_name, customer_part_number,
       description_as_ordered, quantity, uom, unit_price, currency_minor_unit, line_total, price_source,
       match_method, allocated_qty, backordered_qty, source_inbound_order_line_id)
    values
      (v_so_line_id, v.organization_id, v_so_id, v_line_no, v_line.product_id, v_line.sku, v_line.product_name,
       v_line.customer_part_number, v_line.description, v_line.quantity, v_line.selling_uom, v_line.unit_price,
       v_minor, round(v_line.quantity * v_line.unit_price, v_minor), v_line.price_source, v_line.match_method,
       v_alloc, v_line.quantity - v_alloc, v_line.id);
    if v_line.track_inventory and v_alloc > 0 then
      perform private.apply_movement(v.organization_id, v_line.product_id, v_location, 'reservation',
        0, v_alloc, v_so_id, v_so_line_id);
    end if;

    -- Learn the customer's part number when the reviewer asked to remember it.
    if v_line.remember_alias and util.has_text(v_line.customer_part_number) then
      update public.customer_item_aliases a
         set status = 'archived'
       where a.organization_id = v.organization_id and a.customer_id = v.customer_id
         and a.customer_part_number_normalized = util.normalize_code(v_line.customer_part_number)
         and a.status = 'active' and a.product_id <> v_line.product_id;
      insert into public.customer_item_aliases
        (organization_id, customer_id, product_id, customer_part_number, customer_description, source_inbound_order_id)
      select v.organization_id, v.customer_id, v_line.product_id, v_line.customer_part_number,
             left(v_line.description, 400), v.id
       where not exists (
         select 1 from public.customer_item_aliases a
          where a.organization_id = v.organization_id and a.customer_id = v.customer_id
            and a.customer_part_number_normalized = util.normalize_code(v_line.customer_part_number)
            and a.status = 'active');
    end if;
  end loop;

  perform private.begin_transition();
  update public.inbound_orders
     set status = 'approved', decided_by = auth.uid(), decided_at = now(),
         decision_reason = nullif(btrim(p_note), ''), sales_order_id = v_so_id, version = version + 1
   where id = v.id;
  perform private.end_transition();

  perform private.write_audit(v.organization_id, 'inbound_order.approved', 'inbound_order', v.id::text,
    null, null, null, nullif(btrim(p_note), ''),
    jsonb_build_object('sales_order_id', v_so_id, 'order_number', v_order_number,
                       'duplicate_override_exception_id', v_dup_exception));
  perform private.write_audit(v.organization_id, 'sales_order.confirmed', 'sales_order', v_so_id::text,
    'inbound_order', v.id::text, null, null,
    jsonb_build_object('order_number', v_order_number, 'allocations', v_alloc_map,
                       'backordered', (select coalesce(sum(backordered_qty), 0) from public.sales_order_lines where sales_order_id = v_so_id)));
  insert into public.integration_outbox (organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v.organization_id, 'sales_order.confirmed', 'sales_order', v_so_id, private.sales_order_payload(v_so_id));

  return jsonb_build_object('ok', true, 'already_approved', false, 'sales_order_id', v_so_id, 'order_number', v_order_number);
end
$$;

-- ---------------------------------------------------------------------------
-- Fulfilment and cancellation (FR-SO-04, FR-SO-05, D-20, D-35)
-- ---------------------------------------------------------------------------
create function private.lock_sales_order(p_sales_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sales_orders;
begin
  select * into v from public.sales_orders where id = p_sales_order_id for update;
  if not found or not private.is_member(v.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  return v;
end
$$;

-- Quantity still reserved for each line of a sales order, per balance
-- (from the ledger, so it is right even if tracking changed later).
create function private.line_reservations(p_sales_order_id uuid)
returns table (sales_order_line_id uuid, product_id uuid, location_id uuid, reserved numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.sales_order_line_id, m.product_id, m.location_id, sum(m.reserved_delta)
    from public.inventory_movements m
   where m.sales_order_id = p_sales_order_id
   group by m.sales_order_line_id, m.product_id, m.location_id
  having sum(m.reserved_delta) > 0
$$;

create function public.fulfill_sales_order(p_sales_order_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sales_orders := private.lock_sales_order(p_sales_order_id);
  v_res record;
  v_balance public.inventory_balances;
begin
  perform private.assert_permission(v.organization_id, 'sales_order.fulfil');
  if v.status <> 'confirmed' then
    raise exception 'invalid_state: the sales order is %', v.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform private.assert_version(v.version, p_expected_version);

  for v_res in
    select r.* from private.line_reservations(v.id) r order by r.location_id, r.product_id
  loop
    select * into v_balance from public.inventory_balances b
     where b.organization_id = v.organization_id and b.product_id = v_res.product_id and b.location_id = v_res.location_id
     for update;
    if v_balance.on_hand < v_res.reserved then
      raise exception 'insufficient_on_hand' using errcode = 'object_not_in_prerequisite_state',
        detail = 'Receive or adjust stock before fulfilling this order.';
    end if;
    perform private.apply_movement(v.organization_id, v_res.product_id, v_res.location_id, 'issue',
      -v_res.reserved, -v_res.reserved, v.id, v_res.sales_order_line_id);
  end loop;

  perform private.begin_transition();
  update public.sales_orders
     set status = 'fulfilled', fulfilled_by = auth.uid(), fulfilled_at = now(), version = version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'sales_order.fulfilled', 'sales_order', v.id::text, null, null, null, null,
    jsonb_build_object('backordered_not_fulfilled', (
      select coalesce(sum(backordered_qty), 0) from public.sales_order_lines where sales_order_id = v.id)));
  insert into public.integration_outbox (organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v.organization_id, 'sales_order.fulfilled', 'sales_order', v.id, private.sales_order_payload(v.id));
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

create function public.cancel_sales_order(p_sales_order_id uuid, p_expected_version integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sales_orders := private.lock_sales_order(p_sales_order_id);
  v_res record;
  v_reason text;
begin
  perform private.assert_permission(v.organization_id, 'sales_order.cancel');
  if v.status <> 'confirmed' then
    raise exception 'invalid_state: the sales order is %', v.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform private.assert_version(v.version, p_expected_version);
  v_reason := private.require_reason(p_reason);

  for v_res in
    select r.* from private.line_reservations(v.id) r order by r.location_id, r.product_id
  loop
    perform 1 from public.inventory_balances b
     where b.organization_id = v.organization_id and b.product_id = v_res.product_id and b.location_id = v_res.location_id
     for update;
    perform private.apply_movement(v.organization_id, v_res.product_id, v_res.location_id, 'reservation_release',
      0, -v_res.reserved, v.id, v_res.sales_order_line_id);
  end loop;

  perform private.begin_transition();
  update public.sales_orders
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason,
         version = version + 1
   where id = v.id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'sales_order.cancelled', 'sales_order', v.id::text,
    null, null, null, v_reason);
  insert into public.integration_outbox (organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v.organization_id, 'sales_order.cancelled', 'sales_order', v.id, private.sales_order_payload(v.id));
  return jsonb_build_object('ok', true, 'version', v.version + 1);
end
$$;

-- ---------------------------------------------------------------------------
-- Inventory integrity (§10.2). Returns one row per violation; empty is healthy.
-- ---------------------------------------------------------------------------
create function private.inventory_integrity_report(p_organization_id uuid default null)
returns table (invariant text, organization_id uuid, product_id uuid, location_id uuid, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  -- I-1 is enforced by check constraints; reported for completeness.
  select 'I-1', b.organization_id, b.product_id, b.location_id, 'negative on hand or reserved'
    from public.inventory_balances b
   where (p_organization_id is null or b.organization_id = p_organization_id) and (b.on_hand < 0 or b.reserved < 0)
  union all
  select 'I-2', b.organization_id, b.product_id, b.location_id,
         'on_hand ' || b.on_hand || ' <> ledger ' || coalesce(m.on_hand, 0)
    from public.inventory_balances b
    left join (select organization_id, product_id, location_id, sum(on_hand_delta) on_hand, sum(reserved_delta) reserved
                 from public.inventory_movements group by 1, 2, 3) m
      using (organization_id, product_id, location_id)
   where (p_organization_id is null or b.organization_id = p_organization_id) and b.on_hand <> coalesce(m.on_hand, 0)
  union all
  select 'I-3', b.organization_id, b.product_id, b.location_id,
         'reserved ' || b.reserved || ' <> ledger ' || coalesce(m.reserved, 0)
    from public.inventory_balances b
    left join (select organization_id, product_id, location_id, sum(reserved_delta) reserved
                 from public.inventory_movements group by 1, 2, 3) m
      using (organization_id, product_id, location_id)
   where (p_organization_id is null or b.organization_id = p_organization_id) and b.reserved <> coalesce(m.reserved, 0)
  union all
  -- I-4: reserved equals what confirmed orders hold (per product; one location in the MVP).
  select 'I-4', b.organization_id, b.product_id, b.location_id,
         'reserved ' || b.reserved || ' <> confirmed allocations ' || coalesce(a.allocated, 0)
    from public.inventory_balances b
    join public.products p on p.organization_id = b.organization_id and p.id = b.product_id
    left join (
      select r.organization_id, r.product_id, r.location_id, sum(r.reserved_delta) allocated
        from public.inventory_movements r
        join public.sales_orders s on s.id = r.sales_order_id
       where s.status = 'confirmed'
       group by 1, 2, 3) a
      on a.organization_id = b.organization_id and a.product_id = b.product_id and a.location_id = b.location_id
   where (p_organization_id is null or b.organization_id = p_organization_id) and b.reserved <> coalesce(a.allocated, 0)
  union all
  -- I-6: each tracked line's movements match its order status.
  select 'I-6', s.organization_id, l.product_id, null, 'line ' || l.id || ' of ' || s.status || ' order: reserved '
         || coalesce(sum(m.reserved_delta) filter (where m.movement_type = 'reservation'), 0) || ', still held '
         || coalesce(sum(m.reserved_delta), 0) || ', issued ' || coalesce(-sum(m.on_hand_delta), 0)
    from public.sales_order_lines l
    join public.sales_orders s on s.id = l.sales_order_id
    left join public.inventory_movements m on m.sales_order_line_id = l.id
   where (p_organization_id is null or s.organization_id = p_organization_id)
     and exists (select 1 from public.inventory_movements x where x.sales_order_line_id = l.id)
   group by s.organization_id, s.status, l.id, l.product_id, l.allocated_qty
  having coalesce(sum(m.reserved_delta) filter (where m.movement_type = 'reservation'), 0) <> l.allocated_qty
      or (s.status = 'confirmed' and coalesce(sum(m.reserved_delta), 0) <> l.allocated_qty)
      or (s.status in ('cancelled', 'fulfilled') and coalesce(sum(m.reserved_delta), 0) <> 0)
      or (s.status = 'fulfilled' and coalesce(-sum(m.on_hand_delta), 0) <> l.allocated_qty)
      or (s.status <> 'fulfilled' and coalesce(sum(m.on_hand_delta), 0) <> 0)
$$;

-- Nightly check: records violations in the audit trail (system actor).
create function private.run_integrity_check()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_count integer := 0;
begin
  perform set_config('orderpilot.process', 'inventory.integrity_check', true);
  for v in select * from private.inventory_integrity_report() loop
    perform private.write_audit(v.organization_id, 'inventory.integrity_violation', 'product',
      coalesce(v.product_id::text, 'unknown'), null, null, null, null,
      jsonb_build_object('invariant', v.invariant, 'detail', v.detail));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.request_uuid() from public, anon, authenticated;
revoke all on function private.begin_transition() from public, anon, authenticated;
revoke all on function private.end_transition() from public, anon, authenticated;
revoke all on function private.sha256_hex(text) from public, anon, authenticated;
revoke all on function private.default_location(uuid) from public, anon, authenticated;
revoke all on function private.po_conflicts(public.inbound_orders) from public, anon, authenticated;
revoke all on function private.document_conflicts(public.inbound_orders) from public, anon, authenticated;
revoke all on function private.conflict_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function private.reopen_stale_duplicate_overrides(public.inbound_orders) from public, anon, authenticated;
revoke all on function private.intake_gate(public.inbound_orders, text) from public, anon, authenticated;
revoke all on function private.lock_po_number(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.lock_intake(uuid) from public, anon, authenticated;
revoke all on function private.assert_version(integer, integer) from public, anon, authenticated;
revoke all on function private.assert_intake_status(public.inbound_orders, public.inbound_order_status[]) from public, anon, authenticated;
revoke all on function private.require_reason(text, text) from public, anon, authenticated;
revoke all on function private.sales_order_payload(uuid) from public, anon, authenticated;
revoke all on function private.next_sales_order_number(uuid) from public, anon, authenticated;
revoke all on function private.apply_movement(uuid, uuid, uuid, public.movement_type, numeric, numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function private.lock_sales_order(uuid) from public, anon, authenticated;
revoke all on function private.line_reservations(uuid) from public, anon, authenticated;
revoke all on function private.inventory_integrity_report(uuid) from public, anon, authenticated;
revoke all on function private.run_integrity_check() from public, anon, authenticated;

revoke all on function public.submit_inbound_order(uuid, integer, text) from public, anon;
revoke all on function public.withdraw_inbound_order(uuid, integer) from public, anon;
revoke all on function public.request_changes(uuid, integer, text) from public, anon;
revoke all on function public.reject_inbound_order(uuid, integer, text) from public, anon;
revoke all on function public.cancel_inbound_order(uuid, integer, public.cancel_reason, text) from public, anon;
revoke all on function public.override_exception(uuid, text) from public, anon;
revoke all on function public.approve_inbound_order(uuid, integer, jsonb, text) from public, anon;
revoke all on function public.fulfill_sales_order(uuid, integer) from public, anon;
revoke all on function public.cancel_sales_order(uuid, integer, text) from public, anon;
grant execute on function public.submit_inbound_order(uuid, integer, text) to authenticated;
grant execute on function public.withdraw_inbound_order(uuid, integer) to authenticated;
grant execute on function public.request_changes(uuid, integer, text) to authenticated;
grant execute on function public.reject_inbound_order(uuid, integer, text) to authenticated;
grant execute on function public.cancel_inbound_order(uuid, integer, public.cancel_reason, text) to authenticated;
grant execute on function public.override_exception(uuid, text) to authenticated;
grant execute on function public.approve_inbound_order(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.fulfill_sales_order(uuid, integer) to authenticated;
grant execute on function public.cancel_sales_order(uuid, integer, text) to authenticated;
