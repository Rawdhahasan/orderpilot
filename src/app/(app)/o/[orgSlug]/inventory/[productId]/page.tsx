import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { StockStatusBadge } from "@/components/status/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import type { StockStatus } from "@/domain/orders/statuses";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

import { AdjustForm, ReceiveForm } from "./stock-forms";

export const metadata: Metadata = { title: "Stock" };

const MOVEMENT_LABELS: Record<string, string> = {
  receipt: "Received",
  adjustment: "Adjusted",
  reservation: "Reserved",
  reservation_release: "Released",
  issue: "Fulfilled",
};
const REASON_LABELS: Record<string, string> = {
  opening_balance: "opening balance",
  cycle_count: "cycle count",
  damaged: "damaged",
  lost: "lost",
  found: "found",
  correction: "correction",
};
const PAGE_SIZE = 50;

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; productId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug, productId } = await params;
  const page = pageFrom((await searchParams).page);
  const { supabase, workspace } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/inventory/${productId}`,
  );
  if (!/^[0-9a-f-]{36}$/.test(productId)) notFound();
  const { data: stock } = await supabase
    .from("stock_levels")
    .select(
      "product_id, sku, name, selling_uom, quantity_decimals, on_hand, reserved, available, reorder_point, stock_status",
    )
    .eq("organization_id", workspace.id)
    .eq("product_id", productId)
    .maybeSingle();
  if (!stock) notFound();

  const { data: movements, count } = await supabase
    .from("inventory_movements")
    .select(
      "id, movement_type, adjustment_reason, on_hand_delta, reserved_delta, on_hand_after, reserved_after, reference, note, occurred_at, sales_order_id, actor:profiles(full_name)",
      { count: "exact" },
    )
    .eq("product_id", productId)
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const orderIds = [
    ...new Set(
      (movements ?? []).map((m) => m.sales_order_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: orders } = orderIds.length
    ? await supabase.from("sales_orders").select("id, order_number").in("id", orderIds)
    : { data: [] as { id: string; order_number: string }[] };
  const orderNumber = new Map((orders ?? []).map((o) => [o.id, o.order_number]));

  const fmt = workspaceFormat(workspace);
  const unit = stock.selling_uom ?? "";
  const decimals = stock.quantity_decimals ?? 0;
  const qty = (v: number | null) => fmt.qty(v, unit, decimals);
  const signed = (v: number) => (v > 0 ? `+${qty(v)}` : qty(v));
  const canChange = can(workspace.role, "stock.change");
  const base = `/o/${orgSlug}/inventory/${productId}`;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        title={stock.name ?? ""}
        description={
          <>
            <span className="font-mono">{stock.sku}</span> ·{" "}
            <Link
              href={`/o/${orgSlug}/products/${productId}`}
              className="text-primary hover:underline"
            >
              Product details
            </Link>
          </>
        }
        meta={<StockStatusBadge status={stock.stock_status as StockStatus} />}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["On hand", stock.on_hand],
          ["Reserved", stock.reserved],
          ["Available", stock.available],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="pt-4">
              <p className="text-caption font-medium tracking-[0.04em] text-subtle-foreground uppercase">
                {label}
              </p>
              <p
                className="mt-1 text-h2 font-semibold text-navy-900 tabular-nums"
                data-testid={`stock-${String(label).toLowerCase().replace(" ", "-")}`}
              >
                {qty(value as number)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {stock.stock_status === "over_committed" ? (
        <p role="status" className="rounded-md bg-danger-50 px-3 py-2 text-small text-danger-800">
          On hand is below the quantity reserved for confirmed orders. Receive stock or cancel
          orders before they can all be fulfilled.
        </p>
      ) : null}

      {canChange ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Receive stock</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiveForm slug={orgSlug} productId={productId} unit={unit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Adjust stock</CardTitle>
            </CardHeader>
            <CardContent>
              <AdjustForm slug={orgSlug} productId={productId} unit={unit} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <section aria-labelledby="movements-heading">
        <SectionHeading id="movements-heading">Movement history</SectionHeading>
        <Card>
          {movements?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="hidden md:table-cell">By</TableHead>
                  <TableHead className="hidden lg:table-cell">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">
                      {fmt.dateTime(m.occurred_at)}
                    </TableCell>
                    <TableCell>
                      {MOVEMENT_LABELS[m.movement_type]}
                      {m.adjustment_reason ? (
                        <span className="text-subtle-foreground">
                          {" "}
                          · {REASON_LABELS[m.adjustment_reason]}
                        </span>
                      ) : null}
                      {m.sales_order_id ? (
                        <Link
                          href={`/o/${orgSlug}/sales-orders/${m.sales_order_id}`}
                          className="ml-1 font-mono text-primary hover:underline"
                        >
                          {orderNumber.get(m.sales_order_id) ?? "order"}
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.on_hand_delta !== 0 ? (
                        <span className="block text-caption text-subtle-foreground">
                          {signed(m.on_hand_delta)}
                        </span>
                      ) : null}
                      {qty(m.on_hand_after)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.reserved_delta !== 0 ? (
                        <span className="block text-caption text-subtle-foreground">
                          {signed(m.reserved_delta)}
                        </span>
                      ) : null}
                      {qty(m.reserved_after)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {m.actor?.full_name ?? "System"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {[m.reference, m.note].filter(Boolean).join(" · ") || "–"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No movements yet" />
          )}
        </Card>
        <Pagination
          basePath={base}
          params={{}}
          page={page}
          pageSize={PAGE_SIZE}
          total={count ?? 0}
        />
      </section>
    </div>
  );
}
