"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar, SearchField } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { ProductStatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/auth/permissions";
import { subtract } from "@/domain/money/decimal";
import type { ProductStatus } from "@/domain/orders/statuses";
import { EMPTY_VALUE } from "@/lib/format";

import { CUSTOMERS, PRODUCTS, type PreviewProduct } from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { PhaseDialog } from "../components/phase-dialog";
import { fmt } from "../format";
import { usePersona } from "../persona";

type Filter = "all" | ProductStatus;

function aliasesFor(sku: string) {
  return CUSTOMERS.flatMap((c) =>
    c.aliases.filter((a) => a.productSku === sku).map((a) => a.customerPartNumber),
  );
}

const columns: ColumnDef<PreviewProduct, unknown>[] = [
  {
    id: "sku",
    header: "SKU",
    accessorKey: "sku",
    cell: ({ row }) => (
      <span className="font-mono text-small font-medium text-navy-900">{row.original.sku}</span>
    ),
  },
  {
    id: "name",
    header: "Product",
    accessorKey: "name",
    cell: ({ row }) => {
      const aliases = aliasesFor(row.original.sku);
      return (
        <span>
          <span className="block text-navy-900">{row.original.name}</span>
          {aliases.length ? (
            <span className="text-caption text-muted-foreground">
              Customer part numbers: {aliases.join(", ")}
            </span>
          ) : null}
        </span>
      );
    },
  },
  { id: "uom", header: "Unit", accessorKey: "uom", meta: { hideBelow: "sm" } },
  {
    id: "price",
    header: "List price",
    accessorFn: (p) => Number(p.listPrice),
    cell: ({ row }) => fmt.unitPrice(row.original.listPrice),
    meta: { align: "right" },
  },
  {
    id: "available",
    header: "Available",
    accessorFn: (p) =>
      p.trackInventory ? Number(subtract(p.onHand, p.reserved)) : Number.NEGATIVE_INFINITY,
    cell: ({ row }) =>
      row.original.trackInventory ? (
        fmt.qty(
          subtract(row.original.onHand, row.original.reserved),
          row.original.uom,
          row.original.quantityDecimals,
        )
      ) : (
        <span className="text-muted-foreground">Not tracked</span>
      ),
    meta: { align: "right", hideBelow: "md" },
  },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    cell: ({ row }) => <ProductStatusBadge status={row.original.status} />,
    meta: { hideBelow: "sm" },
  },
  {
    id: "gtin",
    header: "GTIN",
    accessorFn: (p) => p.gtin ?? "",
    cell: ({ row }) => (
      <span className="font-mono text-caption">{row.original.gtin ?? EMPTY_VALUE}</span>
    ),
    meta: { hideBelow: "lg" },
  },
];

export function ProductsScreen() {
  const { role } = usePersona();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = PRODUCTS.filter((p) => filter === "all" || p.status === filter).filter(
    (p) =>
      !q ||
      [p.sku, p.name, p.gtin ?? "", ...aliasesFor(p.sku)].some((v) => v.toLowerCase().includes(q)),
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Products"
        description="Your catalog: selling units, list prices and the part numbers customers use for each item."
        meta={<FictionalBadge />}
        actions={
          can(role, "product.edit") ? (
            <PhaseDialog
              trigger={
                <Button variant="primary">
                  <Plus aria-hidden />
                  New product
                </Button>
              }
              title="New product"
              description="Create products with SKU, selling unit, allowed decimals, list price and GTIN check-digit validation."
              phase="3"
              feature="Creating and editing products"
            />
          ) : null
        }
      />
      <div>
        <ListToolbar>
          <FilterChips
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: PRODUCTS.length },
              {
                value: "active",
                label: "Active",
                count: PRODUCTS.filter((p) => p.status === "active").length,
              },
              {
                value: "discontinued",
                label: "Discontinued",
                count: PRODUCTS.filter((p) => p.status === "discontinued").length,
              },
            ]}
          />
          <SearchField
            label="Search products"
            placeholder="SKU, name, GTIN or customer part number"
            value={query}
            onChange={setQuery}
          />
        </ListToolbar>
        <DataTable
          caption="Products"
          columns={columns}
          data={rows}
          getRowId={(p) => p.id}
          empty={{
            title: "No products match",
            description: "Search also covers customer part numbers.",
          }}
        />
      </div>
    </div>
  );
}
