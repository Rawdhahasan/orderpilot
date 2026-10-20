"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar, SearchField } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { SalesOrderStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import type { SalesOrderStatus } from "@/domain/orders/statuses";

import {
  SALES_ORDERS,
  customerById,
  salesOrderBackorders,
  salesOrderSubtotal,
  type PreviewSalesOrder,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt, previewHref } from "../format";

type Filter = "all" | SalesOrderStatus;

export function backorderLabel(order: PreviewSalesOrder): string | null {
  const lines = salesOrderBackorders(order);
  if (!lines.length || order.status === "cancelled") return null;
  return lines.map((l) => `${l.backordered} ${l.uom}`).join(", ") + " backordered";
}

const columns: ColumnDef<PreviewSalesOrder, unknown>[] = [
  {
    id: "number",
    header: "Sales order",
    accessorKey: "number",
    cell: ({ row }) => (
      <Link
        href={previewHref(`sales-orders/${row.original.id}`)}
        className="font-mono text-small font-medium text-navy-900 hover:text-primary hover:underline"
      >
        {row.original.number}
      </Link>
    ),
  },
  { id: "customer", header: "Customer", accessorFn: (o) => customerById(o.customerId)?.name ?? "" },
  {
    id: "po",
    header: "Customer PO",
    accessorKey: "poNumber",
    cell: ({ row }) => <span className="font-mono text-small">{row.original.poNumber}</span>,
    meta: { hideBelow: "md" },
  },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    cell: ({ row }) => {
      const backorder = backorderLabel(row.original);
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <SalesOrderStatusBadge status={row.original.status} />
          {backorder ? <Badge tone="warning">{backorder}</Badge> : null}
        </span>
      );
    },
  },
  {
    id: "approved",
    header: "Approved",
    accessorKey: "approvedAt",
    cell: ({ row }) => (
      <time title={fmt.dateTime(row.original.approvedAt)}>
        {fmt.relative(row.original.approvedAt)}
      </time>
    ),
    meta: { hideBelow: "sm" },
  },
  { id: "by", header: "Approved by", accessorKey: "approvedBy", meta: { hideBelow: "lg" } },
  {
    id: "subtotal",
    header: "Subtotal",
    accessorFn: (o) => Number(salesOrderSubtotal(o)),
    cell: ({ row }) => fmt.money(salesOrderSubtotal(row.original)),
    meta: { align: "right" },
  },
];

export function SalesOrdersScreen() {
  const params = useSearchParams();
  const initial = params.get("status");
  const [filter, setFilter] = useState<Filter>(
    initial === "confirmed" || initial === "fulfilled" || initial === "cancelled" ? initial : "all",
  );
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...SALES_ORDERS]
      .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
      .filter((o) => filter === "all" || o.status === filter)
      .filter(
        (o) =>
          !q ||
          [o.number, o.poNumber, customerById(o.customerId)?.name ?? ""].some((v) =>
            v.toLowerCase().includes(q),
          ),
      );
  }, [filter, query]);
  const count = (status: SalesOrderStatus) =>
    SALES_ORDERS.filter((o) => o.status === status).length;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Sales orders"
        description="Confirmed orders created by approval. They contain confirmed data only."
        meta={<FictionalBadge />}
      />
      <div>
        <ListToolbar>
          <FilterChips
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: SALES_ORDERS.length },
              { value: "confirmed", label: "Confirmed", count: count("confirmed") },
              { value: "fulfilled", label: "Fulfilled", count: count("fulfilled") },
              { value: "cancelled", label: "Cancelled", count: count("cancelled") },
            ]}
          />
          <SearchField
            label="Search sales orders"
            placeholder="Order number, PO number or customer"
            value={query}
            onChange={setQuery}
          />
        </ListToolbar>
        <DataTable
          caption="Sales orders"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowHref={(r) => previewHref(`sales-orders/${r.id}`)}
          empty={{ title: "No sales orders match", description: "Try another status or search." }}
        />
      </div>
    </div>
  );
}
