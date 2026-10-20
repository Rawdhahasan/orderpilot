import type { Metadata } from "next";

import { ApprovalsScreen } from "@/preview/screens/approvals-screen";

export const metadata: Metadata = { title: "Approvals" };

export default function Page() {
  return <ApprovalsScreen />;
}
