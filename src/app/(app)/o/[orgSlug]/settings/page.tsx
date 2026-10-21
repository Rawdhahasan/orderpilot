import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { requireWorkspace } from "@/server/auth/context";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/settings`);
  if (!can(workspace.role, "settings.change")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Owner or Admin" action="change workspace settings" />
      </Card>
    );
  }
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, slug, name, base_currency, sales_order_prefix, timezone, price_tolerance_pct, confidence_threshold, duplicate_lookback_days, require_independent_approval",
    )
    .eq("id", workspace.id)
    .single();
  if (!org) throw new Error("Workspace settings could not be loaded.");

  return (
    <div className="mx-auto max-w-[960px] space-y-5">
      <PageHeader
        title="Settings"
        description="Workspace details and order rules."
        actions={
          <span className="flex flex-wrap gap-4">
            <Link
              href={`/o/${orgSlug}/settings/members`}
              className="text-small font-medium text-primary hover:underline"
            >
              Members and invitations
            </Link>
            {can(workspace.role, "import.run") ? (
              <Link
                href={`/o/${orgSlug}/settings/import`}
                className="text-small font-medium text-primary hover:underline"
              >
                Import from CSV
              </Link>
            ) : null}
          </span>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Workspace and order rules</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-small text-subtle-foreground">
            Base currency:{" "}
            <strong className="font-medium text-navy-900">{org.base_currency}</strong>
          </p>
          <SettingsForm
            isOwner={workspace.role === "owner"}
            values={{
              ...org,
              price_tolerance_pct: Number(org.price_tolerance_pct),
              confidence_threshold: Number(org.confidence_threshold),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
