import type { Metadata } from "next";

import { ComingSoon } from "@/features/workspace/coming-soon";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Customers" };

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireWorkspace(orgSlug, `/o/${orgSlug}/customers`);
  return (
    <ComingSoon
      title="Customers"
      description="The businesses that send you purchase orders."
      phase="3"
      feature="Customer management"
    />
  );
}
