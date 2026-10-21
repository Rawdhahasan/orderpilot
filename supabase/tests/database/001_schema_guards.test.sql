-- Schema guards (docs/TESTING_STRATEGY.md §5.1). These rules apply to every
-- future migration too: a new table without RLS or an unindexed foreign key
-- fails the suite.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- Every expected table exists ------------------------------------------------
select tables_are(
  'public',
  array[
    'currencies', 'uom_codes', 'profiles', 'organizations', 'organization_members',
    'organization_invitations', 'document_sequences', 'customers', 'customer_addresses',
    'products', 'customer_item_aliases', 'customer_prices', 'locations',
    'inventory_balances', 'inventory_movements', 'source_documents', 'inbound_orders',
    'inbound_order_lines', 'extraction_runs', 'order_exceptions', 'sales_orders',
    'sales_order_lines', 'integration_outbox', 'audit_events', 'ai_usage_events'
  ],
  'public schema contains exactly the expected tables'
);

-- Row-level security is on for every table (deny by default until Phase 2B) ---
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[],
  'every public table has row-level security enabled'
);

-- Anonymous visitors have no table privileges --------------------------------
select is(
  (select coalesce(array_agg(distinct table_name::text order by table_name::text), '{}')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  '{}'::text[],
  'the anon role has no privileges on public tables'
);

-- Every tenant table carries a NOT NULL organization_id ----------------------
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('currencies', 'uom_codes', 'profiles', 'organizations')
      and not exists (
        select 1 from pg_attribute a
         where a.attrelid = c.oid and a.attname = 'organization_id' and a.attnotnull and not a.attisdropped
      )),
  '{}'::text[],
  'every tenant table has organization_id NOT NULL'
);

-- Every foreign key is backed by an index starting with its columns ----------
select is(
  (with fks as (
     select c.conrelid, c.conname, c.conkey
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f' and n.nspname = 'public'
   )
   select coalesce(array_agg(f.conrelid::regclass::text || '.' || f.conname order by f.conname), '{}')
     from fks f
    where not exists (
      select 1
        from pg_index i
       where i.indrelid = f.conrelid
         and i.indpred is null
         and (select array_agg(k order by k) from unnest((string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(f.conkey)]) k)
             = (select array_agg(k order by k) from unnest(f.conkey) k)
    )),
  '{}'::text[],
  'every foreign key has a supporting index'
);

-- Tenant tables referenced by children expose (organization_id, id) ----------
select is(
  (select coalesce(array_agg(t order by t), '{}')
     from unnest(array[
       'customers', 'customer_addresses', 'products', 'locations', 'source_documents',
       'inbound_orders', 'inbound_order_lines', 'extraction_runs', 'order_exceptions',
       'sales_orders', 'sales_order_lines', 'organization_members'
     ]) t
    where not exists (
      select 1 from pg_constraint c
       where c.conrelid = ('public.' || t)::regclass and c.contype = 'u'
         and (select array_agg(a.attname::text order by a.attname)
                from pg_attribute a
               where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = array['id', 'organization_id']
    )),
  '{}'::text[],
  'parent tables have unique (organization_id, id) for composite foreign keys'
);

-- SECURITY DEFINER functions in the Data API are a reviewed allowlist ---------
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  array['accept_invitation', 'acknowledge_exception', 'adjust_stock', 'approve_inbound_order',
        'assign_inbound_order', 'cancel_inbound_order', 'cancel_sales_order', 'change_member_role',
        'claim_extraction_job', 'complete_extraction', 'create_organization', 'create_pending_document',
        'dashboard_summary', 'describe_invitation', 'entity_timeline', 'expected_prices',
        'extend_extraction_lease', 'fail_extraction', 'finalize_document', 'finish_ai_call',
        'fulfill_sales_order', 'import_customers', 'import_opening_stock', 'import_products',
        'intake_duplicate_info', 'invite_member', 'issue_invitation_token', 'mark_backorder_handled',
        'override_exception', 'receive_stock', 'record_document_download', 'record_mfa_reset',
        'record_validation', 'recover_stale_extractions', 'reject_document', 'reject_inbound_order',
        'remove_member', 'request_changes', 'reserve_ai_call', 'reset_demo_workspace', 'retry_extraction',
        'revoke_invitation', 'save_inbound_order_draft', 'set_base_currency', 'set_customer_status',
        'set_member_status', 'set_product_price', 'set_product_tracking', 'start_extraction',
        'submit_inbound_order', 'switch_to_manual_entry', 'update_workspace_settings',
        'withdraw_inbound_order'],
  'only reviewed role-checked functions are SECURITY DEFINER in public'
);
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  '{}'::text[],
  'no public function is executable by anon or PUBLIC'
);

-- util functions are pure, so they are safe in generated columns and checks --
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'util' and p.provolatile <> 'i'),
  '{}'::text[],
  'every util function is IMMUTABLE'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('util', 'private')
      and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')),
  '{}'::text[],
  'every util and private function pins its search_path'
);

