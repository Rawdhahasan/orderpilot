-- OrderPilot Phase 2A · Migration 5: intake (customer POs).
-- docs/DATABASE_ARCHITECTURE.md §6.4, §6.6, §8 and §12.
--
-- Not in this migration:
--   * immutability of stored documents and write-once raw_output → Phase 2B
--   * status transition guard trigger and transition functions  → Phase 2D
--   * extraction queue functions, leases, recovery job          → Phase 2D
--   * hard gates at submit and approve                          → Phase 2D

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  storage_bucket text not null default 'source-documents' check (storage_bucket = 'source-documents'),
  -- Path is always {organization_id}/{id}; filenames never appear in paths.
  storage_path text generated always as (organization_id::text || '/' || id::text) stored,
  original_filename text not null check (length(btrim(original_filename)) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 20971520), -- 20 MB (D-08)
  page_count integer check (page_count is null or page_count between 1 and 50),
  sha256 char(64) check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  upload_status public.upload_status not null default 'pending',
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 500),
  uploaded_by uuid not null references public.profiles (id),
  stored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (storage_bucket, storage_path),
  -- A stored document has been verified server-side.
  check (upload_status <> 'stored' or (sha256 is not null and size_bytes is not null and page_count is not null and stored_at is not null)),
  check ((upload_status = 'rejected') = util.has_text(rejection_reason))
);

create index source_documents_sha256_idx on public.source_documents (organization_id, sha256);
create index source_documents_uploaded_by_idx on public.source_documents (uploaded_by);

-- The intake and its working draft.
create table public.inbound_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  reference text not null check (reference ~ '^IN-[0-9]{6,}$'),
  source_document_id uuid not null,
  status public.inbound_order_status not null default 'received',
  manual_entry boolean not null default false,
  customer_hint_id uuid,
  customer_id uuid,
  assigned_to uuid references public.profiles (id),
  customer_po_number text check (customer_po_number is null or length(btrim(customer_po_number)) between 1 and 64),
  customer_po_number_normalized text generated always as (util.normalize_po_number(customer_po_number)) stored,
  po_date date,
  requested_delivery_date date,
  -- As printed; may be a currency the workspace does not support (CURRENCY_MISMATCH).
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  payment_terms text check (payment_terms is null or length(payment_terms) <= 200),
  document_total numeric(19, 4),
  document_tax_total numeric(19, 4),
  bill_to jsonb check (bill_to is null or jsonb_typeof(bill_to) = 'object'),
  ship_to jsonb check (ship_to is null or jsonb_typeof(ship_to) = 'object'),
  bill_to_address_id uuid,
  ship_to_address_id uuid,
  notes text check (notes is null or length(notes) <= 4000),
  -- Provenance per header field (§6.6); shape validated by the application.
  field_meta jsonb not null default '{}'::jsonb check (jsonb_typeof(field_meta) = 'object'),
  latest_extraction_run_id uuid,
  validated_version integer check (validated_version is null or validated_version >= 1),
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  submit_note text check (submit_note is null or length(submit_note) <= 2000),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or length(decision_reason) <= 2000),
  cancel_reason public.cancel_reason,
  cancel_note text check (cancel_note is null or length(cancel_note) <= 2000),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  sales_order_id uuid,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  unique (organization_id, reference),
  -- One intake per document.
  unique (source_document_id),
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id),
  foreign key (organization_id, customer_hint_id) references public.customers (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  -- A selected address must belong to the confirmed customer.
  foreign key (organization_id, customer_id, bill_to_address_id)
    references public.customer_addresses (organization_id, customer_id, id),
  foreign key (organization_id, customer_id, ship_to_address_id)
    references public.customer_addresses (organization_id, customer_id, id),
  check (bill_to_address_id is null or customer_id is not null),
  check (ship_to_address_id is null or customer_id is not null),
  -- Status consistency (DATABASE_ARCHITECTURE.md §6.4).
  check ((status = 'approved') = (sales_order_id is not null)),
  check (status <> 'approved' or (decided_by is not null and decided_at is not null)),
  check (status <> 'rejected' or (decided_by is not null and decided_at is not null and util.has_text(decision_reason))),
  check (status <> 'pending_approval' or (submitted_by is not null and submitted_at is not null)),
  check ((status = 'cancelled') = (cancel_reason is not null)),
  check (status <> 'cancelled' or (cancelled_by is not null and cancelled_at is not null)),
  check (cancel_reason is distinct from 'other' or util.has_text(cancel_note))
);

create index inbound_orders_queue_idx on public.inbound_orders (organization_id, status, created_at);
create index inbound_orders_source_document_idx on public.inbound_orders (organization_id, source_document_id);
create index inbound_orders_assigned_idx on public.inbound_orders (organization_id, assigned_to, status);
create index inbound_orders_customer_idx on public.inbound_orders (organization_id, customer_id);
create index inbound_orders_customer_hint_idx on public.inbound_orders (organization_id, customer_hint_id);
create index inbound_orders_po_number_idx
  on public.inbound_orders (organization_id, customer_id, customer_po_number_normalized);
