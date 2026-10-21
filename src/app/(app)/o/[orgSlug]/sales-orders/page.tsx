import type { Metadata } from "next";
import Link from "next/link";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { SalesOrderStatusBadge } from "@/components/status/status-badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Sales orders" };

const PAGE_SIZE = 25;

/** FR-SO-01: search by order number, PO number or customer; filter by status and dates. */
export default async function SalesOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/sales-orders`);
  const fmt = workspaceFormat(workspace);
  const page = pageFrom(sp.page);
  const status = ["confirmed", "fulfilled", "cancelled"].includes(sp.status ?? "")
    ? (sp.status as "confirmed" | "fulfilled" | "cancelled")
    : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const safe = q.replace(/[^\p{L}\p{N} &.'-]/gu, " ").trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from : undefined;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to : undefined;

  let customerIds: string[] = [];
  if (safe) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", workspace.id)
      .ilike("name", `%${safe}%`)
      .limit(50);
    customerIds = (data ?? []).map((c) => c.id);
  }
  let query = supabase
    .from("sales_orders")
    .select(
      "id, order_number, customer_po_number, status, subtotal, approved_at, duplicate_override, customer:customers(name)",
      { count: "exact" },
    )
    .eq("organization_id", workspace.id)
    .order("approved_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("approved_at", from);
  if (to) query = query.lte("approved_at", `${to}T23:59:59.999Z`);
  if (safe) {
    const terms = [`order_number.ilike.*${safe}*`, `customer_po_number.ilike.*${safe}*`];
    if (customerIds.length) terms.push(`customer_id.in.(${customerIds.join(",")})`);
    query = query.or(terms.join(","));
  }
  const { data: rows, count, error } = await query;
  if (error) throw new Error("Sales orders could not be loaded.");

  const ids = (rows ?? []).map((r) => r.id);
  const { data: backorders } = ids.length
    ? await supabase
        .from("sales_order_lines")
        .select("sales_order_id, backordered_qty, backorder_handled_at")
        .in("sales_order_id", ids)
        .gt("backordered_qty", 0)
    : {
        data: [] as {
          sales_order_id: string;
          backordered_qty: number;
          backorder_handled_at: string | null;
        }[],
      };
  const openBackorders = new Set(
    (backorders ?? []).filter((b) => !b.backorder_handled_at).map((b) => b.sales_order_id),
  );
  const base = `/o/${orgSlug}/sales-orders`;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Sales orders"
        description="Confirmed orders created by approval. They never change after approval, apart from their status."
      />
      <div>
        <SearchForm
          action={base}
          query={q}
          label="Search sales orders"
          placeholder="Order number, PO number or customer"
          filters={
            <>
              <FilterSelect
                name="status"
                label="Status"
                value={status}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "confirmed", label: "Confirmed" },
                  { value: "fulfilled", label: "Fulfilled" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
              <input
                type="date"
                name="from"
                defaultValue={from}
                aria-label="Approved from"
                className="h-9 rounded-md border border-input bg-white px-2 text-small"
              />
              <input
                type="date"
                name="to"
                defaultValue={to}
                aria-label="Approved to"
                className="h-9 rounded-md border border-input bg-white px-2 text-small"
              />
            </>
          }
        />
        <Card>
          {rows && rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>PO number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="hidden md:table-cell">Approved</TableHead>
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
                        {r.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>{r.customer?.name}</TableCell>
                    <TableCell>{r.customer_po_number ?? "–"}</TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <SalesOrderStatusBadge status={r.status} />
                        {openBackorders.has(r.id) && r.status !== "cancelled" ? (
                          <span className="text-caption text-warning-800">Backorder open</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.money(r.subtotal)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {fmt.dateTime(r.approved_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={q || status || from || to ? "No sales orders match" : "No sales orders yet"}
              description="Approving a customer PO creates its sales order."
            />
          )}
        </Card>
        <Pagination
          basePath={base}
          params={{ q: q || undefined, status, from, to }}
          page={page}
          pageSize={PAGE_SIZE}
          total={count ?? 0}
        />
      </div>
    </div>
  );
}
