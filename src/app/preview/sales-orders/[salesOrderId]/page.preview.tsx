import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { salesOrderById } from "@/preview/fixtures";
import { SalesOrderDetailScreen } from "@/preview/screens/sales-order-detail-screen";

type Params = { params: Promise<{ salesOrderId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { salesOrderId } = await params;
  return { title: salesOrderById(salesOrderId)?.number ?? "Sales order" };
}

export default async function Page({ params }: Params) {
  const { salesOrderId } = await params;
  const order = salesOrderById(salesOrderId);
  if (!order) notFound();
  return <SalesOrderDetailScreen order={order} />;
}
