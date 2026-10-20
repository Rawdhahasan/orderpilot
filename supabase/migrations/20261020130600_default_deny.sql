-- OrderPilot Phase 2A · Migration 7: deny by default.
--
-- Row-level security is switched on for every table now, with no policies, so
-- that no signed-in or anonymous user can read or change anything through the
-- Data API until Phase 2B adds explicit, tested policies and minimal grants.
-- (The postgres and service_role roles bypass RLS and are used only by
-- migrations, tests and the few privileged server modules.)

alter table public.currencies enable row level security;
alter table public.uom_codes enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.document_sequences enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.products enable row level security;
alter table public.customer_item_aliases enable row level security;
alter table public.customer_prices enable row level security;
alter table public.locations enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.source_documents enable row level security;
alter table public.inbound_orders enable row level security;
alter table public.inbound_order_lines enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.order_exceptions enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.integration_outbox enable row level security;

-- Anonymous visitors never touch tables directly (TECHNICAL_ARCHITECTURE.md §7).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
