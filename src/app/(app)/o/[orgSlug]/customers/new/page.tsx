import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { requireWorkspace } from "@/server/auth/context";

import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/customers/new`);
  if (!can(workspace.role, "customer.edit")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Processor or above" action="create customers" />
      </Card>
    );
  }
  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageHeader
        title="New customer"
        description="Add addresses and part numbers after creating the customer."
      />
      <Card>
        <CardContent className="pt-5">
          <CustomerForm organizationId={workspace.id} slug={orgSlug} />
        </CardContent>
      </Card>
    </div>
  );
}
