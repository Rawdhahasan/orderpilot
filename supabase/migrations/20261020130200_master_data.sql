-- OrderPilot Phase 2A · Migration 3: master data.
-- docs/DATABASE_ARCHITECTURE.md §6.2.
--
-- Tenant rule: every row carries organization_id, and child rows reference
-- their parent through (organization_id, id), so a row can never point at a
-- record in another workspace.
--
-- Not in this migration:
--   * set_customer_status, set_product_price, set_product_tracking (C-03)  → Phase 2B
--   * inventory balance creation when a tracked product is created (M-01) → Phase 2D

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  account_number text check (account_number is null or length(btrim(account_number)) between 1 and 40),
  account_number_normalized text generated always as (util.normalize_code(account_number)) stored,
  name text not null check (length(btrim(name)) between 1 and 200),
  status public.customer_status not null default 'active',
  hold_reason text,
  hold_set_by uuid references public.profiles (id),
  hold_set_at timestamptz,
  email extensions.citext check (email is null or length(email) <= 320),
  phone text check (phone is null or length(phone) <= 40),
  payment_terms text check (payment_terms is null or length(payment_terms) <= 200),
  -- Used for DATE_AMBIGUOUS hints; defaults from the billing country.
  date_order_hint text not null default 'unknown' check (date_order_hint in ('dmy', 'mdy', 'ymd', 'unknown')),
  notes text check (notes is null or length(notes) <= 4000),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  -- A hold always has a reason; no other status keeps one.
  check ((status = 'on_hold') = util.has_text(hold_reason)),
  check (hold_reason is null or util.has_text(hold_reason))
);

create unique index customers_account_number_idx
  on public.customers (organization_id, account_number_normalized)
  where account_number_normalized is not null;
create index customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);
create index customers_status_idx on public.customers (organization_id, status);
create index customers_hold_set_by_idx on public.customers (hold_set_by);
create index customers_created_by_idx on public.customers (created_by);
create index customers_updated_by_idx on public.customers (updated_by);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  type public.address_type not null,
  label text check (label is null or length(btrim(label)) between 1 and 80),
  line1 text not null check (length(btrim(line1)) between 1 and 200),
  line2 text check (line2 is null or length(line2) <= 200),
  line3 text check (line3 is null or length(line3) <= 200),
  city text check (city is null or length(city) <= 120),
  region text check (region is null or length(region) <= 120),
  postal_code text check (postal_code is null or length(postal_code) <= 20),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  match_key text generated always as (util.address_match_key(line1, postal_code)) stored,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  -- Lets intakes require that a selected address belongs to the confirmed customer.
  unique (organization_id, customer_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  check (not (is_default and status = 'archived'))
);

create unique index customer_addresses_one_default_idx
  on public.customer_addresses (customer_id, type)
  where is_default;
create index customer_addresses_match_idx on public.customer_addresses (organization_id, customer_id, match_key);
create index customer_addresses_created_by_idx on public.customer_addresses (created_by);
create index customer_addresses_updated_by_idx on public.customer_addresses (updated_by);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  sku text not null check (length(sku) between 1 and 64 and sku = btrim(sku)),
  sku_normalized text generated always as (util.normalize_code(sku)) stored,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 4000),
  selling_uom text not null references public.uom_codes (code),
  quantity_decimals smallint not null default 0 check (quantity_decimals between 0 and 3),
  list_price numeric(19, 4) not null check (list_price >= 0),
  gtin text check (gtin is null or util.gtin_is_valid(gtin)),
  status public.product_status not null default 'active',
  track_inventory boolean not null default true,
  reorder_point numeric(14, 3) check (reorder_point is null or reorder_point >= 0),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  check (reorder_point is null or reorder_point = round(reorder_point, quantity_decimals))
);

-- SKUs are unique per workspace regardless of case.
create unique index products_sku_idx on public.products (organization_id, lower(sku));
create unique index products_gtin_idx on public.products (organization_id, gtin) where gtin is not null;
create index products_sku_normalized_idx on public.products (organization_id, sku_normalized);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_selling_uom_idx on public.products (selling_uom);
create index products_created_by_idx on public.products (created_by);
create index products_updated_by_idx on public.products (updated_by);

create table public.customer_item_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  product_id uuid not null,
  customer_part_number text not null check (length(btrim(customer_part_number)) between 1 and 64),
  customer_part_number_normalized text generated always as (util.normalize_code(customer_part_number)) stored,
  customer_description text check (customer_description is null or length(customer_description) <= 400),
  -- Where the alias was learned; the foreign key is added with the intake tables.
  source_inbound_order_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  check (customer_part_number_normalized is not null)
);

create unique index customer_item_aliases_active_idx
  on public.customer_item_aliases (organization_id, customer_id, customer_part_number_normalized)
  where status = 'active';
create index customer_item_aliases_customer_idx on public.customer_item_aliases (organization_id, customer_id);
create index customer_item_aliases_product_idx on public.customer_item_aliases (organization_id, product_id);
create index customer_item_aliases_source_idx on public.customer_item_aliases (organization_id, source_inbound_order_id);
create index customer_item_aliases_created_by_idx on public.customer_item_aliases (created_by);
create index customer_item_aliases_updated_by_idx on public.customer_item_aliases (updated_by);

-- Customer-specific prices (D-14, D-32). Validity ranges never overlap.
create table public.customer_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  product_id uuid not null,
  unit_price numeric(19, 4) not null check (unit_price >= 0),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  check (valid_to is null or valid_to >= valid_from),
  constraint customer_prices_no_overlap exclude using gist (
    organization_id with =,
    customer_id with =,
    product_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create index customer_prices_product_idx on public.customer_prices (organization_id, product_id);
create index customer_prices_customer_idx on public.customer_prices (organization_id, customer_id);
create index customer_prices_created_by_idx on public.customer_prices (created_by);
create index customer_prices_updated_by_idx on public.customer_prices (updated_by);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses
  for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger customer_item_aliases_set_updated_at before update on public.customer_item_aliases
  for each row execute function private.set_updated_at();
create trigger customer_prices_set_updated_at before update on public.customer_prices
  for each row execute function private.set_updated_at();
