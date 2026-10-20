/** Status values mirror the database enums (docs/DATABASE_ARCHITECTURE.md §5). */
export const INTAKE_STATUSES = [
  "received",
  "extracting",
  "extraction_failed",
  "in_review",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const SALES_ORDER_STATUSES = ["confirmed", "fulfilled", "cancelled"] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const CUSTOMER_STATUSES = ["active", "on_hold", "inactive"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const PRODUCT_STATUSES = ["active", "discontinued"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STOCK_STATUSES = ["in_stock", "low", "out_of_stock", "over_committed"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export type ExceptionSeverity = "blocking" | "warning";

/** Provenance states (docs/DESIGN_SYSTEM.md §9.6, DATABASE_ARCHITECTURE.md §6.6). */
export const PROVENANCE_STATES = [
  "suggested",
  "suggested_low",
  "ambiguous",
  "confirmed",
  "edited",
  "user_entered",
  "system_default",
  "missing",
] as const;
export type ProvenanceState = (typeof PROVENANCE_STATES)[number];

export type MatchMethod = "alias" | "sku" | "gtin" | "description" | "manual" | "none";

const QUANTITY = /^(-?)(\d+)(?:\.(\d{1,3}))?$/;

/** Parses a quantity (numeric(14,3)) into thousandths without floating point. */
export function toThousandths(quantity: string): bigint {
  const match = QUANTITY.exec(quantity.trim());
  if (!match) throw new RangeError(`Invalid quantity "${quantity}"`);
  const [, sign, whole = "0", fraction = ""] = match;
  const value = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return sign === "-" ? -value : value;
}

/** Stock status from balances (docs/PRODUCT_REQUIREMENTS.md FR-INV-01). */
export function stockStatus(
  onHand: string,
  reserved: string,
  reorderPoint: string | null,
): StockStatus {
  const onHandQty = toThousandths(onHand);
  const reservedQty = toThousandths(reserved);
  const available = onHandQty - reservedQty;
  if (reservedQty > onHandQty) return "over_committed";
  if (available === 0n) return "out_of_stock";
  if (reorderPoint !== null && available <= toThousandths(reorderPoint)) return "low";
  return "in_stock";
}
