import { Download, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { IntakeStatusBadge } from "@/components/status/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { EntityTimeline } from "@/features/audit/timeline";
import { ExceptionsPanel } from "@/features/review/exceptions-panel";
import { toPanel } from "@/features/review/panel";
import { loadReview, prepareDraft } from "@/features/review/server";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

import {
  AssignButton,
  CancelPanel,
  ExtractionPoller,
  FailedActions,
  SubmitPanel,
} from "./intake-controls";
import { ReviewWorkspace, type ReviewLine, type ReviewProduct } from "./review-workspace";

export const metadata: Metadata = { title: "Customer PO" };

export default async function IntakePage({
  params,
}: {
  params: Promise<{ orgSlug: string; intakeId: string }>;
}) {
  const { orgSlug, intakeId } = await params;
  const { supabase, workspace, user } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/customer-pos/${intakeId}`,
  );
  if (!/^[0-9a-f-]{36}$/.test(intakeId)) notFound();
  let snapshot = await loadReview(supabase, intakeId);
  if (!snapshot || snapshot.intake.organization_id !== workspace.id) notFound();

  const canReview = can(workspace.role, "intake.review");
  if (
    canReview &&
    snapshot.intake.status === "in_review" &&
    snapshot.intake.validated_version === null
  ) {
    await prepareDraft(supabase, intakeId);
    snapshot = (await loadReview(supabase, intakeId))!;
  }
  const { intake } = snapshot;
  const fmt = workspaceFormat(workspace);
  const scope = { slug: orgSlug, intakeId, version: intake.version };
  const doc = intake.document as {
    id: string;
    original_filename: string;
    mime_type: string;
    page_count: number | null;
  } | null;
  const customer = intake.customer as { name: string } | null;
  const simulated = snapshot.run?.provider === "simulated";
  const exceptions = toPanel(snapshot);
  const openBlocking = exceptions.filter((e) => e.status === "open" && e.severity === "blocking");
  const editable = canReview && intake.status === "in_review";

  const [{ data: customers }, { data: profile }] = await Promise.all([
    editable
      ? supabase
          .from("customers")
          .select("id, name, status")
          .eq("organization_id", workspace.id)
          .neq("status", "inactive")
          .order("name")
          .limit(1000)
      : Promise.resolve({
          data: customer
            ? [{ id: intake.customer_id!, name: customer.name, status: "active" }]
            : [],
        }),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
  ]);

  const lines: ReviewLine[] = snapshot.lines.map((l) => {
    const p = l.product as ReviewProduct | null;
    const expected = snapshot!.expected.get(l.id);
    return {
      id: l.id,
      key: l.id,
      line_no: l.line_no,
      customer_part_number: l.customer_part_number,
      description: l.description,
      po_quantity: l.po_quantity === null ? null : String(l.po_quantity),
      po_uom: l.po_uom,
      po_unit_price: l.po_unit_price === null ? null : String(l.po_unit_price),
      product: p,
      match_method: l.match_method,
      match_score: l.match_score,
      remember_alias: l.remember_alias,
      quantity: l.quantity === null ? null : String(l.quantity),
      uom_conversion_note: l.uom_conversion_note,
      unit_price: l.unit_price === null ? null : String(l.unit_price),
      price_source: l.price_source,
      expected_price: expected?.price ?? null,
      expected_source: expected?.source ?? null,
      available: p && l.product_id ? (snapshot!.stock.get(l.product_id) ?? null) : null,
      field_meta: (l.field_meta ?? {}) as ReviewLine["field_meta"],
      removed: Boolean(l.removed_at),
    };
  });

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        title={
          <>
            <span className="font-mono">{intake.reference}</span>
            {intake.customer_po_number ? (
              <span className="font-normal text-subtle-foreground">
                {" "}
                · PO {intake.customer_po_number}
              </span>
            ) : null}
          </>
        }
        description={`${customer?.name ?? "Customer not selected"} · received ${fmt.dateTime(intake.created_at)}${intake.assignee ? ` · assigned to ${intake.assignee.full_name}` : ""}`}
        meta={<IntakeStatusBadge status={intake.status} />}
        actions={
          canReview && ["extracting", "extraction_failed", "in_review"].includes(intake.status) ? (
            <AssignButton scope={scope} />
          ) : null
        }
      />

      {simulated ? (
        <p
          className="inline-flex items-center gap-1.5 rounded-md bg-ai-50 px-3 py-1.5 text-small font-medium text-ai-800"
          data-testid="simulated-label"
        >
          <Sparkles aria-hidden className="size-4" />
          Simulated extraction (demo). Values come from a prepared fixture, not from AI.
        </p>
      ) : null}
      {intake.manual_entry && intake.status === "in_review" ? (
        <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-small text-blue-700">
          No values were extracted from this document. Enter the order from the document; nothing
          has been guessed.
        </p>
      ) : null}

      {intake.status === "extracting" ? (
        <Card>
          <CardContent className="pt-5 text-body">
            <ExtractionPoller intakeId={intakeId} />
            <p className="font-medium text-navy-900">Reading the document…</p>
            <p className="text-small text-subtle-foreground">
              Attempt {snapshot.run?.attempt ?? 1} of {snapshot.run?.max_attempts ?? 3}. This page
              updates by itself.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {intake.status === "extraction_failed" ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="font-medium text-navy-900">Extraction failed</p>
            <p className="text-small text-subtle-foreground">
              {snapshot.run?.error_message ?? "The document could not be read."}
            </p>
            {canReview ? <FailedActions scope={scope} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {intake.status === "pending_approval" ? (
        <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-small text-blue-700">
          Submitted by {intake.submitter?.full_name ?? "a reviewer"}{" "}
          {fmt.dateTime(intake.submitted_at)}.{" "}
          {can(workspace.role, "intake.approve") ? (
            <Link href={`/o/${orgSlug}/approvals/${intakeId}`} className="font-medium underline">
              Open the approval summary
            </Link>
          ) : (
            "Waiting for an approver."
          )}
        </p>
      ) : null}
      {intake.status === "approved" && intake.sales_order_id ? (
        <p role="status" className="rounded-md bg-success-50 px-3 py-2 text-small text-success-800">
          Approved by {intake.decider?.full_name ?? "an approver"}.{" "}
          <Link
            href={`/o/${orgSlug}/sales-orders/${intake.sales_order_id}`}
            className="font-medium underline"
          >
            View the sales order
          </Link>
        </p>
      ) : null}
      {intake.status === "rejected" ? (
        <p role="status" className="rounded-md bg-danger-50 px-3 py-2 text-small text-danger-800">
          Rejected by {intake.decider?.full_name ?? "an approver"}: {intake.decision_reason}
        </p>
      ) : null}
      {intake.status === "cancelled" ? (
        <p
          role="status"
          className="rounded-md bg-neutral-50 px-3 py-2 text-small text-body-foreground"
        >
          Cancelled ({intake.cancel_reason?.replaceAll("_", " ")})
          {intake.cancel_note ? `: ${intake.cancel_note}` : "."}
        </p>
      ) : null}
      {intake.status === "in_review" && intake.decision_reason && intake.decided_by ? (
        <p role="status" className="rounded-md bg-warning-50 px-3 py-2 text-small text-warning-800">
          Changes requested by {intake.decider?.full_name}: {intake.decision_reason}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="xl:sticky xl:top-4 xl:self-start">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="truncate">{doc?.original_filename ?? "Document"}</CardTitle>
            {doc ? (
              <a
                href={`/api/documents/${doc.id}?download=1`}
                className="inline-flex items-center gap-1 text-small font-medium text-primary hover:underline"
              >
                <Download aria-hidden className="size-4" />
                Download
              </a>
            ) : null}
          </CardHeader>
          <CardContent>
            {doc?.mime_type === "application/pdf" ? (
              <iframe
                src={`/api/documents/${doc.id}`}
                title={`Original document ${doc.original_filename}`}
                className="h-[70vh] w-full rounded-md border border-border bg-neutral-50"
              />
            ) : doc ? (
              // eslint-disable-next-line @next/next/no-img-element -- streamed original, not optimisable
              <img
                src={`/api/documents/${doc.id}`}
                alt={`Original document ${doc.original_filename}`}
                className="w-full rounded-md border border-border"
              />
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {["in_review", "pending_approval", "approved", "rejected", "cancelled"].includes(
            intake.status,
          ) ? (
            <ReviewWorkspace
              slug={orgSlug}
              organizationId={workspace.id}
              intakeId={intakeId}
              version={intake.version}
              canEdit={editable}
              confidenceThreshold={Number(snapshot.org.confidence_threshold)}
              currentUser={profile?.full_name ?? ""}
              money={{ locale: workspace.locale, currency: workspace.currency }}
              customers={customers ?? []}
              addresses={snapshot.addresses.filter((a) => a.type === "shipping")}
              header={{
                customer_id: intake.customer_id,
                customer_po_number: intake.customer_po_number,
                po_date: intake.po_date,
                requested_delivery_date: intake.requested_delivery_date,
                currency: intake.currency,
                payment_terms: intake.payment_terms,
                document_total:
                  intake.document_total === null ? null : String(intake.document_total),
                notes: intake.notes,
                ship_to: intake.ship_to as Record<string, string> | null,
                ship_to_address_id: intake.ship_to_address_id,
                field_meta: (intake.field_meta ?? {}) as Record<string, Record<string, unknown>>,
              }}
              lines={lines}
            />
          ) : null}

          {["in_review", "pending_approval"].includes(intake.status) ? (
            <Card>
              <CardContent className="pt-5">
                <ExceptionsPanel
                  exceptions={exceptions}
                  slug={orgSlug}
                  intakeId={intakeId}
                  canOverride={can(workspace.role, "exception.override")}
                  canAcknowledge={editable}
                />
              </CardContent>
            </Card>
          ) : null}

          {editable ? (
            <Card>
              <CardHeader>
                <CardTitle>Finish</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SubmitPanel
                  scope={scope}
                  blocking={openBlocking.filter((e) => !e.overridable).length}
                  overrideRequired={openBlocking.filter((e) => e.overridable).length}
                />
                <CancelPanel scope={scope} />
              </CardContent>
            </Card>
          ) : null}
          <section aria-labelledby="intake-history">
            <SectionHeading id="intake-history">History</SectionHeading>
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
          {canReview && intake.status === "extraction_failed" ? (
            <Card>
              <CardContent className="pt-5">
                <CancelPanel scope={scope} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
