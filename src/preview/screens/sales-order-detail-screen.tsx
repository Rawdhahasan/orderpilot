"use client";

import { Ban, Download, PackageCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SalesOrderStatusBadge } from "@/components/status/status-badge";
import { Timeline, type TimelineEntry } from "@/components/timeline/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import { lineTotal } from "@/domain/money/decimal";

import {
  customerById,
  intakeById,
  productBySku,
  salesOrderSubtotal,
  type PreviewSalesOrder,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";

import { backorderLabel } from "./sales-orders-screen";

const PRICE_SOURCE = {
  po_price: "PO price",
  customer_price: "Customer price",
  list_price: "List price",
};

export function SalesOrderDetailScreen({ order }: { order: PreviewSalesOrder }) {
  const { role } = usePersona();
  const customer = customerById(order.customerId);
  const intake = intakeById(order.intakeId);
  const backorder = backorderLabel(order);
  const tracked = order.lines.filter((l) => productBySku(l.sku)?.trackInventory);

  const timeline: TimelineEntry[] = (
    [
      {
        id: "received",
        kind: "upload" as const,
        actor: "Customer PO",
        action: `${intake?.reference ?? ""} received`,
        when: fmt.relative(order.receivedAt),
        whenAbsolute: fmt.dateTime(order.receivedAt),
      },
      {
        id: "approved",
        kind: "approval" as const,
        actor: order.approvedBy,
        action: `approved and created ${order.number}`,
        when: fmt.relative(order.approvedAt),
        whenAbsolute: fmt.dateTime(order.approvedAt),
        emphasis: true,
      },
      ...(order.fulfilledAt
        ? [
            {
              id: "fulfilled",
              kind: "stock" as const,
              actor: order.fulfilledBy ?? "",
              action: backorder
                ? `marked fulfilled; ${backorder}, not fulfilled through OrderPilot`
                : "marked fulfilled",
              when: fmt.relative(order.fulfilledAt),
              whenAbsolute: fmt.dateTime(order.fulfilledAt),
            },
          ]
        : []),
      ...(order.cancelledAt
        ? [
            {
              id: "cancelled",
              kind: "other" as const,
              actor: order.approvedBy,
              action: "cancelled the order; reservations released",
              when: fmt.relative(order.cancelledAt),
              whenAbsolute: fmt.dateTime(order.cancelledAt),
              detail: order.cancelReason,
            },
          ]
        : []),
    ] satisfies TimelineEntry[]
  ).reverse();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title={<span className="font-mono">{order.number}</span>}
        description={`${customer?.name} · PO ${order.poNumber} · Approved by ${order.approvedBy}, ${fmt.dateTime(order.approvedAt)}`}
        meta={
          <>
            <SalesOrderStatusBadge status={order.status} />
            {backorder ? <Badge tone="warning">{backorder}</Badge> : null}
            <FictionalBadge />
          </>
        }
        actions={
          <>
            {order.status === "confirmed" && can(role, "sales_order.fulfil") ? (
              <ActionDialog
                trigger={
                  <Button variant="primary">
                    <PackageCheck aria-hidden />
                    Mark fulfilled
                  </Button>
                }
                title={`Mark ${order.number} fulfilled?`}
                body={`This issues ${
                  tracked
                    .filter((l) => l.allocated !== "0")
                    .map((l) => `${l.allocated} ${l.uom} ${l.sku}`)
                    .join(", ") || "no tracked stock"
                } from stock.${backorder ? ` ${backorder} will not be fulfilled through OrderPilot.` : ""}`}
                confirm="Mark fulfilled"
                result={`In the product, stock would be issued and ${order.number} marked fulfilled. Nothing was changed.`}
              />
            ) : null}
            {order.status === "confirmed" && can(role, "sales_order.cancel") ? (
              <ActionDialog
                destructive
                trigger={
                  <Button>
                    <Ban aria-hidden />
                    Cancel order
                  </Button>
                }
                title={`Cancel ${order.number}?`}
                body="All reservations are released. A reason is required in the product."
                confirm="Cancel order"
                result={`In the product, ${order.number} would be cancelled and its reservations released. Nothing was cancelled.`}
              />
            ) : null}
            <Button
              onClick={() =>
                previewOnly("In the product this exports the order as CSV for manual ERP entry.")
              }
            >
              <Download aria-hidden />
              Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
              <div>
                <p className="text-caption text-muted-foreground">Ship to (snapshot)</p>
                <address className="mt-1 text-body text-navy-900 not-italic">
                  {order.shipTo.map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                </address>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Requested delivery</p>
                <p className="mt-1 text-body text-navy-900">{fmt.date(order.requestedDate)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Subtotal</p>
                <p className="mt-1 text-h2 font-semibold tabular text-navy-900">
                  {fmt.money(salesOrderSubtotal(order))}
                </p>
                <p className="text-caption text-muted-foreground">Tax is calculated by the ERP</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Backordered</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Unit price</TableHead>
                  <TableHead className="hidden lg:table-cell">Price source</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => {
                  const product = productBySku(line.sku);
                  const decimals = product?.quantityDecimals ?? 0;
                  return (
                    <TableRow key={line.lineNo}>
                      <TableCell className="tabular">{line.lineNo}</TableCell>
                      <TableCell>
                        <span className="block text-navy-900">{line.name}</span>
                        <span className="font-mono text-caption text-muted-foreground">
                          {line.sku}
                          {line.customerPartNumber ? ` · customer ${line.customerPartNumber}` : ""}
                          {product && !product.trackInventory ? " · not tracked" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {fmt.qty(line.quantity, line.uom, decimals)}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {fmt.qty(line.allocated, line.uom, decimals)}
                      </TableCell>
                      <TableCell
                        className={
                          line.backordered !== "0"
                            ? "text-right font-medium tabular text-warning-800"
                            : "text-right tabular text-muted-foreground"
                        }
                      >
                        {fmt.qty(line.backordered, line.uom, decimals)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular sm:table-cell">
                        {fmt.unitPrice(line.unitPrice)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {PRICE_SOURCE[line.priceSource]}
                      </TableCell>
                      <TableCell className="hidden text-right tabular md:table-cell">
                        {fmt.money(lineTotal(line.quantity, line.unitPrice))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-small text-subtle-foreground">
              <p>
                Customer PO <span className="font-mono text-navy-900">{intake?.reference}</span>
              </p>
              <p>{intake?.fileName}</p>
              <p>
                Sales orders show confirmed values only. Where each value came from is kept in the
                timeline and audit log.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline entries={timeline} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ActionDialog({
  trigger,
  title,
  body,
  confirm,
  result,
  destructive = false,
}: {
  trigger: React.ReactNode;
  title: string;
  body: string;
  confirm: string;
  result: string;
  destructive?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Keep as is</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              variant={destructive ? "destructive" : "primary"}
              onClick={() => previewOnly(result)}
            >
              {confirm}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
