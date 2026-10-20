import type { Metadata } from "next";

import { ProductsScreen } from "@/preview/screens/products-screen";

export const metadata: Metadata = { title: "Products" };

export default function Page() {
  return <ProductsScreen />;
}
