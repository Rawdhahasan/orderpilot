-- OrderPilot Phase 2B · Migration 10: access helpers, RLS policies, grants.
-- docs/DATABASE_ARCHITECTURE.md §7 (access matrix §7.4) and
-- PRODUCT_REQUIREMENTS.md §8 (roles and permissions).
--
-- Every signed-in user reaches Postgres as the `authenticated` role, so
-- workspace roles are enforced by policies and functions that look up the
-- caller's membership, never by Postgres roles (C-03).

-- ---------------------------------------------------------------------------
-- Permission map: the database copy of PRODUCT_REQUIREMENTS.md §8. The same
-- matrix drives src/domain/auth/permissions.ts; both are tested against the
-- documented table (tests 007 and tests/unit/permissions.test.ts).
-- ---------------------------------------------------------------------------
create function private.permission_roles(p_permission text)
returns public.member_role[]
language sql
immutable
set search_path = ''
as $$
  select case p_permission
    when 'records.view'          then '{owner,admin,approver,processor,inventory_manager,viewer}'
    when 'timeline.view'         then '{owner,admin,approver,processor,inventory_manager,viewer}'
    when 'intake.upload'         then '{owner,admin,approver,processor}'
    when 'intake.review'         then '{owner,admin,approver,processor}'
    when 'intake.submit'         then '{owner,admin,approver,processor}'
    when 'intake.withdraw_any'   then '{owner,admin,approver}'
    when 'intake.withdraw_own'   then '{owner,admin,approver,processor}'
    when 'intake.cancel'         then '{owner,admin,approver,processor}'
    when 'intake.approve'        then '{owner,admin,approver}'
    when 'exception.override'    then '{owner,admin,approver}'
    when 'sales_order.cancel'    then '{owner,admin,approver}'
    when 'sales_order.fulfil'    then '{owner,admin,approver,inventory_manager}'
    when 'customer.edit'         then '{owner,admin,approver,processor}'
    when 'customer.hold'         then '{owner,admin,approver}'
    when 'customer.deactivate'   then '{owner,admin}'
    when 'customer_alias.manage' then '{owner,admin,approver,processor}'
    when 'product.edit'          then '{owner,admin,inventory_manager}'
    when 'price.change'          then '{owner,admin}'
    when 'stock.change'          then '{owner,admin,inventory_manager}'
    when 'import.run'            then '{owner,admin}'
    when 'audit.view'            then '{owner,admin,approver}'
    when 'audit.export'          then '{owner,admin}'
    when 'member.manage'         then '{owner,admin}'
    when 'owner.grant'           then '{owner}'
    when 'settings.change'       then '{owner,admin}'
  end::public.member_role[]
$$;

-- Workspaces where the caller is an active member of an active workspace.
-- SECURITY DEFINER so policies can read memberships without recursion.
create function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and o.status = 'active'
$$;

-- Workspaces where the caller holds a role that grants the permission.
create function private.user_org_ids_with(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and o.status = 'active'
     and m.role = any (private.permission_roles(p_permission))
$$;

create function private.has_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.user_org_ids_with(p_permission) o where o = p_organization_id)
$$;

create function private.is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.user_org_ids() o where o = p_organization_id)
$$;

-- Error conventions (DATABASE_ARCHITECTURE.md §7.5):
--   not_found              P0002  record outside the caller's workspaces (existence not revealed)
--   insufficient_privilege 42501  member without the required role
--   mfa_required           42501  privileged action without MFA (AAL2)
--   validation_failed      22023  invalid input
--   invalid_state          55000  action not allowed in the current state
create function private.assert_permission(p_organization_id uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if not private.has_permission(p_organization_id, p_permission) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;
end
$$;

-- Owners and Admins must reach MFA level AAL2 for privileged actions (D-24 proposal; FR-AUTH-04).
create function private.assert_aal2()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = 'insufficient_privilege';
  end if;
end
$$;

-- Policies run as the caller, so authenticated users need these helpers. The
-- private schema is not exposed through the Data API, so they are not
-- callable over HTTP.
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.user_org_ids_with(text) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.permission_roles(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then grant exactly what the access matrix allows.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from authenticated, anon, public;

-- Read access (rows still filtered by RLS).
grant select on
  public.currencies, public.uom_codes, public.profiles, public.organizations,
  public.organization_members, public.organization_invitations, public.customers,
  public.customer_addresses, public.products, public.customer_item_aliases,
  public.customer_prices, public.locations, public.inventory_balances,
  public.inventory_movements, public.source_documents, public.inbound_orders,
  public.inbound_order_lines, public.extraction_runs, public.order_exceptions,
  public.sales_orders, public.sales_order_lines, public.audit_events
to authenticated;

-- Direct writes allowed by the access matrix (§7.4). Status, price, tracking,
-- settings, actor and version columns are excluded: they change only through
-- role-checked functions or triggers.
grant update (full_name) on public.profiles to authenticated;

grant insert (organization_id, account_number, name, email, phone, payment_terms, date_order_hint, notes)
  on public.customers to authenticated;
grant update (account_number, name, email, phone, payment_terms, date_order_hint, notes)
  on public.customers to authenticated;

grant insert (organization_id, customer_id, type, label, line1, line2, line3, city, region, postal_code, country_code, is_default, status)
  on public.customer_addresses to authenticated;
grant update (type, label, line1, line2, line3, city, region, postal_code, country_code, is_default, status)
  on public.customer_addresses to authenticated;

-- The initial list price and tracking flag are set at creation (M-08); later
-- changes go through set_product_price and set_product_tracking.
grant insert (organization_id, sku, name, description, selling_uom, quantity_decimals, list_price, gtin, status, track_inventory, reorder_point)
  on public.products to authenticated;
grant update (sku, name, description, selling_uom, quantity_decimals, gtin, status, reorder_point)
  on public.products to authenticated;

grant insert (organization_id, customer_id, product_id, customer_part_number, customer_description, status)
  on public.customer_item_aliases to authenticated;
grant update (product_id, customer_part_number, customer_description, status)
  on public.customer_item_aliases to authenticated;

grant insert (organization_id, customer_id, product_id, unit_price, valid_from, valid_to), delete
  on public.customer_prices to authenticated;
grant update (unit_price, valid_from, valid_to)
  on public.customer_prices to authenticated;

grant insert (organization_id, code, name, is_default) on public.locations to authenticated;
grant update (code, name, is_default) on public.locations to authenticated;

-- ---------------------------------------------------------------------------
-- Policies. Helpers are wrapped in sub-selects so Postgres evaluates them once
-- per statement (§7.3).
-- ---------------------------------------------------------------------------

-- Global reference data: readable by every signed-in user.
create policy currencies_select on public.currencies for select to authenticated using (true);
create policy uom_codes_select on public.uom_codes for select to authenticated using (true);

-- Profiles: yourself and people who share a workspace with you.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.organization_members m
       where m.organization_id in (select private.user_org_ids())
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select private.user_org_ids()));

