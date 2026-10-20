import type { Metadata } from "next";

import { AuditScreen } from "@/preview/screens/audit-screen";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditScreen />;
}
