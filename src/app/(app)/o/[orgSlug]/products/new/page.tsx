import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card, CardContent } from "@/components/ui/card";
import { can } from "@/domain/auth/permissions";
import { requireWorkspace } from "@/server/auth/context";

import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/products/new`);
  if (!can(workspace.role, "product.edit")) {
    return (
      <Card>
        <NoPermissionState
          roleNeeded="Inventory Manager, Admin or Owner"
          action="create products"
        />
      </Card>
    );
  }
  const { data: uoms } = await supabase.from("uom_codes").select("code, name").order("code");
  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageHeader title="New product" />
      <Card>
        <CardContent className="pt-5">
          <ProductForm organizationId={workspace.id} slug={orgSlug} uoms={uoms ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
