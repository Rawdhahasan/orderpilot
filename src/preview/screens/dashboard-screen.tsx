"use client";

import Link from "next/link";

import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import {
  SalesOrderStatusBadge,
  StockStatusBadge,
  INTAKE_STATUS,
} from "@/components/status/status-badge";
import { Timeline, type TimelineKind } from "@/components/timeline/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { cn } from "@/lib/cn";

import {
  WORKSPACE,
  assignedTo,
  customerById,
  dashboardMetrics,
  inventoryWarnings,
  openBackorders,
  pipeline,
  recentActivity,
  recentSalesOrders,
  salesOrderSubtotal,
  type PreviewAuditEvent,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt, previewHref } from "../format";
import { usePersona } from "../persona";

export function activityKind(action: string): TimelineKind {
  if (action.startsWith("document.")) return "upload";
  if (action.startsWith("extraction_run.")) return "extraction";
  if (action.endsWith("field_edited")) return "edit";
  if (action.includes("overridden")) return "override";
  if (action.endsWith("approved") || action.endsWith("fulfilled")) return "approval";
  if (action.startsWith("inventory.")) return "stock";
  return "other";
}

export function toTimeline(events: PreviewAuditEvent[]) {
  return events.map((event) => ({
    id: event.id,
    kind: activityKind(event.action),
    actor: event.actor,
    action: (
      <>
        {event.summary}{" "}
        {event.entityHref ? (
          <Link
            href={previewHref(event.entityHref)}
            className="font-mono text-small text-primary hover:underline"
          >
            {event.entityLabel}
          </Link>
        ) : (
          <span className="font-mono text-small">{event.entityLabel}</span>
        )}
      </>
    ),
    when: fmt.relative(event.at),
    whenAbsolute: fmt.dateTime(event.at),
    emphasis: event.action.endsWith("approved"),
  }));
}

