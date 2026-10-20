-- OrderPilot Phase 2B · Migration 11: role-checked functions for protected
-- columns (C-03, M-01, M-08, C-04, D-05). Column grants deny direct writes to
-- these columns for every role; these functions are the only way to change them.
--
-- Each function: locks the row, checks membership (not_found otherwise, so
-- other workspaces' records are never revealed), checks the permission,
-- validates input, records the reason for the audit trigger, and bumps version.

create function public.set_customer_status(
  p_customer_id uuid,
  p_status public.customer_status,
  p_reason text default null
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found or not private.is_member(v_customer.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;

  -- Hold and release: Approver+. Deactivate and reactivate: Admin+ (M-08).
  perform private.assert_permission(
    v_customer.organization_id,
    case when p_status = 'inactive' or v_customer.status = 'inactive' then 'customer.deactivate' else 'customer.hold' end
  );

  if p_status = v_customer.status then
    raise exception 'invalid_state' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_status = 'on_hold' and not util.has_text(p_reason) then
    raise exception 'validation_failed: a hold needs a reason' using errcode = 'invalid_parameter_value';
  end if;
  if p_reason is not null and length(p_reason) > 2000 then
    raise exception 'validation_failed: reason too long' using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('orderpilot.audit_reason', coalesce(btrim(p_reason), ''), true);

  update public.customers
     set status = p_status,
         hold_reason = case when p_status = 'on_hold' then btrim(p_reason) end,
         hold_set_by = case when p_status = 'on_hold' then auth.uid() end,
         hold_set_at = case when p_status = 'on_hold' then now() end,
         version = version + 1
   where id = p_customer_id
  returning * into v_customer;

  perform set_config('orderpilot.audit_reason', '', true);
  return v_customer;
end
$$;

create function public.set_product_price(
  p_product_id uuid,
  p_list_price numeric,
  p_reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found or not private.is_member(v_product.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_permission(v_product.organization_id, 'price.change');

  -- numeric(19,4) would round silently; reject instead of guessing.
  if p_list_price is null or p_list_price < 0 or p_list_price <> round(p_list_price, 4) then
    raise exception 'validation_failed: price must be zero or more with at most 4 decimals'
      using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('orderpilot.audit_reason', coalesce(btrim(p_reason), ''), true);
  update public.products
     set list_price = p_list_price, version = version + 1
   where id = p_product_id
  returning * into v_product;
  perform set_config('orderpilot.audit_reason', '', true);
  return v_product;
end
$$;

create function public.set_product_tracking(
  p_product_id uuid,
  p_track_inventory boolean
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_location uuid;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found or not private.is_member(v_product.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_permission(v_product.organization_id, 'product.edit');

  if p_track_inventory is null or p_track_inventory = v_product.track_inventory then
    raise exception 'invalid_state' using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not p_track_inventory then
    -- M-01: tracking cannot be switched off while stock is reserved.
    if exists (
      select 1 from public.inventory_balances b
       where b.organization_id = v_product.organization_id and b.product_id = p_product_id and b.reserved > 0
    ) then
      raise exception 'invalid_state: product has open reservations' using errcode = 'object_not_in_prerequisite_state';
    end if;
  else
    -- M-01: switching tracking on creates the balance at the default location.
    select l.id into v_location from public.locations l
     where l.organization_id = v_product.organization_id and l.is_default;
    if v_location is null then
      raise exception 'invalid_state: workspace has no default location' using errcode = 'object_not_in_prerequisite_state';
    end if;
    insert into public.inventory_balances (organization_id, product_id, location_id)
    values (v_product.organization_id, p_product_id, v_location)
    on conflict do nothing;
  end if;

  update public.products
     set track_inventory = p_track_inventory, version = version + 1
   where id = p_product_id
  returning * into v_product;
  return v_product;
end
$$;

-- Workspace settings (FR-ORG-02). Owner or Admin with MFA (AAL2). Turning off
-- independent approval is Owner-only (approved D-05). Unknown keys are rejected.
create function public.update_workspace_settings(
  p_organization_id uuid,
  p_changes jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_key text;
  v_allowed text[] := array[
    'name', 'legal_name', 'timezone', 'locale', 'sales_order_prefix',
    'require_independent_approval', 'price_tolerance_pct', 'confidence_threshold',
    'duplicate_lookback_days'
  ];
begin
  select * into v_org from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_permission(p_organization_id, 'settings.change');
  perform private.assert_aal2();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'validation_failed: no changes' using errcode = 'invalid_parameter_value';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any (v_allowed) then
      raise exception 'validation_failed: % cannot be changed here', v_key using errcode = 'invalid_parameter_value';
    end if;
  end loop;
  if p_changes ? 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_changes ->> 'timezone') then
    raise exception 'validation_failed: unknown time zone' using errcode = 'invalid_parameter_value';
  end if;
  if p_changes ? 'require_independent_approval'
     and (p_changes ->> 'require_independent_approval')::boolean is false
     and v_org.require_independent_approval
     and not exists (
       select 1 from public.organization_members m
        where m.organization_id = p_organization_id and m.user_id = auth.uid()
          and m.status = 'active' and m.role = 'owner'
     ) then
    raise exception 'insufficient_privilege: only an Owner can turn off independent approval'
      using errcode = 'insufficient_privilege';
  end if;

  update public.organizations o
     set name = coalesce(p_changes ->> 'name', o.name),
         legal_name = case when p_changes ? 'legal_name' then p_changes ->> 'legal_name' else o.legal_name end,
         timezone = coalesce(p_changes ->> 'timezone', o.timezone),
         locale = coalesce(p_changes ->> 'locale', o.locale),
         sales_order_prefix = coalesce(p_changes ->> 'sales_order_prefix', o.sales_order_prefix),
         require_independent_approval = coalesce((p_changes ->> 'require_independent_approval')::boolean, o.require_independent_approval),
         price_tolerance_pct = coalesce((p_changes ->> 'price_tolerance_pct')::numeric, o.price_tolerance_pct),
         confidence_threshold = coalesce((p_changes ->> 'confidence_threshold')::numeric, o.confidence_threshold),
         duplicate_lookback_days = coalesce((p_changes ->> 'duplicate_lookback_days')::integer, o.duplicate_lookback_days)
   where o.id = p_organization_id
  returning * into v_org;
  return v_org;
end
$$;

-- Base currency (C-04): Owner with MFA, only before the first customer PO exists.
create function public.set_base_currency(
  p_organization_id uuid,
  p_currency char(3)
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where id = p_organization_id for update;
  if not found or not private.is_member(p_organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if not exists (
    select 1 from public.organization_members m
     where m.organization_id = p_organization_id and m.user_id = auth.uid()
       and m.status = 'active' and m.role = 'owner'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
  perform private.assert_aal2();
  if exists (select 1 from public.inbound_orders i where i.organization_id = p_organization_id) then
    raise exception 'invalid_state: currency is locked once customer POs exist' using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.organizations set base_currency = p_currency where id = p_organization_id
  returning * into v_org;
  return v_org;
end
$$;

revoke all on function public.set_customer_status(uuid, public.customer_status, text) from public, anon;
revoke all on function public.set_product_price(uuid, numeric, text) from public, anon;
revoke all on function public.set_product_tracking(uuid, boolean) from public, anon;
revoke all on function public.update_workspace_settings(uuid, jsonb) from public, anon;
revoke all on function public.set_base_currency(uuid, char) from public, anon;
grant execute on function public.set_customer_status(uuid, public.customer_status, text) to authenticated;
grant execute on function public.set_product_price(uuid, numeric, text) to authenticated;
grant execute on function public.set_product_tracking(uuid, boolean) to authenticated;
grant execute on function public.update_workspace_settings(uuid, jsonb) to authenticated;
grant execute on function public.set_base_currency(uuid, char) to authenticated;
