import type { Metadata } from "next";
import Link from "next/link";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { StockStatusBadge } from "@/components/status/status-badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STOCK_STATUSES, type StockStatus } from "@/domain/orders/statuses";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Inventory" };

const PAGE_SIZE = 50;

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/inventory`);
  const fmt = workspaceFormat(workspace);
  const page = pageFrom(sp.page);
  const status = STOCK_STATUSES.includes(sp.status as StockStatus)
    ? (sp.status as StockStatus)
    : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const safe = q.replace(/[^\p{L}\p{N} .-]/gu, " ").trim();

  let query = supabase
    .from("stock_levels")
    .select(
      "product_id, sku, name, selling_uom, quantity_decimals, on_hand, reserved, available, reorder_point, stock_status",
      { count: "exact" },
    )
    .eq("organization_id", workspace.id)
    .order("sku")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("stock_status", status);
  if (safe) query = query.or(`sku.ilike.*${safe}*,name.ilike.*${safe}*`);
  const { data: rows, count, error } = await query;
  if (error) throw new Error("Stock could not be loaded.");

  const base = `/o/${orgSlug}/inventory`;
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Inventory"
        description="On hand, reserved for confirmed orders, and available. Untracked products are not listed."
      />
      <div>
        <SearchForm
          action={base}
          query={q}
          label="Search stock"
          placeholder="SKU or name"
          filters={
            <FilterSelect
              name="status"
              label="Stock status"
              value={status}
              options={[
                { value: "", label: "All" },
                { value: "in_stock", label: "In stock" },
                { value: "low", label: "Low" },
                { value: "out_of_stock", label: "Out of stock" },
                { value: "over_committed", label: "Over-committed" },
              ]}
            />
          }
        />
        <Card>
          {rows && rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Reorder point</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const qty = (v: number | null) =>
                    fmt.qty(v, r.selling_uom ?? "", r.quantity_decimals ?? 0);
                  return (
                    <TableRow key={r.product_id}>
                      <TableCell>
                        <Link
                          href={`${base}/${r.product_id}`}
                          className="font-mono font-medium text-navy-900 hover:text-primary hover:underline"
                        >
                          {r.sku}
                        </Link>
                      </TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.on_hand)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.reserved)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {qty(r.available)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {r.reorder_point == null ? "–" : qty(r.reorder_point)}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={r.stock_status as StockStatus} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={q || status ? "No stock matches" : "No tracked products yet"}
              description="Products that track inventory appear here."
            />
          )}
        </Card>
        <Pagination
          basePath={base}
          params={{ q: q || undefined, status }}
          page={page}
          pageSize={PAGE_SIZE}
          total={count ?? 0}
        />
      </div>
    </div>
  );
}
