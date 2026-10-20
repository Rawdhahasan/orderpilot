import type { Metadata } from "next";

import { InventoryScreen } from "@/preview/screens/inventory-screen";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return <InventoryScreen />;
}
