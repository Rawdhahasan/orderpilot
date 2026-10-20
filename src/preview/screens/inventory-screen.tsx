"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { PackageMinus, PackagePlus } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar, SearchField } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { StockStatusBadge } from "@/components/status/status-badge";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { can } from "@/domain/auth/permissions";
import { add, compare, normalize, subtract } from "@/domain/money/decimal";
import type { StockStatus } from "@/domain/orders/statuses";
import { cn } from "@/lib/cn";

import { MOVEMENTS, PRODUCTS, productStockStatus, type PreviewProduct } from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";

type Filter = "all" | Exclude<StockStatus, "in_stock">;

const MOVEMENT_LABEL = {
  receipt: "Receipt",
  adjustment: "Adjustment",
  reservation: "Reservation",
  reservation_release: "Reservation released",
  issue: "Issued",
};

const REASONS = [
  { value: "cycle_count", label: "Cycle count" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "found", label: "Found" },
  { value: "correction", label: "Correction" },
];

const QUANTITY = /^-?\d+(\.\d{1,3})?$/;

export function InventoryScreen() {
  const { role } = usePersona();
  const canChange = can(role, "stock.change");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedSku, setSelectedSku] = useState<string>("JAN-3104");
  const [dialog, setDialog] = useState<{
    mode: "receive" | "adjust";
    product: PreviewProduct;
  } | null>(null);

  const tracked = PRODUCTS.filter((p) => p.trackInventory);
  const columns = useMemo<ColumnDef<PreviewProduct, unknown>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        accessorKey: "name",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedSku(row.original.sku)}
            className="text-left"
          >
            <span className="block text-navy-900 hover:text-primary hover:underline">
              {row.original.name}
            </span>
            <span className="font-mono text-caption text-muted-foreground">{row.original.sku}</span>
          </button>
        ),
      },
      {
        id: "onhand",
        header: "On hand",
        accessorFn: (p) => Number(p.onHand),
        cell: ({ row }) =>
          fmt.qty(row.original.onHand, row.original.uom, row.original.quantityDecimals),
        meta: { align: "right" },
      },
      {
        id: "reserved",
        header: "Reserved",
        accessorFn: (p) => Number(p.reserved),
        cell: ({ row }) =>
          fmt.qty(row.original.reserved, row.original.uom, row.original.quantityDecimals),
        meta: { align: "right", hideBelow: "sm" },
      },
      {
        id: "available",
        header: "Available",
        accessorFn: (p) => Number(subtract(p.onHand, p.reserved)),
        cell: ({ row }) => {
          const available = subtract(row.original.onHand, row.original.reserved);
          return (
            <span className={cn(compare(available, "0") < 0 && "font-medium text-danger-700")}>
              {fmt.qty(available, row.original.uom, row.original.quantityDecimals)}
            </span>
          );
        },
        meta: { align: "right" },
      },
      {
        id: "reorder",
        header: "Reorder point",
        accessorFn: (p) => Number(p.reorderPoint ?? -1),
        cell: ({ row }) =>
          row.original.reorderPoint
            ? fmt.qty(row.original.reorderPoint, row.original.uom, row.original.quantityDecimals)
            : "–",
        meta: { align: "right", hideBelow: "lg" },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (p) => productStockStatus(p),
        cell: ({ row }) => <StockStatusBadge status={productStockStatus(row.original)} />,
        meta: { hideBelow: "md" },
      },
      ...(canChange
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              enableSorting: false,
              cell: ({ row }: { row: { original: PreviewProduct } }) => (
                <span className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialog({ mode: "receive", product: row.original })}
                  >
                    <PackagePlus aria-hidden />
                    <span className="sr-only lg:not-sr-only">Receive</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialog({ mode: "adjust", product: row.original })}
                  >
                    <PackageMinus aria-hidden />
                    <span className="sr-only lg:not-sr-only">Adjust</span>
                  </Button>
                </span>
              ),
            } satisfies ColumnDef<PreviewProduct, unknown>,
          ]
        : []),
    ],
    [canChange],
  );

  const count = (s: StockStatus) => tracked.filter((p) => productStockStatus(p) === s).length;
  const q = query.trim().toLowerCase();
  const rows = tracked
    .filter((p) => filter === "all" || productStockStatus(p) === filter)
    .filter((p) => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  const selected = PRODUCTS.find((p) => p.sku === selectedSku);
  const movements = MOVEMENTS.filter((m) => m.sku === selectedSku).sort((a, b) =>
    b.at.localeCompare(a.at),
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Inventory"
        description="On hand, reserved for confirmed orders, and available to promise. Balances change only through recorded movements."
        meta={<FictionalBadge />}
      />
      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <ListToolbar>
            <FilterChips
              label="Filter by stock status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All tracked", count: tracked.length },
                { value: "low", label: "Low", count: count("low") },
                { value: "out_of_stock", label: "Out of stock", count: count("out_of_stock") },
                {
                  value: "over_committed",
                  label: "Over-committed",
                  count: count("over_committed"),
                },
              ]}
            />
            <SearchField
              label="Search stock"
              placeholder="SKU or product"
              value={query}
              onChange={setQuery}
            />
          </ListToolbar>
          <DataTable
            caption="Stock levels"
            columns={columns}
            data={rows}
            getRowId={(p) => p.id}
            empty={{ title: "No products in this view" }}
          />
        </div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Movement history</CardTitle>
              <p className="mt-0.5 text-small text-subtle-foreground">
                {selected?.name} <span className="font-mono">{selected?.sku}</span>
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {movements.length ? (
              <ol className="divide-y divide-border">
                {movements.map((m) => (
                  <li key={m.id} className="py-2.5">
                    <p className="flex items-baseline justify-between gap-2 text-body text-navy-900">
                      <span>{MOVEMENT_LABEL[m.type]}</span>
                      <span className="text-small tabular text-subtle-foreground">
                        {m.onHandDelta !== "0"
                          ? `On hand ${m.onHandDelta.startsWith("-") ? "" : "+"}${m.onHandDelta}`
                          : ""}
                        {m.onHandDelta !== "0" && m.reservedDelta !== "0" ? " · " : ""}
                        {m.reservedDelta !== "0"
                          ? `Reserved ${m.reservedDelta.startsWith("-") ? "" : "+"}${m.reservedDelta}`
                          : ""}
                      </span>
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {m.reference} · {m.actor} ·{" "}
                      <time title={fmt.dateTime(m.at)}>{fmt.relative(m.at)}</time> · after:{" "}
                      {m.onHandAfter} on hand, {m.reservedAfter} reserved
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-small text-muted-foreground">
                No movements in the preview fixtures for this product. Select another product.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog ? (
        <StockDialog mode={dialog.mode} product={dialog.product} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function StockDialog({
  mode,
  product,
  onClose,
}: {
  mode: "receive" | "adjust";
  product: PreviewProduct;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const receive = mode === "receive";
  const decimalsOk =
    QUANTITY.test(quantity) && (quantity.split(".")[1]?.length ?? 0) <= product.quantityDecimals;
  const delta = decimalsOk ? quantity : "0";
  const newOnHand = decimalsOk ? add(product.onHand, delta) : product.onHand;
  const negative = compare(newOnHand, "0") < 0;
  const overCommitted = !negative && compare(newOnHand, product.reserved) < 0;
  const valid =
    decimalsOk &&
    compare(delta, "0") !== 0 &&
    (!receive || compare(delta, "0") > 0) &&
    !negative &&
    (receive ? reference.trim() : reason);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{receive ? "Receive stock" : "Adjust stock"}</DialogTitle>
          <DialogDescription>
            {product.name} <span className="font-mono">{product.sku}</span> ·{" "}
            {fmt.qty(product.onHand, product.uom, product.quantityDecimals)} on hand,{" "}
            {fmt.qty(product.reserved, product.uom, product.quantityDecimals)} reserved
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stock-qty">
              {receive
                ? `Quantity received (${product.uom})`
                : `Change in ${product.uom} (use − for a reduction)`}
            </Label>
            <Input
              id="stock-qty"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace("−", "-"))}
              aria-invalid={quantity !== "" && !decimalsOk}
              aria-describedby="stock-qty-help"
            />
            <p id="stock-qty-help" className="text-caption text-subtle-foreground">
              {product.quantityDecimals === 0
                ? "Whole units only."
                : `Up to ${product.quantityDecimals} decimal place.`}
              {decimalsOk && !negative
                ? ` On hand after: ${normalize(newOnHand, product.quantityDecimals)} ${product.uom}.`
                : ""}
            </p>
            {negative ? (
              <p role="alert" className="text-small text-danger-700">
                On hand cannot go below zero. Current on hand is {product.onHand} {product.uom}.
              </p>
            ) : null}
            {overCommitted ? (
              <p role="alert" className="text-small text-warning-800">
                This product will be over-committed by{" "}
                {normalize(subtract(product.reserved, newOnHand), product.quantityDecimals)}{" "}
                {product.uom}. Confirm only if the count is correct.
              </p>
            ) : null}
          </div>
          {receive ? (
            <div className="space-y-1.5">
              <Label htmlFor="stock-ref">Reference (required)</Label>
              <Input
                id="stock-ref"
                placeholder="Supplier delivery note number"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="stock-reason">Reason (required)</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="stock-reason">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              previewOnly(
                `In the product this records a ${receive ? "receipt" : "stock adjustment"} for ${product.sku} in the movement ledger. Stock did not change.`,
              );
              onClose();
            }}
          >
            {receive
              ? "Record receipt"
              : overCommitted
                ? "Record adjustment anyway"
                : "Record adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
