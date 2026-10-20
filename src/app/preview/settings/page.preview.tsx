import type { Metadata } from "next";

import { SettingsScreen } from "@/preview/screens/settings-screen";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsScreen />;
}
