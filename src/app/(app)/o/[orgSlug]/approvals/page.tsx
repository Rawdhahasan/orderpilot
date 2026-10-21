import type { Metadata } from "next";
import Link from "next/link";

import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Badge } from "@/components/ui/badge";
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
import { lineTotal, sumMoney } from "@/domain/money/decimal";
import { workspaceFormat } from "@/features/workspace/format";
import { formatRelative } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Approvals" };

/** FR-APR-01: waiting longest first, filterable by customer and submitter. */
export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace, user } = await requireWorkspace(orgSlug, `/o/${orgSlug}/approvals`);
  if (!can(workspace.role, "intake.approve")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Approver or above" action="approve customer POs" />
      </Card>
    );
  }
  const fmt = workspaceFormat(workspace);
  let query = supabase
    .from("inbound_orders")
    .select(
      "id, reference, customer_po_number, submitted_at, submitted_by, customer_id, customer:customers!inbound_orders_organization_id_customer_id_fkey(name), submitter:profiles!inbound_orders_submitted_by_fkey(full_name)",
    )
    .eq("organization_id", workspace.id)
    .eq("status", "pending_approval")
    .order("submitted_at", { ascending: true })
    .limit(200);
  if (sp.customer && /^[0-9a-f-]{36}$/.test(sp.customer))
    query = query.eq("customer_id", sp.customer);
  if (sp.submitter && /^[0-9a-f-]{36}$/.test(sp.submitter))
    query = query.eq("submitted_by", sp.submitter);
  const { data: rows } = await query;
  const ids = (rows ?? []).map((r) => r.id);
  const [{ data: lines }, { data: exceptions }, { data: allPending }] = await Promise.all([
    ids.length
      ? supabase
          .from("inbound_order_lines")
          .select("inbound_order_id, quantity, unit_price")
          .in("inbound_order_id", ids)
          .is("removed_at", null)
      : Promise.resolve({
          data: [] as {
            inbound_order_id: string;
            quantity: number | null;
            unit_price: number | null;
          }[],
        }),
    ids.length
      ? supabase
          .from("order_exceptions")
          .select("inbound_order_id, overridable")
          .in("inbound_order_id", ids)
          .eq("status", "open")
          .eq("severity", "blocking")
      : Promise.resolve({ data: [] as { inbound_order_id: string; overridable: boolean }[] }),
    supabase
      .from("inbound_orders")
      .select(
        "customer_id, submitted_by, customer:customers!inbound_orders_organization_id_customer_id_fkey(name), submitter:profiles!inbound_orders_submitted_by_fkey(full_name)",
      )
      .eq("organization_id", workspace.id)
      .eq("status", "pending_approval")
      .limit(500),
  ]);
  const totals = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const id of ids) {
    const mine = (lines ?? []).filter(
      (l) => l.inbound_order_id === id && l.quantity !== null && l.unit_price !== null,
    );
    totals.set(id, sumMoney(mine.map((l) => lineTotal(String(l.quantity), String(l.unit_price)))));
    counts.set(id, (lines ?? []).filter((l) => l.inbound_order_id === id).length);
  }
  const overrides = new Map<string, number>();
  for (const e of exceptions ?? [])
    if (e.overridable)
      overrides.set(e.inbound_order_id, (overrides.get(e.inbound_order_id) ?? 0) + 1);
  const customers = new Map(
    (allPending ?? [])
      .filter((p) => p.customer_id)
      .map((p) => [p.customer_id!, p.customer?.name ?? ""]),
  );
  const submitters = new Map(
    (allPending ?? [])
      .filter((p) => p.submitted_by)
      .map((p) => [p.submitted_by!, p.submitter?.full_name ?? ""]),
  );
  const now = new Date();
  const base = `/o/${orgSlug}/approvals`;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Approvals"
        description="Customer POs waiting for a decision, oldest first."
      />
      <div>
        <SearchForm
          action={base}
          label="Filter approvals"
          placeholder=""
          searchable={false}
          filters={
            <>
              <FilterSelect
                name="customer"
                label="Customer"
                value={sp.customer}
                options={[
                  { value: "", label: "All customers" },
                  ...[...customers].map(([value, label]) => ({ value, label })),
                ]}
              />
              <FilterSelect
                name="submitter"
                label="Submitted by"
                value={sp.submitter}
                options={[
                  { value: "", label: "Anyone" },
                  ...[...submitters].map(([value, label]) => ({ value, label })),
                ]}
              />
            </>
          }
        />
        <Card>
          {rows && rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>PO number</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead className="hidden md:table-cell">Submitted by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`${base}/${r.id}`}
                        className="font-mono font-medium text-navy-900 hover:text-primary hover:underline"
                      >
                        {r.reference}
                      </Link>
                      {overrides.get(r.id) ? (
                        <Badge tone="warning" className="ml-2">
                          Override required
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{r.customer?.name ?? "–"}</TableCell>
                    <TableCell>{r.customer_po_number ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{counts.get(r.id)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.money(totals.get(r.id) ?? "0")}
                    </TableCell>
                    <TableCell>
                      {r.submitted_at ? formatRelative(r.submitted_at, now) : "–"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.submitter?.full_name}
                      {r.submitted_by === user.id ? (
                        <span className="text-caption text-subtle-foreground"> (you)</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="Nothing waiting" description="Submitted customer POs appear here." />
          )}
        </Card>
      </div>
    </div>
  );
}
