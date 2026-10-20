import { compare } from "@/domain/money/decimal";

import { approvalFor, availableFor, reviewFor, type PreviewIntake } from "../fixtures";

import { deriveExceptions, initialState } from "./model";

/**
 * Exception counts for list views, derived with the same rules as the review
 * screen so the two can never disagree.
 */
export function intakeExceptionCounts(
  intake: PreviewIntake,
): { blocking: number; warnings: number } | null {
  if (intake.status === "in_review") {
    const exceptions = deriveExceptions(
      initialState(reviewFor(intake.id), intake.id, intake.assignedTo),
    );
    return {
      blocking: exceptions.filter((e) => e.severity === "blocking").length,
      warnings: exceptions.filter((e) => e.severity === "warning").length,
    };
  }
  if (intake.status === "pending_approval") {
    const approval = approvalFor(intake.id);
    if (!approval) return null;
    return {
      blocking: approval.overrideRequired.length,
      warnings: approval.lines.filter(
        (l) => l.tracked && compare(l.quantity, availableFor(l.sku)) > 0,
      ).length,
    };
  }
  return null;
}