create policy organization_members_select on public.organization_members for select to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy organization_invitations_select on public.organization_invitations for select to authenticated
  using (organization_id in (select private.user_org_ids_with('member.manage')));

-- Master data: members read; listed roles write.
create policy customers_select on public.customers for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy customers_insert on public.customers for insert to authenticated
  with check (organization_id in (select private.user_org_ids_with('customer.edit')));
create policy customers_update on public.customers for update to authenticated
  using (organization_id in (select private.user_org_ids_with('customer.edit')))
  with check (organization_id in (select private.user_org_ids_with('customer.edit')));

create policy customer_addresses_select on public.customer_addresses for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy customer_addresses_insert on public.customer_addresses for insert to authenticated
  with check (organization_id in (select private.user_org_ids_with('customer.edit')));
create policy customer_addresses_update on public.customer_addresses for update to authenticated
  using (organization_id in (select private.user_org_ids_with('customer.edit')))
  with check (organization_id in (select private.user_org_ids_with('customer.edit')));

create policy products_select on public.products for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy products_insert on public.products for insert to authenticated
  with check (organization_id in (select private.user_org_ids_with('product.edit')));
create policy products_update on public.products for update to authenticated
  using (organization_id in (select private.user_org_ids_with('product.edit')))
  with check (organization_id in (select private.user_org_ids_with('product.edit')));

create policy customer_item_aliases_select on public.customer_item_aliases for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy customer_item_aliases_insert on public.customer_item_aliases for insert to authenticated
  with check (organization_id in (select private.user_org_ids_with('customer_alias.manage')));
create policy customer_item_aliases_update on public.customer_item_aliases for update to authenticated
  using (organization_id in (select private.user_org_ids_with('customer_alias.manage')))
  with check (organization_id in (select private.user_org_ids_with('customer_alias.manage')));

create policy customer_prices_select on public.customer_prices for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy customer_prices_insert on public.customer_prices for insert to authenticated
  with check (organization_id in (select private.user_org_ids_with('price.change')));
create policy customer_prices_update on public.customer_prices for update to authenticated
  using (organization_id in (select private.user_org_ids_with('price.change')))
  with check (organization_id in (select private.user_org_ids_with('price.change')));
create policy customer_prices_delete on public.customer_prices for delete to authenticated
  using (organization_id in (select private.user_org_ids_with('price.change')));

create policy locations_select on public.locations for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy locations_insert on public.locations for insert to authenticated
  with check (organization_id in (select private.user_org_ids_with('settings.change')));
create policy locations_update on public.locations for update to authenticated
  using (organization_id in (select private.user_org_ids_with('settings.change')))
  with check (organization_id in (select private.user_org_ids_with('settings.change')));

-- Read-only to members: every change goes through workflow functions.
create policy inventory_balances_select on public.inventory_balances for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy source_documents_select on public.source_documents for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy inbound_orders_select on public.inbound_orders for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy inbound_order_lines_select on public.inbound_order_lines for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy extraction_runs_select on public.extraction_runs for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy order_exceptions_select on public.order_exceptions for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy sales_orders_select on public.sales_orders for select to authenticated
  using (organization_id in (select private.user_org_ids()));
create policy sales_order_lines_select on public.sales_order_lines for select to authenticated
  using (organization_id in (select private.user_org_ids()));

-- Workspace audit log: Owners, Admins and Approvers (FR-AUD-04). Entity
-- timelines for other roles are served by a function in Phase 5.
create policy audit_events_select on public.audit_events for select to authenticated
  using (organization_id in (select private.user_org_ids_with('audit.view')));

-- document_sequences and integration_outbox have no policies: no API access.
