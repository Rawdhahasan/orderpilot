-- OrderPilot Phase 2A · Migration 4: inventory.
-- docs/DATABASE_ARCHITECTURE.md §6.3 and §10.
--
-- Balances change only through inventory functions that also write a movement
-- (Phase 2D). This migration enforces the shape of every row.
--
-- Not in this migration:
--   * append-only trigger on inventory_movements (no update/delete) → Phase 2B
--   * receive/adjust/reserve/release/issue functions and invariants → Phase 2D

-- D-11: several locations in the data model; one default per workspace.
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null check (code ~ '^[A-Z0-9-]{1,20}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  unique (organization_id, code)
);

create unique index locations_one_default_idx on public.locations (organization_id) where is_default;
create index locations_created_by_idx on public.locations (created_by);
create index locations_updated_by_idx on public.locations (updated_by);

-- D-09: available = on hand − reserved. On hand and reserved are never negative;
-- available may be negative when a count leaves stock over-committed (FR-INV-05).
create table public.inventory_balances (
  organization_id uuid not null,
  product_id uuid not null,
  location_id uuid not null,
  on_hand numeric(14, 3) not null default 0 check (on_hand >= 0),
  reserved numeric(14, 3) not null default 0 check (reserved >= 0),
  available numeric(15, 3) generated always as (on_hand - reserved) stored,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (organization_id, product_id, location_id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id)
);

create index inventory_balances_location_idx on public.inventory_balances (organization_id, location_id);

-- Append-only ledger: every stock change, with the balance after it.
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  product_id uuid not null,
  location_id uuid not null,
  movement_type public.movement_type not null,
  adjustment_reason public.adjustment_reason,
  on_hand_delta numeric(14, 3) not null,
  reserved_delta numeric(14, 3) not null,
  on_hand_after numeric(14, 3) not null check (on_hand_after >= 0),
  reserved_after numeric(14, 3) not null check (reserved_after >= 0),
  -- Reservation, release and issue movements belong to a sales order line;
  -- the foreign key is added with the sales tables.
  sales_order_id uuid,
  sales_order_line_id uuid,
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 1000),
  actor_user_id uuid references public.profiles (id),
  occurred_at timestamptz not null default now(),
  request_id uuid,
  foreign key (organization_id, product_id, location_id)
    references public.inventory_balances (organization_id, product_id, location_id),
  check ((sales_order_id is null) = (sales_order_line_id is null)),
  -- Allowed shape for each movement type (DATABASE_ARCHITECTURE.md §6.3).
  constraint inventory_movements_shape check (
    case movement_type
      when 'receipt' then
        on_hand_delta > 0 and reserved_delta = 0 and sales_order_line_id is null and adjustment_reason is null
      when 'adjustment' then
        on_hand_delta <> 0 and reserved_delta = 0 and sales_order_line_id is null and adjustment_reason is not null
      when 'reservation' then
        on_hand_delta = 0 and reserved_delta > 0 and sales_order_line_id is not null and adjustment_reason is null
      when 'reservation_release' then
        on_hand_delta = 0 and reserved_delta < 0 and sales_order_line_id is not null and adjustment_reason is null
      when 'issue' then
        on_hand_delta < 0 and reserved_delta = on_hand_delta and sales_order_line_id is not null and adjustment_reason is null
    end
  )
);

create index inventory_movements_product_idx
  on public.inventory_movements (organization_id, product_id, location_id, occurred_at desc);
create index inventory_movements_line_idx
  on public.inventory_movements (organization_id, sales_order_id, sales_order_line_id);
create index inventory_movements_actor_idx on public.inventory_movements (actor_user_id);

create trigger locations_set_updated_at before update on public.locations
  for each row execute function private.set_updated_at();
create trigger inventory_balances_set_updated_at before update on public.inventory_balances
  for each row execute function private.set_updated_at();