create index inbound_orders_bill_to_idx on public.inbound_orders (organization_id, customer_id, bill_to_address_id);
create index inbound_orders_ship_to_idx on public.inbound_orders (organization_id, customer_id, ship_to_address_id);
create index inbound_orders_latest_run_idx on public.inbound_orders (organization_id, latest_extraction_run_id);
create index inbound_orders_sales_order_idx on public.inbound_orders (organization_id, sales_order_id, id);
create index inbound_orders_assigned_to_idx on public.inbound_orders (assigned_to);
create index inbound_orders_submitted_by_idx on public.inbound_orders (submitted_by);
create index inbound_orders_decided_by_idx on public.inbound_orders (decided_by);
create index inbound_orders_cancelled_by_idx on public.inbound_orders (cancelled_by);
create index inbound_orders_created_by_idx on public.inbound_orders (created_by);
create index inbound_orders_updated_by_idx on public.inbound_orders (updated_by);

-- Aliases record the intake they were learned from.
alter table public.customer_item_aliases
  add foreign key (organization_id, source_inbound_order_id)
  references public.inbound_orders (organization_id, id);

create table public.inbound_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inbound_order_id uuid not null,
  line_no integer not null check (line_no >= 1),
  page_number integer check (page_number is null or page_number >= 1),
  -- As printed: copied from extraction or typed from the document; never
  -- overwritten by matching.
  customer_part_number text check (customer_part_number is null or length(customer_part_number) <= 64),
  description text check (description is null or length(description) <= 1000),
  po_quantity numeric(14, 3),
  po_uom text check (po_uom is null or length(po_uom) <= 20),
  po_unit_price numeric(19, 4),
  po_line_total numeric(19, 4),
  -- Resolved by the reviewer.
  product_id uuid,
  match_method public.match_method,
  match_score numeric(4, 3) check (match_score is null or match_score between 0 and 1),
  remember_alias boolean not null default false,
  quantity numeric(14, 3) check (quantity is null or quantity > 0),
  uom_conversion_note text check (uom_conversion_note is null or length(uom_conversion_note) <= 500),
  unit_price numeric(19, 4) check (unit_price is null or unit_price >= 0),
  price_source public.price_source,
  expected_unit_price numeric(19, 4) check (expected_unit_price is null or expected_unit_price >= 0),
  field_meta jsonb not null default '{}'::jsonb check (jsonb_typeof(field_meta) = 'object'),
  -- Soft removal so approvers can see removed lines.
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  removed_reason text check (removed_reason is null or length(removed_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (organization_id, id),
  unique (organization_id, inbound_order_id, id),
  unique (inbound_order_id, line_no),
  foreign key (organization_id, inbound_order_id) references public.inbound_orders (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  check ((removed_at is null) = (removed_by is null)),
  check (not remember_alias or product_id is not null),
  check ((product_id is null) = (match_method is null)),
  check ((unit_price is null) = (price_source is null))
);

create index inbound_order_lines_product_idx on public.inbound_order_lines (organization_id, product_id);
create index inbound_order_lines_removed_by_idx on public.inbound_order_lines (removed_by);
create index inbound_order_lines_created_by_idx on public.inbound_order_lines (created_by);
create index inbound_order_lines_updated_by_idx on public.inbound_order_lines (updated_by);

-- Extraction runs. The table is also the durable job queue: it is the source
-- of truth for extraction work (TECHNICAL_ARCHITECTURE.md §8, M-04, M-05).
create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inbound_order_id uuid not null,
  source_document_id uuid not null,
  provider text not null check (provider ~ '^[a-z0-9_-]{1,40}$'),
  provider_version text check (provider_version is null or length(provider_version) <= 80),
  output_schema_version text not null default 'extraction.v1' check (output_schema_version ~ '^extraction\.v[0-9]+$'),
  status public.extraction_status not null default 'queued',
  attempt integer not null default 1 check (attempt >= 1),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  failure_kind text check (failure_kind is null or failure_kind in ('transient', 'permanent')),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,60}$'),
  -- Sanitised; never raw document content.
  error_message text check (error_message is null or length(error_message) <= 500),
  raw_output jsonb check (raw_output is null or jsonb_typeof(raw_output) = 'object'),
  overall_confidence numeric(4, 3) check (overall_confidence is null or overall_confidence between 0 and 1),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (inbound_order_id, attempt),
  foreign key (organization_id, inbound_order_id) references public.inbound_orders (organization_id, id),
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id),
  check (attempt <= max_attempts),
  -- A queued run has no claim; a running run holds a lease; a finished run has none.
  check (status <> 'queued' or (claim_token is null and lease_expires_at is null)),
  check (status <> 'running' or (claim_token is not null and lease_expires_at is not null and claimed_at is not null)),
  check (status not in ('succeeded', 'failed') or (finished_at is not null and lease_expires_at is null)),
  check (status <> 'succeeded' or raw_output is not null),
  check ((status = 'failed') = (failure_kind is not null and error_code is not null))
);

