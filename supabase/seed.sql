-- OrderPilot local seed data. FICTIONAL DEMONSTRATION DATA ONLY.
-- Northstar Distribution and Bayview Supply Co. are invented; any resemblance
-- to a real organisation is coincidental. Emails use the reserved .example domain.
--
-- Two workspaces exist so that Phase 2B can prove tenant isolation.
-- Users, members and invitations are seeded in Phase 2B/2C, when auth exists.
-- Fixed UUIDs keep tests deterministic: 0000…-a… = Northstar, 0000…-b… = Bayview.

-- Workspaces ------------------------------------------------------------------
insert into public.organizations
  (id, name, legal_name, slug, country_code, base_currency, timezone, locale, sales_order_prefix, is_demo)
values
  ('00000000-0000-4000-a000-000000000001', 'Northstar Distribution', 'Northstar Distribution LLC (fictional)', 'northstar', 'US', 'USD', 'America/New_York', 'en-US', 'SO', true),
  ('00000000-0000-4000-b000-000000000001', 'Bayview Supply Co.', 'Bayview Supply Co. Ltd (fictional)', 'bayview', 'GB', 'GBP', 'Europe/London', 'en-GB', 'BV', true);

insert into public.document_sequences (organization_id, sequence_name, period, next_value) values
  ('00000000-0000-4000-a000-000000000001', 'inbound_order', 0, 1047),
  ('00000000-0000-4000-a000-000000000001', 'sales_order', 2026, 413),
  ('00000000-0000-4000-b000-000000000001', 'inbound_order', 0, 1),
  ('00000000-0000-4000-b000-000000000001', 'sales_order', 2026, 1);

-- Locations (D-11: one default each) ------------------------------------------
insert into public.locations (id, organization_id, code, name, is_default) values
  ('00000000-0000-4000-a100-000000000001', '00000000-0000-4000-a000-000000000001', 'CMH-1', 'Columbus warehouse', true),
  ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-b000-000000000001', 'BRS-1', 'Bristol depot', true);

-- Customers -------------------------------------------------------------------
insert into public.customers
  (id, organization_id, account_number, name, status, hold_reason, email, payment_terms, date_order_hint)
values
  ('00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a000-000000000001', 'C-1042', 'Harbor & Pine Supply', 'active', null, 'orders@harborpine.example', 'Net 30', 'unknown'),
  ('00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a000-000000000001', 'C-1007', 'Northgate Facilities', 'active', null, 'purchasing@northgate.example', 'Net 30', 'mdy'),
  ('00000000-0000-4000-a200-000000000003', '00000000-0000-4000-a000-000000000001', 'C-1055', 'Kestrel Medical Centers', 'on_hold', 'Overdue invoices', 'supplychain@kestrel.example', 'Net 30', 'mdy'),
  ('00000000-0000-4000-a200-000000000004', '00000000-0000-4000-a000-000000000001', 'C-1102', 'Granite Peak Fitness', 'inactive', null, 'admin@granitepeak.example', 'Prepaid', 'mdy'),
  ('00000000-0000-4000-b200-000000000001', '00000000-0000-4000-b000-000000000001', 'BV-200', 'Severn Hospitality Group', 'active', null, 'buying@severn.example', '30 days end of month', 'dmy'),
  ('00000000-0000-4000-b200-000000000002', '00000000-0000-4000-b000-000000000001', 'BV-201', 'Clifton Cafés', 'active', null, 'orders@cliftoncafes.example', '14 days', 'dmy');

insert into public.customer_addresses
  (id, organization_id, customer_id, type, label, line1, city, region, postal_code, country_code, is_default)
values
  ('00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', 'billing', 'Head office', '410 Riverside Dr W', 'Windsor', 'ON', 'N9A 5K3', 'CA', true),
  ('00000000-0000-4000-a300-000000000002', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', 'shipping', 'Distribution centre', '2250 Walker Rd, Dock 4', 'Windsor', 'ON', 'N8W 3P6', 'CA', true),
  ('00000000-0000-4000-a300-000000000003', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000002', 'shipping', 'Facilities depot', '77 Industrial Ct', 'Dayton', 'OH', '45414', 'US', true),
  ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b200-000000000001', 'shipping', 'Central kitchen', '12 Harbourside Way', 'Bristol', null, 'BS1 5AA', 'GB', true);

-- Products --------------------------------------------------------------------
insert into public.products
  (id, organization_id, sku, name, selling_uom, quantity_decimals, list_price, status, track_inventory, reorder_point)
values
  ('00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a000-000000000001', 'JAN-1001', 'Nitrile exam gloves, medium, box of 100', 'BX', 0, 8.9500, 'active', true, 150),
  ('00000000-0000-4000-a400-000000000002', '00000000-0000-4000-a000-000000000001', 'JAN-2207', 'Multifold paper towels, 16 packs per case', 'CS', 0, 44.2000, 'active', true, 60),
  ('00000000-0000-4000-a400-000000000003', '00000000-0000-4000-a000-000000000001', 'JAN-4402', 'Trash liners, 40–45 gal, 250 per case', 'CS', 0, 38.5000, 'active', true, 40),
  ('00000000-0000-4000-a400-000000000004', '00000000-0000-4000-a000-000000000001', 'FS-6300', 'Deli paper, interfolded, by weight', 'KG', 1, 6.2000, 'active', true, 50),
  ('00000000-0000-4000-a400-000000000005', '00000000-0000-4000-a000-000000000001', 'FS-7002', 'Disposable poly aprons, pack of 100', 'PK', 0, 12.9000, 'active', false, null),
  ('00000000-0000-4000-a400-000000000006', '00000000-0000-4000-a000-000000000001', 'FS-5320', 'Wooden stir sticks, 7 in, box of 1,000', 'BX', 0, 5.1000, 'discontinued', true, null),
  -- Bayview reuses the SKU JAN-1001 on purpose: SKUs are unique per workspace, not globally.
  ('00000000-0000-4000-b400-000000000001', '00000000-0000-4000-b000-000000000001', 'JAN-1001', 'Vinyl gloves, large, box of 100', 'BX', 0, 4.2000, 'active', true, 100),
  ('00000000-0000-4000-b400-000000000002', '00000000-0000-4000-b000-000000000001', 'CUP-12', 'Compostable cups, 12 oz, case of 1,000', 'CS', 0, 58.0000, 'active', true, 20);

-- Stock balances (tracked products only, default location) --------------------
insert into public.inventory_balances (organization_id, product_id, location_id, on_hand, reserved) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a100-000000000001', 640, 0),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000002', '00000000-0000-4000-a100-000000000001', 210, 0),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000003', '00000000-0000-4000-a100-000000000001', 48, 0),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000004', '00000000-0000-4000-a100-000000000001', 142.5, 0),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a400-000000000006', '00000000-0000-4000-a100-000000000001', 12, 0),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b400-000000000001', '00000000-0000-4000-b100-000000000001', 300, 0),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b400-000000000002', '00000000-0000-4000-b100-000000000001', 25, 0)
-- Tracked products already have an empty balance (created with the product).
on conflict (organization_id, product_id, location_id) do update set on_hand = excluded.on_hand;

