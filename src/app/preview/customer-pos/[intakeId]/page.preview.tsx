import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { intakeById } from "@/preview/fixtures";
import { IntakeScreen } from "@/preview/screens/intake-screen";

type Params = { params: Promise<{ intakeId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { intakeId } = await params;
  return { title: intakeById(intakeId)?.reference ?? "Customer PO" };
}

export default async function Page({ params }: Params) {
  const { intakeId } = await params;
  const intake = intakeById(intakeId);
  if (!intake) notFound();
  if (intake.status === "pending_approval") redirect(`/preview/approvals/${intake.id}`);
  if (intake.status === "approved" && intake.salesOrderId)
    redirect(`/preview/sales-orders/${intake.salesOrderId}`);
  return <IntakeScreen intake={intake} />;
}
