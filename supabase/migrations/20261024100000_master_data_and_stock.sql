-- OrderPilot Phase 3 · Migration 16: stock receipts and adjustments, stock
-- levels, duplicate-customer check. PRODUCT_REQUIREMENTS.md FR-CUST-08,
-- FR-PROD-08, FR-INV-01 to 07, 09; DATABASE_ARCHITECTURE.md §10.

-- A tracked product always has a balance at the default location, so it
-- appears in the stock list from the moment it is created (FR-PROD-08).
create function private.create_product_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.track_inventory then
    insert into public.inventory_balances (organization_id, product_id, location_id)
    select new.organization_id, new.id, l.id
      from public.locations l
     where l.organization_id = new.organization_id and l.is_default
    on conflict do nothing;
  end if;
  return null;
end
$$;

create trigger products_create_balance after insert on public.products
  for each row execute function private.create_product_balance();

-- Backfill for products created before this migration.
insert into public.inventory_balances (organization_id, product_id, location_id)
select p.organization_id, p.id, l.id
  from public.products p
  join public.locations l on l.organization_id = p.organization_id and l.is_default
 where p.track_inventory
on conflict do nothing;

-- Movement with reference, note and reason (receipts and adjustments).
-- Callers hold the balance row lock.
create function private.record_stock_movement(
  p_organization_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_type public.movement_type,
  p_on_hand_delta numeric,
  p_reason public.adjustment_reason,
  p_reference text,
  p_note text
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.inventory_balances;
  v_movement public.inventory_movements;
begin
  update public.inventory_balances
     set on_hand = on_hand + p_on_hand_delta, version = version + 1
   where organization_id = p_organization_id and product_id = p_product_id and location_id = p_location_id
  returning * into v_balance;
  insert into public.inventory_movements
    (organization_id, product_id, location_id, movement_type, adjustment_reason, on_hand_delta, reserved_delta,
     on_hand_after, reserved_after, reference, note, actor_user_id, request_id)
  values
    (p_organization_id, p_product_id, p_location_id, p_type, p_reason, p_on_hand_delta, 0,
     v_balance.on_hand, v_balance.reserved, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
     auth.uid(), private.request_uuid())
  returning * into v_movement;
  return v_movement;
end
$$;

-- Locks the product's default-location balance for a stock change and checks
-- the caller, the product and the quantity's decimals.
create function private.lock_stock(p_product_id uuid, p_quantity numeric)
returns public.inventory_balances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_balance public.inventory_balances;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found or not private.is_member(v_product.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform private.assert_permission(v_product.organization_id, 'stock.change');
  if not v_product.track_inventory then
    raise exception 'invalid_state: this product does not track inventory' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_quantity is null or p_quantity <> round(p_quantity, v_product.quantity_decimals) then
    raise exception 'validation_failed: the quantity must have at most % decimal places', v_product.quantity_decimals
      using errcode = 'invalid_parameter_value';
  end if;
  select b.* into v_balance from public.inventory_balances b
   where b.organization_id = v_product.organization_id and b.product_id = p_product_id
     and b.location_id = private.default_location(v_product.organization_id)
   for update;
  if not found then
    raise exception 'invalid_state: no stock balance for the product' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return v_balance;
end
$$;

-- FR-INV-02: receive stock.
create function public.receive_stock(p_product_id uuid, p_quantity numeric, p_reference text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.inventory_balances := private.lock_stock(p_product_id, p_quantity);
  v_movement public.inventory_movements;
begin
  if p_quantity <= 0 or p_quantity > 99999999999 then
    raise exception 'validation_failed: enter a quantity greater than zero' using errcode = 'invalid_parameter_value';
  end if;
  if (p_reference is not null and length(p_reference) > 120) or (p_note is not null and length(p_note) > 1000) then
    raise exception 'validation_failed: reference or note is too long' using errcode = 'invalid_parameter_value';
  end if;
  v_movement := private.record_stock_movement(v_balance.organization_id, v_balance.product_id, v_balance.location_id,
    'receipt', p_quantity, null, p_reference, p_note);
  return jsonb_build_object('ok', true, 'on_hand', v_movement.on_hand_after, 'reserved', v_movement.reserved_after);
end
$$;

-- FR-INV-03 and FR-INV-05: adjust by a quantity (p_mode 'delta') or to a
-- counted quantity (p_mode 'count', delta computed under the row lock so
-- concurrent movements are never lost). On hand never goes below zero; it
-- may go below reserved (reality wins) and the product is then over-committed.
create function public.adjust_stock(
  p_product_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.adjustment_reason,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.inventory_balances := private.lock_stock(p_product_id, p_quantity);
  v_delta numeric;
  v_movement public.inventory_movements;
begin
  if p_reason is null then
    raise exception 'validation_failed: choose a reason' using errcode = 'invalid_parameter_value';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'validation_failed: note is too long' using errcode = 'invalid_parameter_value';
  end if;
  if p_mode = 'count' then
    if p_quantity < 0 then
      raise exception 'validation_failed: a count cannot be negative' using errcode = 'invalid_parameter_value';
    end if;
    v_delta := p_quantity - v_balance.on_hand;
  elsif p_mode = 'delta' then
    v_delta := p_quantity;
  else
    raise exception 'validation_failed: unknown adjustment mode' using errcode = 'invalid_parameter_value';
  end if;
  if v_delta = 0 then
    raise exception 'validation_failed: the adjustment does not change stock' using errcode = 'invalid_parameter_value';
  end if;
  if v_balance.on_hand + v_delta < 0 then
    raise exception 'validation_failed: on hand cannot go below zero' using errcode = 'invalid_parameter_value';
  end if;
  v_movement := private.record_stock_movement(v_balance.organization_id, v_balance.product_id, v_balance.location_id,
    'adjustment', v_delta, p_reason, null, p_note);
  return jsonb_build_object('ok', true, 'delta', v_delta, 'on_hand', v_movement.on_hand_after,
                            'reserved', v_movement.reserved_after,
                            'over_committed', v_movement.on_hand_after < v_movement.reserved_after);
end
$$;

-- FR-INV-01: stock levels with status. Runs with the caller's rights (RLS).
create view public.stock_levels with (security_invoker = true) as
select p.organization_id,
       p.id as product_id,
       p.sku,
       p.name,
       p.selling_uom,
       p.quantity_decimals,
       p.status as product_status,
       p.reorder_point,
       b.location_id,
       b.on_hand,
       b.reserved,
       b.available,
       case
         when b.available < 0 then 'over_committed'
         when b.available = 0 then 'out_of_stock'
         when p.reorder_point is not null and b.available <= p.reorder_point then 'low'
         else 'in_stock'
       end as stock_status
  from public.products p
  join public.inventory_balances b on b.organization_id = p.organization_id and b.product_id = p.id
 where p.track_inventory;

grant select on public.stock_levels to authenticated;

-- FR-CUST-08: customers whose names closely match (possible duplicates).
create function public.find_similar_customers(p_organization_id uuid, p_name text)
returns table (id uuid, name text, status public.customer_status, similarity real)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.status, extensions.similarity(lower(c.name), lower(p_name))
    from public.customers c
   where c.organization_id = p_organization_id
     and util.has_text(p_name)
     and (extensions.similarity(lower(c.name), lower(p_name)) >= 0.45
          or util.normalize_code(c.name) = util.normalize_code(p_name))
   order by 4 desc
   limit 5
$$;

revoke all on function private.create_product_balance() from public, anon, authenticated;
revoke all on function private.record_stock_movement(uuid, uuid, uuid, public.movement_type, numeric, public.adjustment_reason, text, text) from public, anon, authenticated;
revoke all on function private.lock_stock(uuid, numeric) from public, anon, authenticated;
revoke all on function public.receive_stock(uuid, numeric, text, text) from public, anon;
revoke all on function public.adjust_stock(uuid, text, numeric, public.adjustment_reason, text) from public, anon;
revoke all on function public.find_similar_customers(uuid, text) from public, anon;
grant execute on function public.receive_stock(uuid, numeric, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, text, numeric, public.adjustment_reason, text) to authenticated;
grant execute on function public.find_similar_customers(uuid, text) to authenticated;
