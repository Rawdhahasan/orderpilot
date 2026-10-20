"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar, SearchField } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { IntakeStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { can } from "@/domain/auth/permissions";
import { EMPTY_VALUE } from "@/lib/format";

import {
  INTAKES,
  customerById,
  intakeLineCount,
  intakeSubtotal,
  userName,
  type PreviewIntake,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt, previewHref } from "../format";
import { usePersona } from "../persona";
import { intakeExceptionCounts } from "../review/counts";

type Filter =
  "all" | "mine" | "in_review" | "pending_approval" | "attention" | "approved" | "closed";

const MATCHERS: Record<Filter, (intake: PreviewIntake, userId: string) => boolean> = {
  all: () => true,
  mine: (i, userId) => i.assignedTo === userId && i.status === "in_review",
  in_review: (i) => i.status === "in_review",
  pending_approval: (i) => i.status === "pending_approval",
  attention: (i) =>
    i.status === "extraction_failed" || i.status === "extracting" || i.status === "received",
  approved: (i) => i.status === "approved",
  closed: (i) => i.status === "rejected" || i.status === "cancelled",
};

export function intakeHref(intake: PreviewIntake): string {
  if (intake.status === "pending_approval") return previewHref(`approvals/${intake.id}`);
  if (intake.status === "approved" && intake.salesOrderId)
    return previewHref(`sales-orders/${intake.salesOrderId}`);
  return previewHref(`customer-pos/${intake.id}`);
}

function initialFilter(status: string | null, assigned: string | null): Filter {
  if (assigned === "me") return "mine";
  if (status === "in_review" || status === "pending_approval" || status === "approved")
    return status;
  if (status === "extraction_failed" || status === "extracting" || status === "received")
    return "attention";
  return "all";
}

const columns: ColumnDef<PreviewIntake, unknown>[] = [
  {
    id: "reference",
    header: "Reference",
    accessorKey: "reference",
    cell: ({ row }) => (
      <Link
        href={intakeHref(row.original)}
        className="font-mono text-small font-medium text-navy-900 hover:text-primary hover:underline"
      >
        {row.original.reference}
      </Link>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    accessorFn: (i) => customerById(i.customerId)?.name ?? "",
    cell: ({ row }) => {
      const customer = customerById(row.original.customerId);
      return customer ? (
        <span className="text-navy-900">{customer.name}</span>
      ) : (
        <span className="text-muted-foreground">Not identified</span>
      );
    },
  },
  {
    id: "po",
    header: "PO number",
    accessorFn: (i) => i.poNumber ?? "",
    cell: ({ row }) => (
      <span className="font-mono text-small">{row.original.poNumber ?? EMPTY_VALUE}</span>
    ),
    meta: { hideBelow: "md" },
  },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    cell: ({ row }) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <IntakeStatusBadge status={row.original.status} />
        {row.original.overrideRequired ? <Badge tone="warning">Override required</Badge> : null}
        {row.original.manualEntry ? <Badge tone="neutral">Manual entry</Badge> : null}
      </span>
    ),
  },
  {
    id: "exceptions",
    header: "Exceptions",
    enableSorting: false,
    cell: ({ row }) => {
      const counts = intakeExceptionCounts(row.original);
      if (!counts) return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      const { blocking, warnings } = counts;
      if (!blocking && !warnings) return <span className="text-small text-success-700">None</span>;
      return (
        <span className="inline-flex flex-wrap gap-x-2 text-small whitespace-nowrap">
          {blocking ? (
            <span className="font-medium text-danger-700">{blocking} blocking</span>
          ) : null}
          {warnings ? (
            <span className="text-warning-800">
              {warnings} warning{warnings > 1 ? "s" : ""}
            </span>
          ) : null}
        </span>
      );
    },
    meta: { hideBelow: "lg" },
  },
  {
    id: "lines",
    header: "Lines",
    accessorFn: (i) => intakeLineCount(i) ?? -1,
    cell: ({ row }) => intakeLineCount(row.original) ?? EMPTY_VALUE,
    meta: { align: "right", hideBelow: "md" },
  },
  {
    id: "subtotal",
    header: "Subtotal",
    accessorFn: (i) => Number(intakeSubtotal(i) ?? -1),
    cell: ({ row }) => {
      const subtotal = intakeSubtotal(row.original);
      return subtotal ? fmt.money(subtotal) : EMPTY_VALUE;
    },
    meta: { align: "right", hideBelow: "lg" },
  },
  {
    id: "received",
    header: "Received",
    accessorKey: "receivedAt",
    cell: ({ row }) => (
      <time title={fmt.dateTime(row.original.receivedAt)}>
        {fmt.relative(row.original.receivedAt)}
      </time>
    ),
    meta: { hideBelow: "sm" },
  },
  {
    id: "assigned",
    header: "Assigned",
    accessorFn: (i) => userName(i.assignedTo),
    cell: ({ row }) =>
      row.original.assignedTo ? (
        userName(row.original.assignedTo)
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
    meta: { hideBelow: "lg" },
  },
];

export function CustomerPosScreen() {
  const params = useSearchParams();
  const { user, role } = usePersona();
  const [filter, setFilter] = useState<Filter>(() =>
    initialFilter(params.get("status"), params.get("assigned")),
  );
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INTAKES.filter((i) => MATCHERS[filter](i, user.id)).filter((i) => {
      if (!q) return true;
      const customer = customerById(i.customerId)?.name ?? "";
      return [i.reference, i.poNumber ?? "", customer, i.fileName].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [filter, query, user.id]);

  const count = (f: Filter) => INTAKES.filter((i) => MATCHERS[f](i, user.id)).length;
  const options = [
    { value: "all" as const, label: "All", count: count("all") },
    ...(can(role, "intake.review")
      ? [{ value: "mine" as const, label: "Assigned to me", count: count("mine") }]
      : []),
    { value: "in_review" as const, label: "In review", count: count("in_review") },
    {
      value: "pending_approval" as const,
      label: "Awaiting approval",
      count: count("pending_approval"),
    },
    { value: "attention" as const, label: "Extraction", count: count("attention") },
    { value: "approved" as const, label: "Approved", count: count("approved") },
    { value: "closed" as const, label: "Rejected or cancelled", count: count("closed") },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Customer POs"
        description="Every purchase order received from customers, from upload to approval."
        meta={<FictionalBadge />}
      />
      <div>
        <ListToolbar>
          <FilterChips
            label="Filter by status"
            options={options}
            value={filter}
            onChange={setFilter}
          />
          <SearchField
            label="Search customer POs"
            placeholder="Reference, customer or PO number"
            value={query}
            onChange={setQuery}
          />
        </ListToolbar>
        <DataTable
          caption="Customer POs"
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          rowHref={intakeHref}
          empty={{
            title: query ? "No customer POs match your search" : "No customer POs in this view",
            description: query
              ? "Try a reference, customer name or PO number."
              : "Choose another filter to see more.",
          }}
        />
      </div>
    </div>
  );
}
