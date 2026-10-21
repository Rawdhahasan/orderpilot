import type { Metadata } from "next";

import { ComingSoon } from "@/features/workspace/coming-soon";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Approvals" };

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireWorkspace(orgSlug, `/o/${orgSlug}/approvals`);
  return (
    <ComingSoon
      title="Approvals"
      description="Customer POs waiting for a decision."
      phase="5"
      feature="The approval queue"
    />
  );
}
