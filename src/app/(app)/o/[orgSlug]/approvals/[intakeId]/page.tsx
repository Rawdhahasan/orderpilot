import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { CustomerStatusBadge, IntakeStatusBadge } from "@/components/status/status-badge";
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
import { compare, lineTotal, sumMoney } from "@/domain/money/decimal";
import { EntityTimeline } from "@/features/audit/timeline";
import { ExceptionsPanel } from "@/features/review/exceptions-panel";
import { toPanel } from "@/features/review/panel";
import { loadReview } from "@/features/review/server";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

import { DecisionPanel } from "./decision-panel";

export const metadata: Metadata = { title: "Approval" };

const SOURCE_LABELS: Record<string, string> = {
  po_price: "PO price",
  customer_price: "Customer price",
  list_price: "List price",
};

/** FR-APR-02: everything the approver needs on one page. */
export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ orgSlug: string; intakeId: string }>;
}) {
  const { orgSlug, intakeId } = await params;
  const { supabase, workspace, user } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/approvals/${intakeId}`,
  );
  if (!can(workspace.role, "intake.approve")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Approver or above" action="approve customer POs" />
      </Card>
    );
  }
  if (!/^[0-9a-f-]{36}$/.test(intakeId)) notFound();
  const snapshot = await loadReview(supabase, intakeId);
  if (!snapshot || snapshot.intake.organization_id !== workspace.id) notFound();
  const { intake } = snapshot;
  const fmt = workspaceFormat(workspace);
  const customer = intake.customer as {
    name: string;
    status: "active" | "on_hold" | "inactive";
    hold_reason: string | null;
  } | null;
  const active = snapshot.lines.filter((l) => !l.removed_at);
  const removed = snapshot.lines.filter((l) => l.removed_at);
  const totals = active
    .filter((l) => l.quantity !== null && l.unit_price !== null)
    .map((l) => lineTotal(String(l.quantity), String(l.unit_price)));
  const exceptions = toPanel(snapshot);
  const openBlocking = exceptions.filter((e) => e.status === "open" && e.severity === "blocking");
  const independent = snapshot.org.require_independent_approval && intake.submitted_by === user.id;
  const shipAddress = intake.ship_to_address_id
    ? snapshot.addresses.find((a) => a.id === intake.ship_to_address_id)
    : null;
  const ship = (shipAddress ?? intake.ship_to) as Record<string, string> | null;
  const { data: salesOrder } = intake.sales_order_id
    ? await supabase
        .from("sales_orders")
        .select("order_number")
        .eq("id", intake.sales_order_id)
        .maybeSingle()
    : { data: null };
  const orderNumber = salesOrder?.order_number ?? "";

  // FR-APR-02: values changed from the AI suggestion.
  const changes: string[] = [];
  for (const [field, meta] of Object.entries(
    (intake.field_meta ?? {}) as Record<string, { state?: string; ai_value?: unknown }>,
  )) {
    if (meta?.state === "edited")
      changes.push(`${field.replaceAll("_", " ")}: AI suggested ${String(meta.ai_value ?? "–")}`);
  }
  for (const l of active) {
    for (const [field, meta] of Object.entries(
      (l.field_meta ?? {}) as Record<
        string,
        { state?: string; ai_value?: unknown; price_decision?: string }
      >,
    )) {
      if (meta?.state === "edited")
        changes.push(
          `Line ${l.line_no} ${field.replaceAll("_", " ")}: AI suggested ${String(meta.ai_value ?? "–")}`,
        );
      if (meta?.price_decision)
        changes.push(
          `Line ${l.line_no}: price decision "${meta.price_decision === "po" ? "use PO price" : meta.price_decision === "expected" ? "use expected price" : "entered by reviewer"}"`,
        );
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title={
          <>
            Approve <span className="font-mono">{intake.reference}</span>
          </>
        }
        description={`${customer?.name ?? "No customer"} · PO ${intake.customer_po_number ?? "–"} · submitted by ${intake.submitter?.full_name ?? "–"} ${fmt.dateTime(intake.submitted_at)}`}
        meta={<IntakeStatusBadge status={intake.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-small sm:grid-cols-3">
              <div>
                <p className="text-subtle-foreground">Customer</p>
                <p className="font-medium text-navy-900">{customer?.name ?? "–"}</p>
                {customer ? <CustomerStatusBadge status={customer.status} /> : null}
                {customer?.hold_reason ? (
                  <p className="text-caption text-warning-800">{customer.hold_reason}</p>
                ) : null}
              </div>
              <div>
                <p className="text-subtle-foreground">Ship to</p>
                <address className="not-italic text-navy-900">
                  {ship
                    ? [
                        ship.line1,
                        [ship.city, ship.region, ship.postal_code].filter(Boolean).join(", "),
                        ship.country_code,
                      ]
                        .filter(Boolean)
                        .map((x) => (
                          <span key={x} className="block">
                            {x}
                          </span>
                        ))
                    : "–"}
                </address>
              </div>
              <div>
                <p className="text-subtle-foreground">Total</p>
                <p className="text-h2 font-semibold text-navy-900 tabular-nums">
                  {fmt.money(sumMoney(totals))}
                </p>
                {intake.document_total !== null ? (
                  <p className="text-caption text-subtle-foreground">
                    Printed total {fmt.money(intake.document_total)}
                  </p>
                ) : null}
                {intake.requested_delivery_date ? (
                  <p className="text-caption text-subtle-foreground">
                    Requested {fmt.date(intake.requested_delivery_date)}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((l) => {
                  const p = l.product as {
                    sku: string;
                    name: string;
                    selling_uom: string;
                    quantity_decimals: number;
                    track_inventory: boolean;
                  } | null;
                  const available =
                    p?.track_inventory && l.product_id ? snapshot.stock.get(l.product_id) : null;
                  const short =
                    available !== null &&
                    available !== undefined &&
                    l.quantity !== null &&
                    compare(String(l.quantity), available) > 0;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{l.line_no}</TableCell>
                      <TableCell>
                        <span className="font-mono">{p?.sku}</span> · {p?.name}
                        {l.customer_part_number ? (
                          <span className="block text-caption text-subtle-foreground">
                            Their part {l.customer_part_number}
                            {l.remember_alias ? " (will be remembered)" : ""}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.qty(l.quantity, p?.selling_uom ?? "", p?.quantity_decimals ?? 3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.unitPrice(l.unit_price)}
                        <span className="block text-caption text-subtle-foreground">
                          {SOURCE_LABELS[l.price_source ?? ""] ?? ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.quantity !== null && l.unit_price !== null
                          ? fmt.money(lineTotal(String(l.quantity), String(l.unit_price)))
                          : "–"}
                      </TableCell>
                      <TableCell
                        className={
                          short
                            ? "text-right font-medium text-warning-800 tabular-nums"
                            : "text-right tabular-nums"
                        }
                      >
                        {p?.track_inventory ? (available ?? "0") : "Not stocked"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {removed.length ? (
              <CardContent className="text-small text-subtle-foreground">
                Removed by the reviewer:{" "}
                {removed
                  .map(
                    (l) => `line ${l.line_no}${l.removed_reason ? ` (${l.removed_reason})` : ""}`,
                  )
                  .join(", ")}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardContent className="pt-5">
              <ExceptionsPanel
                exceptions={exceptions}
                slug={orgSlug}
                intakeId={intakeId}
                canOverride={can(workspace.role, "exception.override")}
                canAcknowledge={false}
              />
            </CardContent>
          </Card>

          <section aria-labelledby="history-heading">
            <SectionHeading id="history-heading">History</SectionHeading>
            <Card>
              <CardContent className="pt-4">
                <EntityTimeline
                  supabase={supabase}
                  entityType="inbound_order"
                  entityId={intakeId}
                  format={fmt.dateTime}
                />
              </CardContent>
            </Card>
          </section>
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Decision</CardTitle>
            </CardHeader>
            <CardContent>
              {intake.status === "pending_approval" ? (
                <DecisionPanel
                  scope={{ slug: orgSlug, intakeId, version: intake.version }}
                  canApprove={!independent}
                  blockedReason={
                    independent
                      ? "You submitted this order. Independent approval is on, so another approver must approve it."
                      : openBlocking.length
                        ? `${openBlocking.length} exception${openBlocking.length === 1 ? "" : "s"} need an override before approval.`
                        : null
                  }
                  productNames={Object.fromEntries(
                    active
                      .filter((l) => l.product_id)
                      .map((l) => [
                        l.product_id!,
                        (l.product as { name: string } | null)?.name ?? "",
                      ]),
                  )}
                />
              ) : (
                <p role="status" className="text-small text-subtle-foreground">
                  This order is {intake.status.replaceAll("_", " ")}.{" "}
                  {intake.sales_order_id ? (
                    <>
                      Sales order{" "}
                      <Link
                        href={`/o/${orgSlug}/sales-orders/${intake.sales_order_id}`}
                        className="font-mono font-semibold text-primary underline"
                      >
                        {orderNumber}
                      </Link>
                    </>
                  ) : null}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reviewer notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-small">
              <p>
                {intake.submit_note ?? <span className="text-subtle-foreground">No note.</span>}
              </p>
              <p className="font-medium text-navy-900">Changed from the AI suggestion</p>
              {changes.length ? (
                <ul className="list-disc pl-5" data-testid="ai-changes">
                  {changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-subtle-foreground">Nothing was changed.</p>
              )}
              <p>
                <Link
                  href={`/o/${orgSlug}/customer-pos/${intakeId}`}
                  className="font-medium text-primary hover:underline"
                >
                  Open the review and original document
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
