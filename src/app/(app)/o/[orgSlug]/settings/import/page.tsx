import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { requireWorkspace } from "@/server/auth/context";

import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/settings/import`);
  if (!can(workspace.role, "import.run")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Owner or Admin" action="import data" />
      </Card>
    );
  }
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader
        title="Import from CSV"
        description="Check the file first: every row is validated and nothing is written until you confirm. An import is all or nothing."
      />
      <Card>
        <CardContent className="pt-5">
          <ImportForm organizationId={workspace.id} slug={orgSlug} />
        </CardContent>
      </Card>
    </div>
  );
}
