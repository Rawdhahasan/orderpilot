import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import { describeEvent } from "@/features/audit/describe";
import { AUDIT_ENTITIES, auditQuery, parseAuditFilters } from "@/features/audit/query";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const LINKS: Record<string, string> = {
  inbound_order: "customer-pos",
  sales_order: "sales-orders",
  customer: "customers",
  product: "products",
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/audit`);
  if (!can(workspace.role, "audit.view")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Approver or above" action="view the audit log" />
      </Card>
    );
  }
  const fmt = workspaceFormat(workspace);
  const filters = parseAuditFilters(sp);
  const page = pageFrom(sp.page);
  const [{ data: events, count }, { data: members }] = await Promise.all([
    auditQuery(supabase, workspace.id, filters).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase
      .from("organization_members")
      .select("user_id, profile:profiles!organization_members_user_id_fkey(full_name)")
      .eq("organization_id", workspace.id),
  ]);
  const names = new Map((members ?? []).map((m) => [m.user_id, m.profile?.full_name ?? ""]));
  const base = `/o/${orgSlug}/audit`;
  const exportParams = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Audit log"
        description="Every important action in this workspace: who did it, when, what changed and why. Entries can never be edited or deleted."
        actions={
          can(workspace.role, "audit.export") ? (
            <a
              href={`${base}/export${exportParams ? `?${exportParams}` : ""}`}
              className="inline-flex items-center gap-1 text-small font-medium text-primary hover:underline"
            >
              <Download aria-hidden className="size-4" />
              Export CSV
            </a>
          ) : null
        }
      />
      <div>
        <SearchForm
          action={base}
          label="Filter the audit log"
          placeholder=""
          searchable={false}
          filters={
            <>
              <FilterSelect
                name="entity"
                label="Record type"
                value={filters.entity}
                options={[
                  { value: "", label: "All records" },
                  ...AUDIT_ENTITIES.map((e) => ({ value: e, label: e.replaceAll("_", " ") })),
                ]}
              />
              <FilterSelect
                name="actor"
                label="Person"
                value={filters.actor}
                options={[
                  { value: "", label: "Anyone" },
                  ...[...names].map(([value, label]) => ({ value, label })),
                ]}
              />
              <input
                type="date"
                name="from"
                defaultValue={filters.from}
                aria-label="From"
                className="h-9 rounded-md border border-input bg-white px-2 text-small"
              />
              <input
                type="date"
                name="to"
                defaultValue={filters.to}
                aria-label="To"
                className="h-9 rounded-md border border-input bg-white px-2 text-small"
              />
            </>
          }
        />
        <Card>
          {events && events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden lg:table-cell">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => {
                  const described = describeEvent(
                    e.action,
                    e.changes as Record<string, [unknown, unknown]> | null,
                    e.metadata as Record<string, unknown> | null,
                  );
                  const target = LINKS[e.entity_type]
                    ? e
                    : e.parent_entity_type && LINKS[e.parent_entity_type]
                      ? { entity_type: e.parent_entity_type, entity_id: e.parent_entity_id }
                      : null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmt.dateTime(e.occurred_at)}
                      </TableCell>
                      <TableCell>
                        {e.actor_type === "system"
                          ? `OrderPilot${(e.metadata as { process?: string } | null)?.process ? ` (${(e.metadata as { process: string }).process})` : ""}`
                          : (names.get(e.actor_user_id ?? "") ?? "Former member")}
                      </TableCell>
                      <TableCell>
                        <span className="block">{described.summary}</span>
                        {described.detail || e.reason ? (
                          <span className="text-caption text-subtle-foreground">
                            {[described.detail, e.reason && `Reason: ${e.reason}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {target ? (
                          <Link
                            href={`/o/${orgSlug}/${LINKS[target.entity_type!]}/${target.entity_id}`}
                            className="text-primary hover:underline"
                          >
                            {target.entity_type!.replaceAll("_", " ")}
                          </Link>
                        ) : (
                          e.entity_type.replaceAll("_", " ")
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No events match"
              description="Try a wider date range or another filter."
            />
          )}
        </Card>
        <Pagination
          basePath={base}
          params={{ ...filters }}
          page={page}
          pageSize={PAGE_SIZE}
          total={count ?? 0}
        />
      </div>
    </div>
  );
}