export function DashboardScreen() {
  const { user, role } = usePersona();
  const m = dashboardMetrics();
  const mine = assignedTo(user.id);
  const canReview = can(role, "intake.review");
  const canApprove = can(role, "intake.approve");
  const canFulfil = can(role, "sales_order.fulfil");
  const warnings = inventoryWarnings();
  const backorders = openBackorders();

  const attention = [
    canReview && {
      label: "Assigned to me",
      value: String(mine.length),
      context: mine.length
        ? `Oldest received ${fmt.relative(mine[mine.length - 1]!.receivedAt)}`
        : "Nothing waiting for you",
      href: previewHref("customer-pos?assigned=me"),
    },
    canReview && {
      label: "Awaiting review",
      value: String(m.inReview),
      context: `${m.unassignedInReview} unassigned${m.inReviewOldestMs ? ` · oldest ${fmt.duration(m.inReviewOldestMs)}` : ""}`,
      href: previewHref("customer-pos?status=in_review"),
    },
    canApprove && {
      label: "Awaiting approval",
      value: String(m.pending),
      context: m.pendingOldestMs
        ? `Oldest waiting ${fmt.duration(m.pendingOldestMs)}`
        : "Queue is clear",
      href: previewHref("approvals"),
      emphasis: "attention" as const,
    },
    canApprove && {
      label: "Override required",
      value: String(m.overrideRequired),
      context: "Submitted intakes needing an approver override",
      href: previewHref("approvals"),
    },
    canReview && {
      label: "Extraction failed",
      value: String(m.failed.length),
      context: m.failed[0]
        ? `${m.failed[0].reference} · ${m.failed[0].failureReason}`
        : "No failures",
      href: previewHref("customer-pos?status=extraction_failed"),
    },
    canFulfil && {
      label: "Awaiting fulfilment",
      value: String(m.awaitingFulfilment),
      context: "Confirmed sales orders",
      href: previewHref("sales-orders?status=confirmed"),
    },
  ].filter(Boolean) as {
    label: string;
    value: string;
    context: string;
    href: string;
    emphasis?: "attention";
  }[];

  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      <PageHeader
        title="Dashboard"
        description={`${WORKSPACE.name} · ${fmt.date("2026-10-20")}`}
        meta={
          <>
            <FictionalBadge />
            <span className="text-caption text-muted-foreground">
              Every figure on this page is computed from fictional preview fixtures.
            </span>
          </>
        }
      />

      {attention.length > 0 ? (
        <section aria-labelledby="attention-heading">
          <SectionHeading id="attention-heading">Needs your attention</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {attention.map((tile) => (
              <StatTile key={tile.label} {...tile} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="pipeline-heading">
        <SectionHeading id="pipeline-heading">Pipeline</SectionHeading>
        <Card>
          <ol className="grid divide-y divide-border sm:grid-cols-5 sm:divide-x sm:divide-y-0">
            {pipeline().map((stage) => (
              <li key={stage.status}>
                <Link
                  href={previewHref(`customer-pos?status=${stage.status}`)}
                  className="block px-4 py-3 transition-colors hover:bg-neutral-25"
                >
                  <span className="block text-small text-subtle-foreground">
                    {INTAKE_STATUS[stage.status].label}
                  </span>
                  <span className="mt-0.5 block text-h2 font-semibold tabular text-navy-900">
                    {stage.count}
                  </span>
                  <span className="block text-caption text-muted-foreground">
                    {stage.oldestAgeMs === null
                      ? "None waiting"
                      : `Oldest ${fmt.duration(stage.oldestAgeMs)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section aria-labelledby="figures-heading">
        <SectionHeading id="figures-heading">Key figures</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Total customer POs"
            value={String(m.totalLast30)}
            context="Received in the last 30 days"
            href={previewHref("customer-pos")}
          />
          <StatTile
            label="Approved"
            value={String(m.approvedLast7)}
            context="Sales orders in the last 7 days"
            href={previewHref("sales-orders")}
          />
          <StatTile
            label="Median upload to approval"
            value={
              m.medianUploadToApprovalMs === null ? null : fmt.duration(m.medianUploadToApprovalMs)
            }
            context="Last 7 days"
            insufficientReason="Needs at least 3 approved orders in the last 7 days."
          />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Recent sales orders</CardTitle>
            <Link
              href={previewHref("sales-orders")}
              className="text-small font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <ul className="divide-y divide-border border-t border-border">
            {recentSalesOrders().map((order) => (
              <li key={order.id}>
                <Link
                  href={previewHref(`sales-orders/${order.id}`)}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-neutral-25 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto_auto]"
                >
                  <span className="font-mono text-small text-navy-900">{order.number}</span>
                  <span className="order-3 col-span-2 truncate text-body text-body-foreground sm:order-none sm:col-span-1">
                    {customerById(order.customerId)?.name}
                  </span>
                  <span className="hidden sm:block">
                    <SalesOrderStatusBadge status={order.status} />
                  </span>
                  <span className="text-right text-body font-medium tabular text-navy-900">
                    {fmt.money(salesOrderSubtotal(order))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inventory warnings</CardTitle>
              <Link
                href={previewHref("inventory")}
                className="text-small font-medium text-primary hover:underline"
              >
                Inventory
              </Link>
            </CardHeader>
            <ul className="divide-y divide-border border-t border-border">
              {warnings.map(({ product, status, available }) => (
                <li key={product.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-navy-900">{product.name}</p>
                    <p className="font-mono text-caption text-muted-foreground">{product.sku}</p>
                  </div>
                  <span
                    className={cn(
                      "text-small tabular",
                      available.startsWith("-") ? "text-danger-700" : "text-subtle-foreground",
                    )}
                  >
                    {fmt.qty(available, product.uom, product.quantityDecimals)} available
                  </span>
                  <StockStatusBadge status={status} />
                </li>
              ))}
            </ul>
          </Card>

          {canApprove || canFulfil ? (
            <Card>
              <CardHeader>
                <CardTitle>Open backorders</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border border-t border-border">
                {backorders.map(({ order, line }) => (
                  <li
                    key={`${order.id}-${line.lineNo}`}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-navy-900">{line.name}</p>
                      <Link
                        href={previewHref(`sales-orders/${order.id}`)}
                        className="font-mono text-caption text-primary hover:underline"
                      >
                        {order.number}
                      </Link>
                    </div>
                    <span className="text-small font-medium tabular text-warning-800">
                      {fmt.qty(line.backordered, line.uom)} backordered
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          {can(role, "audit.view") ? (
            <Link
              href={previewHref("audit")}
              className="text-small font-medium text-primary hover:underline"
            >
              Audit log
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>
          <Timeline entries={toTimeline(recentActivity())} />
        </CardContent>
      </Card>
    </div>
  );
}