create index extraction_runs_claim_idx on public.extraction_runs (available_at) where status = 'queued';
create index extraction_runs_lease_idx on public.extraction_runs (lease_expires_at) where status = 'running';
create index extraction_runs_document_idx on public.extraction_runs (organization_id, source_document_id);
create index extraction_runs_inbound_order_idx on public.extraction_runs (organization_id, inbound_order_id);

alter table public.inbound_orders
  add foreign key (organization_id, latest_extraction_run_id)
  references public.extraction_runs (organization_id, id);

-- Exceptions raised by validation (PRODUCT_REQUIREMENTS.md §9).
create table public.order_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inbound_order_id uuid not null,
  inbound_order_line_id uuid,
  code public.exception_code not null,
  severity public.exception_severity not null,
  -- D-34: only catalogue-listed codes may be overridden by an Approver.
  overridable boolean not null,
  status public.exception_status not null default 'open',
  message text not null check (length(btrim(message)) between 1 and 1000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  -- SHA-256 (hex) of the values the rule looked at; a change re-opens the exception.
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  -- Override record (D-34, duplicate safety §12.1).
  override_reason text check (override_reason is null or length(override_reason) <= 1000),
  overridden_by uuid references public.profiles (id),
  overridden_at timestamptz,
  -- Fingerprint of the exact conflict the Approver reviewed.
  override_fingerprint text check (override_fingerprint is null or override_fingerprint ~ '^[0-9a-f]{64}$'),
  -- For duplicates: the intakes and sales orders the Approver reviewed,
  -- as a JSON array of {"type": "inbound_order"|"sales_order", "id": uuid}.
  override_conflicts jsonb check (override_conflicts is null or jsonb_typeof(override_conflicts) = 'array'),
  -- True only for an overridden DUPLICATE_PO_NUMBER exception. A sales order
  -- that is an authorised duplicate must reference a row where this is true.
  authorizes_duplicate boolean generated always as (code = 'DUPLICATE_PO_NUMBER' and status = 'overridden') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, inbound_order_id, id),
  unique (organization_id, inbound_order_id, id, authorizes_duplicate),
  -- One row per rule, scope and line; NULL lines (header exceptions) count as equal.
  unique nulls not distinct (inbound_order_id, inbound_order_line_id, code),
  foreign key (organization_id, inbound_order_id) references public.inbound_orders (organization_id, id),
  -- A line exception belongs to a line of the same intake.
  foreign key (organization_id, inbound_order_id, inbound_order_line_id)
    references public.inbound_order_lines (organization_id, inbound_order_id, id),
  check (overridable = util.exception_is_overridable(code)),
  check (not overridable or severity = 'blocking'),
  check (status <> 'acknowledged' or severity = 'warning'),
  check (status not in ('resolved', 'acknowledged') or (resolved_by is not null and resolved_at is not null)),
  -- An override exists exactly when the status is overridden, and is complete.
  check (
    (status = 'overridden') = (
      overridden_by is not null and overridden_at is not null
      and util.has_text(override_reason) and override_fingerprint is not null
    )
  ),
  check (status <> 'overridden' or overridable),
  check (status = 'overridden' or (override_reason is null and override_conflicts is null)),
  -- A duplicate override names the specific conflicts that were reviewed.
  check (
    status <> 'overridden'
    or code not in ('DUPLICATE_PO_NUMBER', 'DUPLICATE_DOCUMENT')
    or (override_conflicts is not null and jsonb_array_length(override_conflicts) >= 1)
  )
);

create index order_exceptions_open_idx on public.order_exceptions (organization_id, inbound_order_id, status);
create index order_exceptions_line_idx on public.order_exceptions (organization_id, inbound_order_id, inbound_order_line_id);
create index order_exceptions_resolved_by_idx on public.order_exceptions (resolved_by);
create index order_exceptions_overridden_by_idx on public.order_exceptions (overridden_by);

create trigger source_documents_set_updated_at before update on public.source_documents
  for each row execute function private.set_updated_at();
create trigger inbound_orders_set_updated_at before update on public.inbound_orders
  for each row execute function private.set_updated_at();
create trigger inbound_order_lines_set_updated_at before update on public.inbound_order_lines
  for each row execute function private.set_updated_at();
create trigger extraction_runs_set_updated_at before update on public.extraction_runs
  for each row execute function private.set_updated_at();
create trigger order_exceptions_set_updated_at before update on public.order_exceptions
  for each row execute function private.set_updated_at();
