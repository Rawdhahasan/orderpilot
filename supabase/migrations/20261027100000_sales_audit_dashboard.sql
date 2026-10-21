-- OrderPilot Phase 5 · Migration 19: backorders handled externally, entity
-- timelines, dashboard figures. PRODUCT_REQUIREMENTS.md FR-SO-08, FR-AUD-01
-- to 05, FR-DASH-01 to 06; DATABASE_ARCHITECTURE.md §13.

-- FR-SO-08 (D-35): record that a backorder was handled outside OrderPilot.
-- A reason is required; it never changes inventory or backordered_qty.
create function public.mark_backorder_handled(p_sales_order_line_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.sales_order_lines;
  v_order public.sales_orders;
  v_reason text;
begin
  select * into v_line from public.sales_order_lines where id = p_sales_order_line_id;
  if not found or not private.is_member(v_line.organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  v_order := private.lock_sales_order(v_line.sales_order_id);
  select * into v_line from public.sales_order_lines where id = p_sales_order_line_id for update;
  perform private.assert_permission(v_line.organization_id, 'sales_order.fulfil');
  if v_order.status = 'cancelled' then
    raise exception 'invalid_state: the sales order is cancelled' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_line.backordered_qty = 0 or v_line.backorder_handled_at is not null then
    raise exception 'invalid_state: there is no open backorder on this line' using errcode = 'object_not_in_prerequisite_state';
  end if;
  v_reason := private.require_reason(p_reason);
  update public.sales_order_lines
     set backorder_handled_at = now(), backorder_handled_by = auth.uid(), backorder_handled_reason = v_reason
   where id = v_line.id;
  perform private.write_audit(v_line.organization_id, 'sales_order_line.backorder_handled', 'sales_order_line', v_line.id::text,
    'sales_order', v_line.sales_order_id::text, null, v_reason,
    jsonb_build_object('backordered_qty', v_line.backordered_qty, 'note', 'Handled outside OrderPilot; inventory unchanged'));
  return jsonb_build_object('ok', true);
end
$$;

-- FR-AUD-02: the timeline of a record a member can see, including events on
-- its children (lines, exceptions, runs). Every member may read the history
-- of records they can view; the full workspace log stays Approver and above.
create function public.entity_timeline(p_entity_type text, p_entity_id uuid, p_limit integer default 200)
returns table (
  id bigint, occurred_at timestamptz, action text, actor_type public.actor_type, actor_name text,
  entity_type text, entity_id text, changes jsonb, reason text, metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  v_org := case p_entity_type
    when 'inbound_order' then (select organization_id from public.inbound_orders where id = p_entity_id)
    when 'sales_order' then (select organization_id from public.sales_orders where id = p_entity_id)
    when 'customer' then (select organization_id from public.customers where id = p_entity_id)
    when 'product' then (select organization_id from public.products where id = p_entity_id)
  end;
  if v_org is null or not private.has_permission(v_org, 'timeline.view') then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  return query
    select a.id, a.occurred_at, a.action, a.actor_type, p.full_name, a.entity_type, a.entity_id,
           a.changes - array['field_meta', 'raw_output', 'claim_token'], a.reason, a.metadata
      from public.audit_events a
      left join public.profiles p on p.id = a.actor_user_id
     where a.organization_id = v_org
       and ((a.entity_type = p_entity_type and a.entity_id = p_entity_id::text)
            or (a.parent_entity_type = p_entity_type and a.parent_entity_id = p_entity_id::text))
     order by a.occurred_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end
$$;

-- FR-DASH-01 to 06: figures from real data only (aggregates in SQL).
create function public.dashboard_summary(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_organization_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'intakes', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
       select status, count(*) n from public.inbound_orders where organization_id = p_organization_id group by status) s),
    'assigned_to_me', (select count(*) from public.inbound_orders
       where organization_id = p_organization_id and assigned_to = auth.uid() and status in ('in_review', 'extraction_failed')),
    'override_required', (select count(distinct e.inbound_order_id) from public.order_exceptions e
       join public.inbound_orders i on i.id = e.inbound_order_id
       where i.organization_id = p_organization_id and i.status = 'pending_approval' and e.status = 'open' and e.overridable),
    'oldest_pending_at', (select min(submitted_at) from public.inbound_orders
       where organization_id = p_organization_id and status = 'pending_approval'),
    'sales_orders_30d', (select count(*) from public.sales_orders
       where organization_id = p_organization_id and approved_at > now() - interval '30 days'),
    'sales_value_30d', (select coalesce(sum(subtotal), 0) from public.sales_orders
       where organization_id = p_organization_id and status <> 'cancelled' and approved_at > now() - interval '30 days'),
    'to_fulfil', (select count(*) from public.sales_orders where organization_id = p_organization_id and status = 'confirmed'),
    'open_backorders', (select count(*) from public.sales_order_lines l join public.sales_orders s on s.id = l.sales_order_id
       where l.organization_id = p_organization_id and l.backordered_qty > 0 and l.backorder_handled_at is null and s.status <> 'cancelled'),
    'stock', (select coalesce(jsonb_object_agg(stock_status, n), '{}'::jsonb) from (
       select v.stock_status, count(*) n from public.stock_levels v where v.organization_id = p_organization_id group by v.stock_status) s),
    'median_minutes_to_approval_30d', (select percentile_cont(0.5) within group (order by extract(epoch from (decided_at - created_at)) / 60)
       from public.inbound_orders where organization_id = p_organization_id and status = 'approved' and decided_at > now() - interval '30 days'),
    'approved_30d', (select count(*) from public.inbound_orders
       where organization_id = p_organization_id and status = 'approved' and decided_at > now() - interval '30 days'),
    'touchless_30d', (select count(*) from public.inbound_orders i
       where i.organization_id = p_organization_id and i.status = 'approved' and i.decided_at > now() - interval '30 days'
         and not exists (select 1 from jsonb_each(i.field_meta) f where f.value ->> 'state' = 'edited')
         and not exists (select 1 from public.inbound_order_lines l, jsonb_each(l.field_meta) f
                          where l.inbound_order_id = i.id and f.value ->> 'state' = 'edited')),
    'extraction_failures_7d', (select count(*) from public.extraction_runs
       where organization_id = p_organization_id and status = 'failed' and failure_kind is not null and finished_at > now() - interval '7 days')
  );
end
$$;

revoke all on function public.mark_backorder_handled(uuid, text) from public, anon;
revoke all on function public.entity_timeline(text, uuid, integer) from public, anon;
revoke all on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.mark_backorder_handled(uuid, text) to authenticated;
grant execute on function public.entity_timeline(text, uuid, integer) to authenticated;
grant execute on function public.dashboard_summary(uuid) to authenticated;
