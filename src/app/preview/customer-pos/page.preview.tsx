import type { Metadata } from "next";
import { Suspense } from "react";

import { CustomerPosScreen } from "@/preview/screens/customer-pos-screen";

export const metadata: Metadata = { title: "Customer POs" };

export default function Page() {
  return (
    <Suspense>
      <CustomerPosScreen />
    </Suspense>
  );
}
