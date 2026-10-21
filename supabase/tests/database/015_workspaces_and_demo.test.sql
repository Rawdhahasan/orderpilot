-- Phase 6: workspace creation (FR-ORG-07) and demo reset (UF-13).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

create function pg_temp.svc(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute 'set local role service_role';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create temp table k (name text primary key, v text);
grant all on k to service_role;

insert into k select 'org', pg_temp.svc($$select public.create_organization('Larkspur Supply (fictional)', 'larkspur', 'US', 'USD', 'America/Chicago', 'en-US', '00000000-0000-4000-a500-000000000001')::text$$);
select ok((select v from k where name = 'org') ~ '^[0-9a-f-]{36}$', 'the operator creates a workspace');
select is((select count(*)::int from public.locations where organization_id = (select v from k where name = 'org')::uuid and is_default), 1,
  'a new workspace has its default location (FR-ORG-07)');
select is((select role::text from public.organization_members where organization_id = (select v from k where name = 'org')::uuid), 'owner',
  'the named person is its Owner');
select is((select require_independent_approval::text from public.organizations where id = (select v from k where name = 'org')::uuid), 'true',
  'default settings apply');
select matches(pg_temp.svc($$select public.reset_demo_workspace((select v from k where name = 'org')::uuid)::text$$), '^ERR:55000',
  'a workspace that is not a demo cannot be reset');

-- Reset the seeded Northstar demo workspace after some activity.
update public.inventory_balances set on_hand = on_hand + 5 where product_id = '00000000-0000-4000-a400-000000000001';
insert into k select 'new', pg_temp.svc($$select public.reset_demo_workspace('00000000-0000-4000-a000-000000000001')::text$$);
select ok((select v from k where name = 'new') ~ '^[0-9a-f-]{36}$', 'the operator resets the demo workspace');
select is((select status || '/' || (slug like 'northstar-%') from public.organizations where id = '00000000-0000-4000-a000-000000000001'),
  'suspended/true', 'the previous demo workspace is archived, never deleted');
select is((select slug::text || '/' || is_demo from public.organizations where id = (select v from k where name = 'new')::uuid),
  'northstar/true', 'the fresh demo workspace takes over the slug');
select is((select count(*)::int from public.organization_members where organization_id = (select v from k where name = 'new')::uuid), 6,
  'every member keeps access with the same role');
select is((select count(*)::int from public.customers where organization_id = (select v from k where name = 'new')::uuid), 4,
  'customers are copied');
select is((select on_hand from public.stock_levels where organization_id = (select v from k where name = 'new')::uuid and sku = 'JAN-1001'), 640.000::numeric,
  'stock returns to the seeded opening balance');
select is((select count(*)::int from private.inventory_integrity_report((select v from k where name = 'new')::uuid)), 0,
  'the fresh workspace passes the integrity report');

select * from finish();
rollback;
