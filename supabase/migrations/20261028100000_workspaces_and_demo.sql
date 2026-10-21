-- OrderPilot Phase 6 · Migration 20: workspace creation and demo reset.
-- PRODUCT_REQUIREMENTS.md FR-ORG-06, FR-ORG-07; USER_FLOWS.md UF-13.
-- Both are platform-operator actions (service role only).

-- FR-ORG-07: a new workspace gets its default location, settings and sequences.
create function public.create_organization(
  p_name text,
  p_slug text,
  p_country_code char(2),
  p_base_currency char(3),
  p_timezone text,
  p_locale text,
  p_owner_user_id uuid,
  p_is_demo boolean default false,
  p_sales_order_prefix text default 'SO',
  p_legal_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not exists (select 1 from public.profiles where id = p_owner_user_id) then
    raise exception 'validation_failed: the owner must have an account' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.organizations (name, legal_name, slug, country_code, base_currency, timezone, locale, sales_order_prefix, is_demo)
  values (btrim(p_name), p_legal_name, lower(p_slug), upper(p_country_code), upper(p_base_currency), p_timezone, p_locale, p_sales_order_prefix, p_is_demo)
  returning id into v_org;
  insert into public.locations (organization_id, code, name, is_default) values (v_org, 'MAIN', 'Main warehouse', true);
  insert into public.document_sequences (organization_id, sequence_name, period, next_value)
  values (v_org, 'inbound_order', 0, 1);
  insert into public.organization_members (organization_id, user_id, role) values (v_org, p_owner_user_id, 'owner');
  perform set_config('orderpilot.process', 'operator.create_organization', true);
  perform private.write_audit(v_org, 'organization.created', 'organization', v_org::text, null, null, null, null,
    jsonb_build_object('is_demo', p_is_demo));
  return v_org;
end
$$;

-- UF-13 scene 8: reset a demo workspace for the next prospect. Nothing is
-- deleted (business records are append-only): the current demo workspace is
-- archived (suspended, slug freed) and a fresh copy is created with the same
-- members, settings, master data and opening stock, and no orders.
create function public.reset_demo_workspace(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.organizations;
  v_new uuid;
  v_location uuid;
  v_owner uuid;
begin
  select * into v_old from public.organizations where id = p_organization_id for update;
  if not found or not v_old.is_demo then
    raise exception 'invalid_state: only demo workspaces can be reset' using errcode = 'object_not_in_prerequisite_state';
  end if;
  select user_id into v_owner from public.organization_members
   where organization_id = v_old.id and role = 'owner' and status = 'active' order by joined_at limit 1;
  if v_owner is null then
    raise exception 'invalid_state: the demo workspace has no active owner' using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform set_config('orderpilot.process', 'operator.reset_demo', true);
  update public.organizations
     set status = 'suspended', slug = left(v_old.slug, 22) || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')
   where id = v_old.id;
  perform private.write_audit(v_old.id, 'organization.demo_archived', 'organization', v_old.id::text);

  v_new := public.create_organization(v_old.name, v_old.slug, v_old.country_code, v_old.base_currency, v_old.timezone,
                                      v_old.locale, v_owner, true, v_old.sales_order_prefix, v_old.legal_name);
  update public.organizations
     set require_independent_approval = v_old.require_independent_approval, price_tolerance_pct = v_old.price_tolerance_pct,
         confidence_threshold = v_old.confidence_threshold, duplicate_lookback_days = v_old.duplicate_lookback_days
   where id = v_new;
  insert into public.organization_members (organization_id, user_id, role)
  select v_new, m.user_id, m.role from public.organization_members m
   where m.organization_id = v_old.id and m.status = 'active' and m.user_id <> v_owner;

  -- Master data, mapped to new ids.
  create temp table demo_map (kind text, old_id uuid, new_id uuid default gen_random_uuid()) on commit drop;
  insert into demo_map (kind, old_id) select 'customer', id from public.customers where organization_id = v_old.id;
  insert into demo_map (kind, old_id) select 'product', id from public.products where organization_id = v_old.id;

  insert into public.customers (id, organization_id, account_number, name, status, hold_reason, email, phone, payment_terms, date_order_hint, notes)
  select m.new_id, v_new, c.account_number, c.name, c.status, c.hold_reason, c.email, c.phone, c.payment_terms, c.date_order_hint, c.notes
    from public.customers c join demo_map m on m.kind = 'customer' and m.old_id = c.id;
  insert into public.customer_addresses (organization_id, customer_id, type, label, line1, line2, line3, city, region, postal_code, country_code, is_default)
  select v_new, m.new_id, a.type, a.label, a.line1, a.line2, a.line3, a.city, a.region, a.postal_code, a.country_code, a.is_default
    from public.customer_addresses a join demo_map m on m.kind = 'customer' and m.old_id = a.customer_id
   where a.status = 'active';
  insert into public.products (id, organization_id, sku, name, description, selling_uom, quantity_decimals, list_price, gtin, status, track_inventory, reorder_point)
  select m.new_id, v_new, p.sku, p.name, p.description, p.selling_uom, p.quantity_decimals, p.list_price, p.gtin, p.status, p.track_inventory, p.reorder_point
    from public.products p join demo_map m on m.kind = 'product' and m.old_id = p.id;
  insert into public.customer_item_aliases (organization_id, customer_id, product_id, customer_part_number, customer_description)
  select v_new, mc.new_id, mp.new_id, a.customer_part_number, a.customer_description
    from public.customer_item_aliases a
    join demo_map mc on mc.kind = 'customer' and mc.old_id = a.customer_id
    join demo_map mp on mp.kind = 'product' and mp.old_id = a.product_id
   where a.status = 'active';
  insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from, valid_to)
  select v_new, mc.new_id, mp.new_id, cp.unit_price, cp.valid_from, cp.valid_to
    from public.customer_prices cp
    join demo_map mc on mc.kind = 'customer' and mc.old_id = cp.customer_id
    join demo_map mp on mp.kind = 'product' and mp.old_id = cp.product_id;

  -- Opening stock as originally seeded (opening-balance adjustments only).
  select id into v_location from public.locations where organization_id = v_new and is_default;
  update public.inventory_balances b
     set on_hand = o.qty
    from (select mp.new_id, sum(mv.on_hand_delta) qty
            from public.inventory_movements mv join demo_map mp on mp.kind = 'product' and mp.old_id = mv.product_id
           where mv.organization_id = v_old.id and mv.adjustment_reason = 'opening_balance'
           group by mp.new_id) o
   where b.organization_id = v_new and b.product_id = o.new_id and b.location_id = v_location and o.qty > 0;
  insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, adjustment_reason,
    on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference)
  select v_new, b.product_id, b.location_id, 'adjustment', 'opening_balance', b.on_hand, 0, b.on_hand, 0, 'Opening balance (demo reset)'
    from public.inventory_balances b where b.organization_id = v_new and b.on_hand > 0;

  perform private.write_audit(v_new, 'organization.demo_reset', 'organization', v_new::text, null, null, null, null,
    jsonb_build_object('archived_workspace_id', v_old.id));
  return v_new;
end
$$;

revoke all on function public.create_organization(text, text, char, char, text, text, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.reset_demo_workspace(uuid) from public, anon, authenticated;
grant execute on function public.create_organization(text, text, char, char, text, text, uuid, boolean, text, text) to service_role;
grant execute on function public.reset_demo_workspace(uuid) to service_role;
