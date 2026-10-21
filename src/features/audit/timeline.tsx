import "server-only";

import { Timeline, type TimelineEntry, type TimelineKind } from "@/components/timeline/timeline";
import { formatRelative } from "@/lib/format";
import type { createClient } from "@/server/supabase/server";

import { describeEvent } from "./describe";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function kindOf(action: string): TimelineKind {
  if (action.includes("received") || action.startsWith("source_document")) return "upload";
  if (action.startsWith("extraction")) return "extraction";
  if (action.includes("overridden")) return "override";
  if (action.includes("approved") || action.includes("confirmed") || action.includes("fulfilled"))
    return "approval";
  if (action.startsWith("inventory")) return "stock";
  if (action.endsWith(".updated")) return "edit";
  return "other";
}

/** FR-AUD-02: a record's history, readable by every member who can see it. */
export async function EntityTimeline({
  supabase,
  entityType,
  entityId,
  format,
}: {
  supabase: Supabase;
  entityType: "inbound_order" | "sales_order" | "customer" | "product";
  entityId: string;
  format: (iso: string) => string;
}) {
  const { data } = await supabase.rpc("entity_timeline", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_limit: 100,
  });
  const now = new Date();
  const entries: TimelineEntry[] = (data ?? []).map((e) => {
    const described = describeEvent(
      e.action,
      e.changes as Record<string, [unknown, unknown]> | null,
      e.metadata as Record<string, unknown> | null,
    );
    return {
      id: String(e.id),
      kind: kindOf(e.action),
      actor: e.actor_type === "system" ? "OrderPilot" : (e.actor_name ?? "Someone"),
      action: described.summary,
      when: formatRelative(e.occurred_at, now),
      whenAbsolute: format(e.occurred_at),
      detail: [described.detail, e.reason].filter(Boolean).join(" · ") || undefined,
      emphasis: /approved|overridden|cancelled|rejected/.test(e.action),
    };
  });
  if (entries.length === 0)
    return <p className="text-small text-subtle-foreground">No history yet.</p>;
  return <Timeline entries={entries} />;
}
