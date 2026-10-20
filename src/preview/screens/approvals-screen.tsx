"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Badge } from "@/components/ui/badge";
import { can } from "@/domain/auth/permissions";
import { compare } from "@/domain/money/decimal";

import {
  INTAKES,
  PREVIEW_NOW,
  approvalFor,
  availableFor,
  customerById,
  intakeLineCount,
  intakeSubtotal,
  userName,
  type PreviewIntake,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt, previewHref } from "../format";
import { usePersona } from "../persona";

export function stockShortLines(intakeId: string): number {
  const approval = approvalFor(intakeId);
  return approval
    ? approval.lines.filter((l) => l.tracked && compare(l.quantity, availableFor(l.sku)) > 0).length
    : 0;
}

type Filter = "all" | "override" | "stock";

export function ApprovalsScreen() {
  const { user, role } = usePersona();
  const [filter, setFilter] = useState<Filter>("all");

  const queue = useMemo(
    () =>
      INTAKES.filter((i) => i.status === "pending_approval").sort((a, b) =>
        (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
      ),
    [],
  );

  const columns = useMemo<ColumnDef<PreviewIntake, unknown>[]>(
    () => [
      {
        id: "reference",
        header: "Reference",
        accessorKey: "reference",
        cell: ({ row }) => (
          <Link
            href={previewHref(`approvals/${row.original.id}`)}
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
      },
      {
        id: "waiting",
        header: "Waiting",
        accessorFn: (i) => i.submittedAt ?? "",
        cell: ({ row }) =>
          row.original.submittedAt
            ? fmt.duration(PREVIEW_NOW.getTime() - new Date(row.original.submittedAt).getTime())
            : "",
      },
      {
        id: "submitter",
        header: "Submitted by",
        accessorFn: (i) => userName(i.submittedBy),
        cell: ({ row }) => (
          <span>
            {userName(row.original.submittedBy)}
            {row.original.submittedBy === user.id ? (
              <span className="block text-caption text-muted-foreground">You</span>
            ) : null}
          </span>
        ),
        meta: { hideBelow: "md" },
      },
      {
        id: "flags",
        header: "Needs",
        enableSorting: false,
        cell: ({ row }) => {
          const short = stockShortLines(row.original.id);
          return (
            <span className="inline-flex flex-wrap gap-1.5">
              {row.original.overrideRequired ? (
                <Badge tone="warning">Override required</Badge>
              ) : null}
              {short ? (
                <Badge tone="warning">
                  Stock decision · {short} line{short > 1 ? "s" : ""}
                </Badge>
              ) : null}
              {!row.original.overrideRequired && !short ? (
                <span className="text-small text-success-700">Ready to approve</span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "lines",
        header: "Lines",
        accessorFn: (i) => intakeLineCount(i) ?? 0,
        meta: { align: "right", hideBelow: "lg" },
      },
      {
        id: "subtotal",
        header: "Subtotal",
        accessorFn: (i) => Number(intakeSubtotal(i) ?? 0),
        cell: ({ row }) => fmt.money(intakeSubtotal(row.original) ?? "0"),
        meta: { align: "right", hideBelow: "sm" },
      },
    ],
    [user.id],
  );

  if (!can(role, "intake.approve")) {
    return <NoPermissionState roleNeeded="Approver" action="approve orders" />;
  }

  const rows = queue.filter((i) =>
    filter === "override"
      ? i.overrideRequired
      : filter === "stock"
        ? stockShortLines(i.id) > 0
        : true,
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Approvals"
        description="Customer POs waiting for a decision, oldest first. Nothing becomes a sales order without approval."
        meta={<FictionalBadge />}
      />
      <div>
        <ListToolbar>
          <FilterChips
            label="Filter approvals"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: queue.length },
              {
                value: "override",
                label: "Override required",
                count: queue.filter((i) => i.overrideRequired).length,
              },
              {
                value: "stock",
                label: "Stock decision",
                count: queue.filter((i) => stockShortLines(i.id) > 0).length,
              },
            ]}
          />
        </ListToolbar>
        <DataTable
          caption="Approval queue"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowHref={(r) => previewHref(`approvals/${r.id}`)}
          empty={{
            title: "No customer POs are waiting for approval",
            description: "Submitted orders appear here, oldest first.",
          }}
        />
      </div>
    </div>
  );
}
