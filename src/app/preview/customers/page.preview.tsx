import type { Metadata } from "next";

import { CustomersScreen } from "@/preview/screens/customers-screen";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return <CustomersScreen />;
}
