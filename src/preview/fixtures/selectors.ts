/**
 * Every number in the development preview is computed here from the fictional
 * fixtures; nothing on screen is a hard-coded figure.
 */
import { lineTotal, subtract, sumMoney } from "@/domain/money/decimal";
import { stockStatus, type IntakeStatus, type StockStatus } from "@/domain/orders/statuses";

import { CUSTOMERS, PRODUCTS, productBySku } from "./master-data";
import { AUDIT_EVENTS, INTAKES, SALES_ORDERS, salesOrderSubtotal } from "./orders";
import { APPROVALS, REVIEWS } from "./reviews";
import type { PreviewIntake, PreviewProduct } from "./types";
import { PREVIEW_NOW } from "./workspace";

export const FICTIONAL = true as const;

export function availableFor(sku: string): string {
  const product = productBySku(sku);
  return product ? subtract(product.onHand, product.reserved) : "0";
}

export function productStockStatus(product: PreviewProduct): StockStatus {
  return stockStatus(product.onHand, product.reserved, product.reorderPoint);
}

export function reviewFor(intakeId: string) {
  return REVIEWS.find((review) => review.intakeId === intakeId);
}

export function approvalFor(intakeId: string) {
  return APPROVALS.find((approval) => approval.intakeId === intakeId);
}

export function intakeById(id: string) {
  return INTAKES.find((intake) => intake.id === id);
}

export function salesOrderById(id: string) {
  return SALES_ORDERS.find((order) => order.id === id);
}

/** Line count from the most specific fixture available. */
export function intakeLineCount(intake: PreviewIntake): number | null {
  const review = reviewFor(intake.id);
  if (review) return review.lines.length;
  const approval = approvalFor(intake.id);
  if (approval) return approval.lines.length;
  const order = intake.salesOrderId ? salesOrderById(intake.salesOrderId) : undefined;
  if (order) return order.lines.length;
  return intake.lineCount;
}

/** Subtotal as printed (review), as submitted (approval) or as confirmed (sales order). */
export function intakeSubtotal(intake: PreviewIntake): string | null {
  const review = reviewFor(intake.id);
  if (review) {
    return sumMoney(
      review.lines.map((line) => lineTotal(line.poQuantity, line.poUnitPrice ?? "0")),
    );
  }
  const approval = approvalFor(intake.id);
  if (approval) return sumMoney(approval.lines.map((l) => lineTotal(l.quantity, l.unitPrice)));
  const order = intake.salesOrderId ? salesOrderById(intake.salesOrderId) : undefined;
  return order ? salesOrderSubtotal(order) : null;
}

const ACTIVE_STATUSES: IntakeStatus[] = [
  "received",
  "extracting",
  "extraction_failed",
  "in_review",
  "pending_approval",
];

export function pipeline() {
  return ACTIVE_STATUSES.map((status) => {
    const items = INTAKES.filter((intake) => intake.status === status);
    const timestamps = items.map((i) =>
      new Date(
        status === "pending_approval" ? (i.submittedAt ?? i.receivedAt) : i.receivedAt,
      ).getTime(),
    );
    const oldest = timestamps.length ? Math.min(...timestamps) : null;
    return {
      status,
      count: items.length,
      oldestAgeMs: oldest === null ? null : PREVIEW_NOW.getTime() - oldest,
    };
  });
}

const DAY = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function dashboardMetrics() {
  const last30 = INTAKES.filter(
    (i) => PREVIEW_NOW.getTime() - new Date(i.receivedAt).getTime() <= 30 * DAY,
  );
  const inReview = INTAKES.filter((i) => i.status === "in_review");
  const pending = INTAKES.filter((i) => i.status === "pending_approval");
  const failed = INTAKES.filter((i) => i.status === "extraction_failed");
  const overrideRequired = pending.filter((i) => i.overrideRequired);
  const approvedLast7 = SALES_ORDERS.filter(
    (o) => PREVIEW_NOW.getTime() - new Date(o.approvedAt).getTime() <= 7 * DAY,
  );
  const uploadToApproval = median(
    approvedLast7.map((o) => new Date(o.approvedAt).getTime() - new Date(o.receivedAt).getTime()),
  );
  const oldest = (items: PreviewIntake[], key: "receivedAt" | "submittedAt") => {
    const times = items.map((i) => new Date(i[key] ?? i.receivedAt).getTime());
    return times.length ? PREVIEW_NOW.getTime() - Math.min(...times) : null;
  };

  return {
    totalLast30: last30.length,
    inReview: inReview.length,
    inReviewOldestMs: oldest(inReview, "receivedAt"),
    unassignedInReview: inReview.filter((i) => !i.assignedTo).length,
    pending: pending.length,
    pendingOldestMs: oldest(pending, "submittedAt"),
    failed,
    overrideRequired: overrideRequired.length,
    approvedLast7: approvedLast7.length,
    medianUploadToApprovalMs: approvedLast7.length >= 3 ? uploadToApproval : null,
    awaitingFulfilment: SALES_ORDERS.filter((o) => o.status === "confirmed").length,
  };
}

export function assignedTo(userId: string) {
  return INTAKES.filter((i) => i.assignedTo === userId && i.status === "in_review");
}

export function inventoryWarnings() {
  return PRODUCTS.filter((p) => p.trackInventory && p.status === "active")
    .map((p) => ({
      product: p,
      status: productStockStatus(p),
      available: subtract(p.onHand, p.reserved),
    }))
    .filter((row) => row.status !== "in_stock")
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
}

const SEVERITY: Record<StockStatus, number> = {
  over_committed: 0,
  out_of_stock: 1,
  low: 2,
  in_stock: 3,
};

export function openBackorders() {
  return SALES_ORDERS.flatMap((order) =>
    order.status === "cancelled"
      ? []
      : order.lines.filter((line) => line.backordered !== "0").map((line) => ({ order, line })),
  );
}

export function recentSalesOrders(limit = 5) {
  return [...SALES_ORDERS].sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)).slice(0, limit);
}

export function recentActivity(limit = 6) {
  return [...AUDIT_EVENTS].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function customerOpenIntakes(customerId: string) {
  return INTAKES.filter(
    (i) => i.customerId === customerId && !["approved", "rejected", "cancelled"].includes(i.status),
  ).length;
}

export function customerOrders(customerId: string) {
  return SALES_ORDERS.filter((o) => o.customerId === customerId);
}

export { CUSTOMERS, PRODUCTS };
