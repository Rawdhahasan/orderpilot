import type { Metadata } from "next";
import Link from "next/link";

import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { can } from "@/domain/auth/permissions";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { workspaceFormat } from "@/features/workspace/format";
import { formatRelative } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Dashboard" };

type Summary = {
  intakes: Record<string, number>;
  assigned_to_me: number;
  override_required: number;
  oldest_pending_at: string | null;
  sales_orders_30d: number;
  sales_value_30d: number;
  to_fulfil: number;
  open_backorders: number;
  stock: Record<string, number>;
  median_minutes_to_approval_30d: number | null;
  approved_30d: number;
  touchless_30d: number;
  extraction_failures_7d: number;
};

/** Figures need a minimum sample before they mean anything (FR-DASH-05). */
const MIN_SAMPLE = 5;

function duration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 48) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

/** FR-DASH-01 to 06: role-aware, real data only, no placeholder numbers. */
export default async function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, workspace, aal } = await requireWorkspace(orgSlug, `/o/${orgSlug}/dashboard`);
  const { data } = await supabase.rpc("dashboard_summary", { p_organization_id: workspace.id });
  const s = data as unknown as Summary;
  const fmt = workspaceFormat(workspace);
  const base = `/o/${orgSlug}`;
  const role = workspace.role;
  const enough = s.approved_30d >= MIN_SAMPLE;
  const count = (status: string) => s.intakes[status] ?? 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${workspace.name} · You are signed in as ${ROLE_LABELS[role]}${aal === "aal2" ? " with two-factor authentication" : ""}`}
      />

      <section aria-labelledby="work-heading">
        <SectionHeading id="work-heading">Needs your attention</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {can(role, "intake.review") ? (
            <>
              <StatTile
                label="In review"
                value={String(count("in_review"))}
                href={`${base}/customer-pos?status=in_review`}
                context={s.assigned_to_me ? `${s.assigned_to_me} assigned to you` : undefined}
              />
              <StatTile
                label="Extraction failed"
                value={String(count("extraction_failed"))}
                href={`${base}/customer-pos?status=extraction_failed`}
                emphasis={count("extraction_failed") ? "attention" : "default"}
              />
            </>
          ) : null}
          {can(role, "intake.approve") ? (
            <StatTile
              label="Waiting for approval"
              value={String(count("pending_approval"))}
              href={`${base}/approvals`}
              emphasis={s.override_required ? "attention" : "default"}
              context={
                count("pending_approval")
                  ? `${s.override_required ? `${s.override_required} need an override · ` : ""}oldest ${s.oldest_pending_at ? formatRelative(s.oldest_pending_at, new Date()) : ""}`
                  : undefined
              }
            />
          ) : null}
          {can(role, "sales_order.fulfil") ? (
            <StatTile
              label="To fulfil"
              value={String(s.to_fulfil)}
              href={`${base}/sales-orders?status=confirmed`}
            />
          ) : null}
          <StatTile
            label="Open backorders"
            value={String(s.open_backorders)}
            href={`${base}/sales-orders?status=confirmed`}
            context="Lines not reserved at approval"
            emphasis={s.open_backorders ? "attention" : "default"}
          />
          {can(role, "stock.change") || can(role, "intake.approve") ? (
            <StatTile
              label="Stock alerts"
              value={String(
                (s.stock.low ?? 0) + (s.stock.out_of_stock ?? 0) + (s.stock.over_committed ?? 0),
              )}
              href={`${base}/inventory`}
              context={`${s.stock.low ?? 0} low · ${s.stock.out_of_stock ?? 0} out · ${s.stock.over_committed ?? 0} over-committed`}
              emphasis={s.stock.over_committed ? "attention" : "default"}
            />
          ) : null}
          {s.extraction_failures_7d ? (
            <StatTile
              label="Extraction failures (7 days)"
              value={String(s.extraction_failures_7d)}
              href={`${base}/customer-pos?status=extraction_failed`}
            />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="figures-heading">
        <SectionHeading id="figures-heading">Last 30 days</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Sales orders"
            value={String(s.sales_orders_30d)}
            href={`${base}/sales-orders`}
          />
          <StatTile
            label="Order value"
            value={fmt.money(s.sales_value_30d)}
            context="Confirmed and fulfilled, excluding cancelled"
          />
          <StatTile
            label="Median time to approval"
            value={
              enough && s.median_minutes_to_approval_30d !== null
                ? duration(s.median_minutes_to_approval_30d)
                : null
            }
            context="From upload to approval"
            insufficientReason={`Shown once at least ${MIN_SAMPLE} orders were approved in 30 days.`}
          />
          <StatTile
            label="Approved without edits"
            value={enough ? `${Math.round((s.touchless_30d / s.approved_30d) * 100)}%` : null}
            context="No AI value had to be changed"
            insufficientReason={`Shown once at least ${MIN_SAMPLE} orders were approved in 30 days.`}
          />
        </div>
      </section>

      {can(role, "intake.upload") && Object.keys(s.intakes).length === 0 ? (
        <p className="text-small text-subtle-foreground">
          No customer POs yet.{" "}
          <Link
            href={`${base}/customer-pos/upload`}
            className="font-medium text-primary hover:underline"
          >
            Upload the first one
          </Link>
          .
        </p>
      ) : null}
      {can(role, "member.manage") ? (
        <p className="text-small">
          <Link
            href={`${base}/settings/members`}
            className="font-medium text-primary hover:underline"
          >
            Manage members and invitations
          </Link>
        </p>
      ) : null}
    </div>
  );
}
