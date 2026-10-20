import type { Metadata } from "next";

import { ComponentsScreen } from "@/preview/screens/components-screen";

export const metadata: Metadata = { title: "Component gallery" };

export default function Page() {
  return <ComponentsScreen />;
}
