import type { Metadata } from "next";

import { ComingSoon } from "@/features/workspace/coming-soon";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Inventory" };

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireWorkspace(orgSlug, `/o/${orgSlug}/inventory`);
  return (
    <ComingSoon
      title="Inventory"
      description="Stock on hand, reserved and available."
      phase="3"
      feature="Inventory management"
    />
  );
}
