-- OrderPilot Phase 2A · Migration 6: sales orders and the integration outbox.
-- docs/DATABASE_ARCHITECTURE.md §6.5, §6.7, §9 and §12.
--
-- Not in this migration:
--   * approve/cancel/fulfil functions, duplicate conflict re-check and the
--     per-PO-number advisory lock used during approval        → Phase 2D
--   * "mark backorder handled externally" function (FR-SO-08)  → Phase 5
--   * append-only protection for sales order lines and outbox  → Phase 2B

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  order_number text not null check (order_number ~ '^[A-Z0-9]{1,6}-[0-9]{4}-[0-9]{6,}$'),
  inbound_order_id uuid not null,
  customer_id uuid not null,
  customer_po_number text check (customer_po_number is null or length(btrim(customer_po_number)) between 1 and 64),
  customer_po_number_normalized text generated always as (util.normalize_po_number(customer_po_number)) stored,
  -- Duplicate safety (§12.1): an authorised duplicate points at the overridden
  -- DUPLICATE_PO_NUMBER exception of its own intake. NULL for every normal order.
  duplicate_override_exception_id uuid,
  duplicate_override boolean generated always as (duplicate_override_exception_id is not null) stored,
  -- NULL for normal orders (so the foreign key below is skipped); TRUE for an
  -- authorised duplicate, which makes the foreign key require an exception
  -- whose authorizes_duplicate flag is TRUE.
  duplicate_override_marker boolean generated always as (
    case when duplicate_override_exception_id is null then null else true end
  ) stored,
  po_date date,
  requested_delivery_date date,
  currency char(3) not null references public.currencies (code),
  -- Snapshots: later customer edits do not change history.
  bill_to jsonb check (bill_to is null or jsonb_typeof(bill_to) = 'object'),
  ship_to jsonb not null check (jsonb_typeof(ship_to) = 'object'),
  payment_terms text check (payment_terms is null or length(payment_terms) <= 200),
  notes text check (notes is null or length(notes) <= 4000),
  subtotal numeric(19, 4) not null check (subtotal >= 0),
  status public.sales_order_status not null default 'confirmed',
  approved_by uuid not null references public.profiles (id),
  approved_at timestamptz not null,
  fulfilled_by uuid references public.profiles (id),
  fulfilled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 2000),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  -- Lets the intake's sales_order_id point back at exactly this pair.
  unique (organization_id, id, inbound_order_id),
  unique (organization_id, order_number),
  -- At most one sales order per intake (PR-06).
  unique (inbound_order_id),
  foreign key (organization_id, inbound_order_id) references public.inbound_orders (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  -- The override must be an overridden DUPLICATE_PO_NUMBER exception of this
  -- same intake. While an order references it, the override cannot be re-opened.
  foreign key (organization_id, inbound_order_id, duplicate_override_exception_id, duplicate_override_marker)
    references public.order_exceptions (organization_id, inbound_order_id, id, authorizes_duplicate),
  check ((status = 'fulfilled') = (fulfilled_by is not null and fulfilled_at is not null)),
  check ((status = 'cancelled') = (cancelled_by is not null and cancelled_at is not null and util.has_text(cancel_reason))),
  -- An override only makes sense for an order that has a PO number.
  check (duplicate_override_exception_id is null or customer_po_number_normalized is not null)
);

comment on column public.sales_orders.duplicate_override_exception_id is
  'Duplicate safety (DATABASE_ARCHITECTURE.md §12.1): set only for an authorised duplicate, pointing at the overridden exception that records who approved it, why, and which conflicts they reviewed.';

-- Backstop against accidental duplicates (§12, layer 5): among orders that are
-- not cancelled and not authorised duplicates, a customer PO number appears at
-- most once per customer (Q-1). Concurrent approvals of the same PO number hit
-- this index, so one of them always fails. Cancelled orders free the number (Q-2).
create unique index sales_orders_po_number_unique_idx
  on public.sales_orders (organization_id, customer_id, customer_po_number_normalized)
  where status <> 'cancelled'
    and duplicate_override_exception_id is null
    and customer_po_number_normalized is not null;

create index sales_orders_list_idx on public.sales_orders (organization_id, status, approved_at desc);
create index sales_orders_customer_idx on public.sales_orders (organization_id, customer_id);
create index sales_orders_po_lookup_idx
  on public.sales_orders (organization_id, customer_id, customer_po_number_normalized);
create index sales_orders_override_idx
  on public.sales_orders (organization_id, inbound_order_id, duplicate_override_exception_id, duplicate_override_marker);
