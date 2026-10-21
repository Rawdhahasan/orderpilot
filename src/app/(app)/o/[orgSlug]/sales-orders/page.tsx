import type { Metadata } from "next";

import { ComingSoon } from "@/features/workspace/coming-soon";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Sales orders" };

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireWorkspace(orgSlug, `/o/${orgSlug}/sales-orders`);
  return (
    <ComingSoon
      title="Sales orders"
      description="Confirmed orders created by approval."
      phase="5"
      feature="Sales orders"
    />
  );
}
