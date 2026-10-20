"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar, SearchField } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/auth/permissions";

import { AUDIT_EVENTS, type PreviewAuditEvent } from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { PhaseDialog } from "../components/phase-dialog";
import { fmt, previewHref } from "../format";
import { usePersona } from "../persona";

type Filter = "all" | PreviewAuditEvent["entityType"] | "system";

const ENTITY_LABEL: Record<PreviewAuditEvent["entityType"], string> = {
  intake: "Customer POs",
  sales_order: "Sales orders",
  customer: "Customers",
  product: "Products",
  inventory: "Inventory",
  member: "Members",
  settings: "Settings",
};

const columns: ColumnDef<PreviewAuditEvent, unknown>[] = [
  {
    id: "at",
    header: "Time",
    accessorKey: "at",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <span className="block text-navy-900">{fmt.dateTime(row.original.at)}</span>
        <span className="text-caption text-muted-foreground" title={`${row.original.at} (UTC)`}>
          {fmt.relative(row.original.at)}
        </span>
      </span>
    ),
  },
  {
    id: "actor",
    header: "Actor",
    accessorKey: "actor",
    cell: ({ row }) => (
      <span className="inline-flex flex-col gap-0.5">
        <span className="text-navy-900">{row.original.actor}</span>
        {row.original.actorType === "system" ? (
          <Badge tone="neutral" className="w-fit">
            System
          </Badge>
        ) : null}
      </span>
    ),
    meta: { hideBelow: "md" },
  },
  {
    id: "event",
    header: "Event",
    accessorKey: "summary",
    enableSorting: false,
    cell: ({ row }) => {
      const e = row.original;
      return (
        <div className="min-w-56 space-y-1">
          <p className="text-navy-900">
            <span className="md:hidden">{e.actor} </span>
            {e.summary}
          </p>
          <p className="font-mono text-caption text-muted-foreground">{e.action}</p>
          {e.changes?.map((c) => (
            <p key={c.field} className="text-small text-body-foreground">
              {c.field}: {c.from} → {c.to}
              {c.aiValue ? (
                <span className="text-muted-foreground"> · AI suggested {c.aiValue}</span>
              ) : null}
            </p>
          ))}
          {e.reason ? (
            <p className="text-small text-subtle-foreground">Reason: “{e.reason}”</p>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "entity",
    header: "Record",
    accessorKey: "entityLabel",
    cell: ({ row }) =>
      row.original.entityHref ? (
        <Link
          href={previewHref(row.original.entityHref)}
          className="font-mono text-small text-primary hover:underline"
        >
          {row.original.entityLabel}
        </Link>
      ) : (
        <span className="font-mono text-small">{row.original.entityLabel}</span>
      ),
    meta: { hideBelow: "sm" },
  },
  {
    id: "request",
    header: "Request ID",
    accessorKey: "requestId",
    cell: ({ row }) => (
      <span className="font-mono text-caption text-muted-foreground">{row.original.requestId}</span>
    ),
    meta: { hideBelow: "lg" },
  },
];

export function AuditScreen() {
  const { role } = usePersona();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...AUDIT_EVENTS]
      .sort((a, b) => b.at.localeCompare(a.at))
      .filter((e) =>
        filter === "all"
          ? true
          : filter === "system"
            ? e.actorType === "system"
            : e.entityType === filter,
      )
      .filter(
        (e) =>
          !q ||
          [e.actor, e.summary, e.action, e.entityLabel].some((v) => v.toLowerCase().includes(q)),
      );
  }, [filter, query]);

  if (!can(role, "audit.view")) {
    return (
      <NoPermissionState
        roleNeeded="Approver, Admin or Owner"
        action="view the workspace audit log"
      />
    );
  }

  const entityTypes = Object.keys(ENTITY_LABEL) as PreviewAuditEvent["entityType"][];
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Audit log"
        description="Every important action, who did it, when and why. Records cannot be edited or deleted. Times are in Eastern Time; hover for UTC."
        meta={<FictionalBadge />}
        actions={
          can(role, "audit.export") ? (
            <PhaseDialog
              trigger={
                <Button>
                  <Download aria-hidden />
                  Export CSV
                </Button>
              }
              title="Export the audit log"
              description="Exports the current filter as CSV. The export is itself recorded in the audit log."
              phase="5"
              feature="Audit log export"
            />
          ) : null
        }
      />
      <div>
        <ListToolbar>
          <FilterChips
            label="Filter by record type"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: AUDIT_EVENTS.length },
              ...entityTypes
                .map((t) => ({
                  value: t,
                  label: ENTITY_LABEL[t],
                  count: AUDIT_EVENTS.filter((e) => e.entityType === t).length,
                }))
                .filter((o) => o.count > 0),
              {
                value: "system",
                label: "System",
                count: AUDIT_EVENTS.filter((e) => e.actorType === "system").length,
              },
            ]}
          />
          <SearchField
            label="Search the audit log"
            placeholder="Person, action or record"
            value={query}
            onChange={setQuery}
          />
        </ListToolbar>
        <DataTable
          caption="Audit log"
          columns={columns}
          data={rows}
          getRowId={(e) => e.id}
          pageSize={50}
          empty={{ title: "No events match", description: "Try another filter or search." }}
        />
      </div>
    </div>
  );
}