create index sales_orders_currency_idx on public.sales_orders (currency);
create index sales_orders_approved_by_idx on public.sales_orders (approved_by);
create index sales_orders_fulfilled_by_idx on public.sales_orders (fulfilled_by);
create index sales_orders_cancelled_by_idx on public.sales_orders (cancelled_by);

-- The intake and its sales order point at each other consistently.
alter table public.inbound_orders
  add foreign key (organization_id, sales_order_id, id)
  references public.sales_orders (organization_id, id, inbound_order_id);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sales_order_id uuid not null,
  line_no integer not null check (line_no >= 1),
  product_id uuid not null,
  -- Snapshots at approval.
  sku text not null check (length(sku) between 1 and 64),
  product_name text not null check (length(btrim(product_name)) between 1 and 200),
  customer_part_number text check (customer_part_number is null or length(customer_part_number) <= 64),
  description_as_ordered text check (description_as_ordered is null or length(description_as_ordered) <= 1000),
  quantity numeric(14, 3) not null check (quantity > 0),
  uom text not null references public.uom_codes (code),
  unit_price numeric(19, 4) not null check (unit_price >= 0),
  -- Q-5: four-decimal unit prices; the line total is rounded to the currency's
  -- minor unit, half away from zero (Postgres round(numeric, n)).
  currency_minor_unit smallint not null check (currency_minor_unit between 0 and 4),
  line_total numeric(19, 4) not null,
  price_source public.price_source not null,
  match_method public.match_method not null,
  -- D-10 / D-35: allocated (reserved) and backordered (never reserved) are recorded separately.
  allocated_qty numeric(14, 3) not null check (allocated_qty >= 0),
  backordered_qty numeric(14, 3) not null check (backordered_qty >= 0),
  source_inbound_order_line_id uuid not null,
  -- FR-SO-08 (Phase 5): backorder handled outside OrderPilot. Never changes inventory.
  backorder_handled_at timestamptz,
  backorder_handled_by uuid references public.profiles (id),
  backorder_handled_reason text check (backorder_handled_reason is null or length(backorder_handled_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sales_order_id, id),
  unique (sales_order_id, line_no),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, source_inbound_order_line_id) references public.inbound_order_lines (organization_id, id),
  check (quantity = allocated_qty + backordered_qty),
  check (line_total = round(quantity * unit_price, currency_minor_unit)),
  -- The "handled externally" record is all-or-nothing, needs a reason, and
  -- only exists for lines that actually have a backorder.
  check (
    (backorder_handled_at is null and backorder_handled_by is null and backorder_handled_reason is null)
    or (backorder_handled_at is not null and backorder_handled_by is not null and util.has_text(backorder_handled_reason))
  ),
  check (backorder_handled_at is null or backordered_qty > 0)
);

create index sales_order_lines_product_idx on public.sales_order_lines (organization_id, product_id);
create index sales_order_lines_source_idx on public.sales_order_lines (organization_id, source_inbound_order_line_id);
create index sales_order_lines_uom_idx on public.sales_order_lines (uom);
create index sales_order_lines_open_backorders_idx
  on public.sales_order_lines (organization_id, sales_order_id)
  where backordered_qty > 0 and backorder_handled_at is null;
create index sales_order_lines_handled_by_idx on public.sales_order_lines (backorder_handled_by);

-- Reservation, release and issue movements belong to a line of that sales order.
alter table public.inventory_movements
  add foreign key (organization_id, sales_order_id, sales_order_line_id)
  references public.sales_order_lines (organization_id, sales_order_id, id);

-- Integration events, written in the same transaction as the business change
-- (PR-11). No consumer exists in the MVP.
create table public.integration_outbox (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  event_type text not null check (event_type in ('sales_order.confirmed', 'sales_order.cancelled', 'sales_order.fulfilled')),
  aggregate_type text not null check (aggregate_type = 'sales_order'),
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  schema_version text not null default 'v1' check (schema_version ~ '^v[0-9]+$'),
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 1000),
  foreign key (organization_id, aggregate_id) references public.sales_orders (organization_id, id)
);

create index integration_outbox_pending_idx on public.integration_outbox (available_at) where processed_at is null;
create index integration_outbox_aggregate_idx on public.integration_outbox (organization_id, aggregate_id);

create trigger sales_orders_set_updated_at before update on public.sales_orders
  for each row execute function private.set_updated_at();
create trigger sales_order_lines_set_updated_at before update on public.sales_order_lines
  for each row execute function private.set_updated_at();
