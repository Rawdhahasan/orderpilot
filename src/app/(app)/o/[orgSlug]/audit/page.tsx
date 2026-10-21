import type { Metadata } from "next";

import { ComingSoon } from "@/features/workspace/coming-soon";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Audit log" };

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireWorkspace(orgSlug, `/o/${orgSlug}/audit`);
  return (
    <ComingSoon
      title="Audit log"
      description="Every important action, who did it and why."
      phase="5"
      feature="The audit log screen"
    />
  );
}