-- Every balance is explained by the ledger (invariant I-2): opening balances.
insert into public.inventory_movements
  (organization_id, product_id, location_id, movement_type, adjustment_reason,
   on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference)
select organization_id, product_id, location_id, 'adjustment'::public.movement_type, 'opening_balance'::public.adjustment_reason,
       on_hand, 0, on_hand, 0, 'Opening balance (fictional seed)'
from public.inventory_balances
where on_hand <> 0;

-- Customer part numbers and prices -------------------------------------------
insert into public.customer_item_aliases
  (organization_id, customer_id, product_id, customer_part_number, customer_description)
values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000001', 'HP-221', 'Nitrile gloves medium 100ct'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000002', 'HP-510', 'Multifold towel 16pk');

insert into public.customer_prices (organization_id, customer_id, product_id, unit_price, valid_from, valid_to) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a400-000000000002', 43.1000, '2026-09-01', null),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b200-000000000001', '00000000-0000-4000-b400-000000000002', 55.5000, '2026-01-01', '2026-12-31');

-- Users and memberships (Phase 2B): one fictional user per role in each
-- workspace, for isolation and permission tests. No passwords are set; sign-in
-- arrives in Phase 2C. IDs: …a5…0N (Northstar) and …b5…0N (Bayview), N = role order.
with people (id, org, role, full_name, email) as (
  values
    ('00000000-0000-4000-a500-000000000001'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, 'owner', 'Sofia Brandt', 'sofia.brandt@northstar.example'),
    ('00000000-0000-4000-a500-000000000002', '00000000-0000-4000-a000-000000000001', 'admin', 'Alex Moreno', 'alex.moreno@northstar.example'),
    ('00000000-0000-4000-a500-000000000003', '00000000-0000-4000-a000-000000000001', 'approver', 'Priya Raman', 'priya.raman@northstar.example'),
    ('00000000-0000-4000-a500-000000000004', '00000000-0000-4000-a000-000000000001', 'processor', 'Jordan Ellis', 'jordan.ellis@northstar.example'),
    ('00000000-0000-4000-a500-000000000005', '00000000-0000-4000-a000-000000000001', 'inventory_manager', 'Marc Dubois', 'marc.dubois@northstar.example'),
    ('00000000-0000-4000-a500-000000000006', '00000000-0000-4000-a000-000000000001', 'viewer', 'Sam Patel', 'sam.patel@northstar.example'),
    ('00000000-0000-4000-b500-000000000001', '00000000-0000-4000-b000-000000000001', 'owner', 'Imogen Hale', 'imogen.hale@bayview.example'),
    ('00000000-0000-4000-b500-000000000002', '00000000-0000-4000-b000-000000000001', 'admin', 'Rhys Okafor', 'rhys.okafor@bayview.example'),
    ('00000000-0000-4000-b500-000000000003', '00000000-0000-4000-b000-000000000001', 'approver', 'Freya Lund', 'freya.lund@bayview.example'),
    ('00000000-0000-4000-b500-000000000004', '00000000-0000-4000-b000-000000000001', 'processor', 'Owen Pryce', 'owen.pryce@bayview.example'),
    ('00000000-0000-4000-b500-000000000005', '00000000-0000-4000-b000-000000000001', 'inventory_manager', 'Tariq Begum', 'tariq.begum@bayview.example'),
    ('00000000-0000-4000-b500-000000000006', '00000000-0000-4000-b000-000000000001', 'viewer', 'Ellie Marsh', 'ellie.marsh@bayview.example')
), users as (
  -- Auth reads these token columns as strings, so they must be '' (not null).
  -- No password is set here: run "corepack pnpm db:provision" locally.
  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, created_at, updated_at
  )
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, now(),
         '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('full_name', full_name),
         '', '', '', '', '', '', '', '', now(), now()
    from people
  returning id, email
), identities as (
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now()
    from users u
  returning user_id
)
-- Profiles are created by the auth.users trigger (Phase 2C).
insert into public.organization_members (organization_id, user_id, role)
select p.org, p.id, p.role::public.member_role from people p join users u on u.id = p.id;