-- Exposed schemas are only those the Data API is configured for -------------
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anon cannot use the private schema'
);
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  array['has_permission', 'is_member', 'permission_roles', 'user_org_ids', 'user_org_ids_with'],
  'signed-in users can execute only the RLS access helpers in private'
);
select is(
  (select array_agg(s order by s) from unnest(array['private', 'util']) s
    where s = any (string_to_array(coalesce(current_setting('pgrst.db_schemas', true), 'public,graphql_public'), ','))),
  null,
  'private and util are not exposed through the Data API'
);

-- Table privileges for signed-in users are exactly the access matrix (§7.4) ---
select is(
  (select coalesce(array_agg(table_name || ':' || privilege_type order by table_name, privilege_type), '{}')
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'),
  array[
    'ai_usage_events:SELECT', 'audit_events:SELECT', 'currencies:SELECT', 'customer_addresses:SELECT', 'customer_item_aliases:SELECT',
    'customer_prices:DELETE', 'customer_prices:SELECT', 'customers:SELECT', 'extraction_runs:SELECT',
    'inbound_order_lines:SELECT', 'inbound_orders:SELECT', 'inventory_balances:SELECT',
    'inventory_movements:SELECT', 'locations:SELECT', 'order_exceptions:SELECT',
    'organization_members:SELECT', 'organizations:SELECT',
    'products:SELECT', 'profiles:SELECT', 'sales_order_lines:SELECT', 'sales_orders:SELECT',
    'source_documents:SELECT', 'stock_levels:SELECT', 'uom_codes:SELECT'
  ],
  'signed-in users have table-level SELECT only (plus DELETE on customer prices; invitations are column-level); writes are column grants'
);
select is(
  (select coalesce(array_agg(distinct table_name || '.' || column_name || ':' || privilege_type
            order by table_name || '.' || column_name || ':' || privilege_type), '{}')
     from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')
      and column_name in ('status', 'hold_reason', 'list_price', 'track_inventory', 'version', 'created_by',
                          'updated_by', 'organization_id', 'require_independent_approval', 'base_currency')
      and not (table_name = 'products' and privilege_type = 'INSERT' and column_name in ('list_price', 'track_inventory', 'status', 'organization_id'))
      -- Reviewed: discontinuing a product is a product edit (FR-PROD-02), limited to product editors by RLS.
      and not (table_name = 'products' and privilege_type = 'UPDATE' and column_name = 'status')
      and not (privilege_type = 'INSERT' and column_name = 'organization_id')
      and not (table_name in ('customer_addresses', 'customer_item_aliases') and column_name = 'status')),
  '{}'::text[],
  'protected columns (status, prices, tracking, settings, actors, versions) cannot be written directly'
);

-- Enumerated types match DATABASE_ARCHITECTURE.md §5 --------------------------
select enum_has_labels('public', 'member_role',
  array['owner', 'admin', 'approver', 'processor', 'inventory_manager', 'viewer'],
  'six fixed roles (D-04)');
select enum_has_labels('public', 'inbound_order_status',
  array['received', 'extracting', 'extraction_failed', 'in_review', 'pending_approval', 'approved', 'rejected', 'cancelled'],
  'intake lifecycle statuses');
select enum_has_labels('public', 'sales_order_status', array['confirmed', 'fulfilled', 'cancelled'], 'sales order statuses');
select enum_has_labels('public', 'movement_type',
  array['receipt', 'adjustment', 'reservation', 'reservation_release', 'issue'], 'inventory movement types');
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'exception_code'),
  22,
  'every exception code from PRODUCT_REQUIREMENTS.md §9 exists'
);

-- Generated columns are generated, so callers cannot supply their own values --
select is(
  (select coalesce(array_agg(c.relname || '.' || a.attname order by c.relname, a.attname), '{}')
     from (values
       ('customers', 'account_number_normalized'),
       ('customer_addresses', 'match_key'),
       ('products', 'sku_normalized'),
       ('customer_item_aliases', 'customer_part_number_normalized'),
       ('inventory_balances', 'available'),
       ('source_documents', 'storage_path'),
       ('inbound_orders', 'customer_po_number_normalized'),
       ('order_exceptions', 'authorizes_duplicate'),
       ('sales_orders', 'customer_po_number_normalized'),
       ('sales_orders', 'duplicate_override'),
       ('sales_orders', 'duplicate_override_marker')
     ) as expected(tbl, col)
     join pg_class c on c.relname = expected.tbl
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     join pg_attribute a on a.attrelid = c.oid and a.attname = expected.col
    where a.attgenerated <> 's'),
  '{}'::text[],
  'normalised keys and derived flags are stored generated columns'
);

-- Money and quantities use exact numeric types ------------------------------
select is(
  (select coalesce(array_agg(table_name || '.' || column_name order by table_name, column_name), '{}')
     from information_schema.columns
    where table_schema = 'public'
      and data_type in ('real', 'double precision', 'money')),
  '{}'::text[],
  'no floating point or money columns anywhere'
);

select * from finish();
rollback;
