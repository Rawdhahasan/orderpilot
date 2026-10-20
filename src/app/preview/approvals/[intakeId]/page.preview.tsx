import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { approvalFor, intakeById } from "@/preview/fixtures";
import { ApprovalSummaryScreen } from "@/preview/screens/approval-summary-screen";

type Params = { params: Promise<{ intakeId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { intakeId } = await params;
  return { title: `Approve ${intakeById(intakeId)?.reference ?? ""}` };
}

export default async function Page({ params }: Params) {
  const { intakeId } = await params;
  const intake = intakeById(intakeId);
  const approval = approvalFor(intakeId);
  if (!intake || !approval || intake.status !== "pending_approval") notFound();
  return <ApprovalSummaryScreen intake={intake} approval={approval} />;
}
