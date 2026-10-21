import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/states/phase-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { workspace, aal } = await requireWorkspace(orgSlug, `/o/${orgSlug}/dashboard`);
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${workspace.name} · You are signed in as ${ROLE_LABELS[workspace.role]}`}
      />
      <section aria-labelledby="work-heading">
        <SectionHeading id="work-heading">Needs your attention</SectionHeading>
        <Card>
          <CardContent className="pt-4">
            <PhaseNotice phase="5" feature="The live work queue, pipeline and figures" />
            <p className="mt-3 text-small text-subtle-foreground">
              Figures appear here only when they come from real activity in this workspace. Nothing
              is shown until then.
            </p>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-small text-body-foreground">
          <p>
            Role:{" "}
            <strong className="font-medium text-navy-900">{ROLE_LABELS[workspace.role]}</strong>
          </p>
          <p>
            Two-factor authentication:{" "}
            <strong className="font-medium text-navy-900">
              {aal === "aal2" ? "verified for this session" : "not used for this session"}
            </strong>
          </p>
          {can(workspace.role, "member.manage") ? (
            <p>
              <Link
                href={`/o/${orgSlug}/settings/members`}
                className="font-medium text-primary hover:underline"
              >
                Manage members and invitations
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
