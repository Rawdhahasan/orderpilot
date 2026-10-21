import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { SalesOrderStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { EntityTimeline } from "@/features/audit/timeline";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

import { HandledExternally, OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Sales order" };

const SOURCE_LABELS: Record<string, string> = {
  po_price: "PO price",
  customer_price: "Customer price",
  list_price: "List price",
};

function Address({ value }: { value: Record<string, string> | null }) {
  if (!value) return <span className="text-subtle-foreground">–</span>;
  return (
    <address className="not-italic">
      {[
        value.name,
        value.line1,
        value.line2,
        [value.city, value.region, value.postal_code].filter(Boolean).join(", "),
        value.country_code,
      ]
        .filter(Boolean)
        .map((x) => (
          <span key={x} className="block">
            {x}
          </span>
        ))}
    </address>
  );
}

/** FR-SO-02, FR-SO-04, FR-SO-05, FR-SO-08. */
export default async function SalesOrderPage({
  params,
}: {
  params: Promise<{ orgSlug: string; salesOrderId: string }>;
}) {
  const { orgSlug, salesOrderId } = await params;
  const { supabase, workspace } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/sales-orders/${salesOrderId}`,
  );
  if (!/^[0-9a-f-]{36}$/.test(salesOrderId)) notFound();
  const { data: order } = await supabase
    .from("sales_orders")
    .select(
      `id, order_number, inbound_order_id, customer_po_number, status, currency, subtotal, po_date, requested_delivery_date, bill_to, ship_to,
       payment_terms, notes, approved_at, fulfilled_at, cancelled_at, cancel_reason, version, duplicate_override,
       customer:customers(id, name, account_number), approver:profiles!sales_orders_approved_by_fkey(full_name),
       fulfiller:profiles!sales_orders_fulfilled_by_fkey(full_name), canceller:profiles!sales_orders_cancelled_by_fkey(full_name),
       intake:inbound_orders!sales_orders_organization_id_inbound_order_id_fkey(reference, source_document_id)`,
    )
    .eq("organization_id", workspace.id)
    .eq("id", salesOrderId)
    .maybeSingle();
  if (!order) notFound();
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select(
      "id, line_no, sku, product_name, customer_part_number, quantity, uom, unit_price, line_total, price_source, allocated_qty, backordered_qty, backorder_handled_at, backorder_handled_reason, handler:profiles!sales_order_lines_backorder_handled_by_fkey(full_name)",
    )
    .eq("sales_order_id", salesOrderId)
    .order("line_no");

  const fmt = workspaceFormat(workspace);
  const backorderedTotal = (lines ?? []).reduce((n, l) => n + Number(l.backordered_qty), 0);
  const canFulfil = can(workspace.role, "sales_order.fulfil");
  const intake = order.intake as { reference: string; source_document_id: string } | null;
  const statusLine =
    order.status === "fulfilled"
      ? `Fulfilled by ${order.fulfiller?.full_name ?? "–"} ${fmt.dateTime(order.fulfilled_at)}${
          backorderedTotal > 0
            ? ` · ${(lines ?? [])
                .filter((l) => Number(l.backordered_qty) > 0)
                .map((l) => `${Number(l.backordered_qty)} ${l.uom} backordered`)
                .join(", ")} (not fulfilled through OrderPilot)`
            : ""
        }`
      : order.status === "cancelled"
        ? `Cancelled by ${order.canceller?.full_name ?? "–"} ${fmt.dateTime(order.cancelled_at)}: ${order.cancel_reason}`
        : `Confirmed by ${order.approver?.full_name ?? "–"} ${fmt.dateTime(order.approved_at)}`;

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader
        title={<span className="font-mono">{order.order_number}</span>}
        description={`${order.customer?.name ?? ""} · PO ${order.customer_po_number ?? "–"}`}
        meta={
          <>
            <SalesOrderStatusBadge status={order.status} />
            {order.duplicate_override ? (
              <Badge tone="warning">Authorised duplicate PO number</Badge>
            ) : null}
          </>
        }
        actions={
          <a
            href={`/o/${orgSlug}/sales-orders/${salesOrderId}/export`}
            className="inline-flex items-center gap-1 text-small font-medium text-primary hover:underline"
          >
            <Download aria-hidden className="size-4" />
            Export CSV
          </a>
        }
      />
      <p
        role="status"
        data-testid="order-status-line"
        className="rounded-md bg-neutral-50 px-3 py-2 text-small text-body-foreground"
      >
        {statusLine}
      </p>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Backordered</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lines ?? []).map((l) => (
                  <TableRow key={l.id} data-testid={`so-line-${l.line_no}`}>
                    <TableCell>{l.line_no}</TableCell>
                    <TableCell>
                      <span className="font-mono">{l.sku}</span> · {l.product_name}
                      {l.customer_part_number ? (
                        <span className="block text-caption text-subtle-foreground">
                          Their part {l.customer_part_number}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.qty(l.quantity, l.uom)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.qty(l.allocated_qty, l.uom)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(l.backordered_qty) > 0 ? (
                        <>
                          <span className="font-medium text-warning-800">
                            {fmt.qty(l.backordered_qty, l.uom)}
                          </span>
                          {l.backorder_handled_at ? (
                            <span className="block text-caption text-subtle-foreground">
                              Handled externally by {l.handler?.full_name}:{" "}
                              {l.backorder_handled_reason}
                            </span>
                          ) : canFulfil && order.status !== "cancelled" ? (
                            <HandledExternally
                              slug={orgSlug}
                              salesOrderId={salesOrderId}
                              lineId={l.id}
                              lineNo={l.line_no}
                            />
                          ) : null}
                        </>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.unitPrice(l.unit_price)}
                      <span className="block text-caption text-subtle-foreground">
                        {SOURCE_LABELS[l.price_source]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.money(l.line_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CardContent className="flex justify-end border-t border-border pt-3 text-body">
              Subtotal{" "}
              <span className="ml-3 font-semibold text-navy-900 tabular-nums">
                {fmt.money(order.subtotal)}
              </span>
            </CardContent>
          </Card>
          <section aria-labelledby="so-history">
            <SectionHeading id="so-history">History</SectionHeading>
            <Card>
              <CardContent className="pt-4">
                <EntityTimeline
                  supabase={supabase}
                  entityType="sales_order"
                  entityId={salesOrderId}
                  format={fmt.dateTime}
                />
              </CardContent>
            </Card>
          </section>
        </div>
        <div className="space-y-5">
          {order.status === "confirmed" &&
          (canFulfil || can(workspace.role, "sales_order.cancel")) ? (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderActions
                  scope={{ slug: orgSlug, salesOrderId, version: order.version }}
                  canFulfil={canFulfil}
                  canCancel={can(workspace.role, "sales_order.cancel")}
                  backordered={backorderedTotal > 0}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-small">
              <div>
                <p className="text-subtle-foreground">Ship to (as approved)</p>
                <Address value={order.ship_to as Record<string, string> | null} />
              </div>
              <div>
                <p className="text-subtle-foreground">Bill to</p>
                <Address value={order.bill_to as Record<string, string> | null} />
              </div>
              <p>
                <span className="text-subtle-foreground">Terms </span>
                {order.payment_terms ?? "–"}
              </p>
              <p>
                <span className="text-subtle-foreground">Requested delivery </span>
                {fmt.date(order.requested_delivery_date)}
              </p>
              {intake ? (
                <p className="flex flex-col gap-1">
                  <Link
                    href={`/o/${orgSlug}/customer-pos/${order.inbound_order_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Customer PO {intake.reference}
                  </Link>
                  <a
                    href={`/api/documents/${intake.source_document_id}`}
                    className="font-medium text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Original document
                  </a>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
