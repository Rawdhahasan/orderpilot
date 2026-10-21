import "server-only";

import type { createClient } from "@/server/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AuditFilters = {
  entity?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
};

const ENTITIES = [
  "inbound_order",
  "sales_order",
  "customer",
  "product",
  "exception",
  "inventory_movement",
  "member",
  "organization",
  "invitation",
  "extraction_run",
  "sales_order_line",
  "inbound_order_line",
];

export function parseAuditFilters(sp: Record<string, string | undefined>): AuditFilters {
  return {
    entity: ENTITIES.includes(sp.entity ?? "") ? sp.entity : undefined,
    action: /^[a-z_.]{1,60}$/.test(sp.action ?? "") ? sp.action : undefined,
    actor: /^[0-9a-f-]{36}$/.test(sp.actor ?? "") ? sp.actor : undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to : undefined,
  };
}

export const AUDIT_ENTITIES = ENTITIES;

/** FR-AUD-04: the workspace audit log with filters (RLS limits it to Approver and above). */
export function auditQuery(supabase: Supabase, organizationId: string, f: AuditFilters) {
  let query = supabase
    .from("audit_events")
    .select(
      "id, occurred_at, action, actor_type, actor_user_id, entity_type, entity_id, parent_entity_type, parent_entity_id, changes, reason, metadata, request_id",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  if (f.entity) query = query.eq("entity_type", f.entity);
  if (f.action) query = query.ilike("action", `${f.action}%`);
  if (f.actor) query = query.eq("actor_user_id", f.actor);
  if (f.from) query = query.gte("occurred_at", f.from);
  if (f.to) query = query.lte("occurred_at", `${f.to}T23:59:59.999Z`);
  return query;
}
