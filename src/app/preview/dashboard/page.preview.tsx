import type { Metadata } from "next";

import { DashboardScreen } from "@/preview/screens/dashboard-screen";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <DashboardScreen />;
}
