import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { requireWorkspace } from "@/server/auth/context";

import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload customer POs" };

export default async function UploadPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, workspace } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/customer-pos/upload`,
  );
  if (!can(workspace.role, "intake.upload")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Processor or above" action="upload customer POs" />
      </Card>
    );
  }
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("organization_id", workspace.id)
    .neq("status", "inactive")
    .order("name")
    .limit(1000);
  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageHeader
        title="Upload customer POs"
        description="Each file becomes one customer PO. Extraction starts automatically."
      />
      <Card>
        <CardContent className="pt-5">
          <UploadForm organizationId={workspace.id} slug={orgSlug} customers={customers ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
