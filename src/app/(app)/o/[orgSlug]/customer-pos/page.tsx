import type { Metadata } from "next";

import { ComingSoon } from "@/features/workspace/coming-soon";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Customer POs" };

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await requireWorkspace(orgSlug, `/o/${orgSlug}/customer-pos`);
  return (
    <ComingSoon
      title="Customer POs"
      description="Every purchase order received from customers."
      phase="4A"
      feature="Uploading and reviewing customer POs"
    />
  );
}
