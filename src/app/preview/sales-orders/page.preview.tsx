import type { Metadata } from "next";
import { Suspense } from "react";

import { SalesOrdersScreen } from "@/preview/screens/sales-orders-screen";

export const metadata: Metadata = { title: "Sales orders" };

export default function Page() {
  return (
    <Suspense>
      <SalesOrdersScreen />
    </Suspense>
  );
}
