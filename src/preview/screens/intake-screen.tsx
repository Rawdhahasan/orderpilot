"use client";

import { LoaderCircle, OctagonAlert, PenLine, RotateCw, XCircle } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { IntakeStatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";

import { customerById, reviewFor, userName, type PreviewIntake } from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt, previewHref } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";
import { ReviewWorkspace } from "../review/review-workspace";

export function IntakeScreen({ intake }: { intake: PreviewIntake }) {
  const { role } = usePersona();

  if (intake.status === "in_review") {
    return <ReviewWorkspace key={intake.id} intake={intake} review={reviewFor(intake.id)} />;
  }

  const customer = customerById(intake.customerId);
  const header = (
    <PageHeader
      title={<span className="font-mono">{intake.reference}</span>}
      description={`${customer?.name ?? "Customer not identified"} · ${intake.fileName} · Received ${fmt.relative(intake.receivedAt)}`}
      meta={
        <>
          <IntakeStatusBadge status={intake.status} />
          <FictionalBadge />
        </>
      }
    />
  );

  if (intake.status === "extracting" || intake.status === "received") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <Card>
          <CardContent className="flex items-start gap-3 pt-4">
            <LoaderCircle
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-subtle-foreground motion-safe:animate-spin"
            />
            <div>
              <p className="text-body font-medium text-navy-900">Reading the document</p>
              <p className="mt-1 text-small text-subtle-foreground">
                Simulated extraction is running. In the product this page updates by itself when it
                finishes, usually within a few seconds. If a job stalls, the scheduled recovery job
                retries it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (intake.status === "extraction_failed") {
    const canAct = can(role, "intake.review");
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <Card className="border-danger-700/30">
          <CardContent className="flex items-start gap-3 pt-4">
            <OctagonAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-700" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-navy-900">
                We couldn&apos;t read this document
              </p>
              <p className="mt-1 text-small text-subtle-foreground">
                {intake.failureReason}. Retrying will not help until the customer sends an
                unprotected copy. You can enter the order manually from the document instead.
              </p>
              {canAct ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={() =>
                      previewOnly(
                        `In the product, ${intake.reference} would open for manual entry.`,
                      )
                    }
                  >
                    <PenLine aria-hidden />
                    Enter manually
                  </Button>
                  <Button
                    onClick={() =>
                      previewOnly(
                        `In the product, a new extraction attempt would be queued for ${intake.reference}.`,
                      )
                    }
                  >
                    <RotateCw aria-hidden />
                    Retry extraction
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      previewOnly(
                        `In the product, ${intake.reference} would be cancelled with a reason.`,
                      )
                    }
                  >
                    <XCircle aria-hidden />
                    Cancel intake
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Closed intakes: rejected or cancelled stay viewable with their reason.
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {header}
      <Card>
        <CardContent className="space-y-2 pt-4">
          <p className="text-body font-medium text-navy-900">
            {intake.status === "cancelled"
              ? "Cancelled"
              : intake.status === "rejected"
                ? "Rejected"
                : "Closed"}
          </p>
          <p className="text-small text-subtle-foreground">
            {intake.cancelReason ?? intake.decisionReason ?? "No reason recorded."}
          </p>
          {intake.assignedTo ? (
            <p className="text-small text-subtle-foreground">
              Handled by {userName(intake.assignedTo)}.
            </p>
          ) : null}
          <p className="pt-2 text-small">
            <Link
              href={previewHref("customer-pos")}
              className="font-medium text-primary hover:underline"
            >
              Back to customer POs
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
