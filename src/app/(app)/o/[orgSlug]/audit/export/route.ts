import { NextResponse, type NextRequest } from "next/server";

import { can } from "@/domain/auth/permissions";
import { auditQuery, parseAuditFilters } from "@/features/audit/query";
import { getWorkspaces } from "@/server/auth/context";
import { createClient } from "@/server/supabase/server";

function cell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** FR-AUD-06 (Should): Owners and Admins export the filtered audit log (up to 10,000 rows). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const workspace = (await getWorkspaces()).find((w) => w.slug === orgSlug);
  if (!workspace || !can(workspace.role, "audit.export"))
    return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const filters = parseAuditFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { data } = await auditQuery(supabase, workspace.id, filters).range(0, 9999);
  const header = [
    "occurred_at",
    "action",
    "actor_type",
    "actor_user_id",
    "entity_type",
    "entity_id",
    "parent_entity_type",
    "parent_entity_id",
    "reason",
    "changes",
    "metadata",
    "request_id",
  ];
  const rows = (data ?? []).map((e) =>
    header.map((h) => cell((e as Record<string, unknown>)[h])).join(","),
  );
  return new NextResponse([header.map(cell).join(","), ...rows].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-${orgSlug}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
