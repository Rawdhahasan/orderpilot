/**
 * Types for the development preview fixtures. They follow the shapes in
 * docs/DATABASE_ARCHITECTURE.md so the same components can be reused with
 * real data from Phase 2 onwards. All values are fictional.
 */
import type { Role } from "@/domain/auth/roles";
import type {
  CustomerStatus,
  ExceptionSeverity,
  IntakeStatus,
  MatchMethod,
  ProductStatus,
  ProvenanceState,
  SalesOrderStatus,
} from "@/domain/orders/statuses";

export type PreviewUser = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  lastActiveAt: string;
};

export type PreviewWorkspace = {
  name: string;
  slug: string;
  legalName: string;
  countryCode: string;
  currency: string;
  locale: string;
  timeZone: string;
  salesOrderPrefix: string;
  requireIndependentApproval: boolean;
  priceTolerancePct: string;
  confidenceThreshold: number;
  duplicateLookbackDays: number;
};

export type PreviewAddress = {
  id: string;
  type: "billing" | "shipping";
  label: string;
  lines: string[];
  isDefault: boolean;
};

export type PreviewAlias = {
  customerPartNumber: string;
  productSku: string;
  learnedFrom: string;
  learnedBy: string;
};

export type PreviewCustomer = {
  id: string;
  accountNumber: string;
  name: string;
  status: CustomerStatus;
  holdReason?: string;
  holdSince?: string;
  city: string;
  region: string;
  countryCode: string;
  contactEmail: string;
  paymentTerms: string;
  addresses: PreviewAddress[];
  aliases: PreviewAlias[];
};

export type PreviewProduct = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  quantityDecimals: number;
  listPrice: string;
  gtin?: string;
  status: ProductStatus;
  trackInventory: boolean;
  onHand: string;
  reserved: string;
  reorderPoint: string | null;
};

export type PreviewIntake = {
  id: string;
  reference: string;
  customerId: string | null;
  poNumber: string | null;
  status: IntakeStatus;
  fileName: string;
  pages: number;
  receivedAt: string;
  lineCount: number | null;
  subtotal: string | null;
  assignedTo: string | null;
  submittedBy?: string;
  submittedAt?: string;
  overrideRequired?: boolean;
  manualEntry?: boolean;
  failureReason?: string;
  salesOrderId?: string;
  cancelReason?: string;
  decisionReason?: string;
};

export type PreviewSalesOrderLine = {
  lineNo: number;
  sku: string;
  name: string;
  customerPartNumber: string | null;
  quantity: string;
  uom: string;
  unitPrice: string;
  priceSource: "po_price" | "customer_price" | "list_price";
  allocated: string;
  backordered: string;
};

export type PreviewSalesOrder = {
  id: string;
  number: string;
  intakeId: string;
  customerId: string;
  poNumber: string;
  status: SalesOrderStatus;
  receivedAt: string;
  approvedAt: string;
  approvedBy: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  requestedDate: string;
  shipTo: string[];
  lines: PreviewSalesOrderLine[];
};

export type PreviewAuditEvent = {
  id: string;
  at: string;
  actor: string;
  actorType: "user" | "system";
  action: string;
  summary: string;
  entityType:
    "intake" | "sales_order" | "customer" | "product" | "inventory" | "member" | "settings";
  entityLabel: string;
  entityHref?: string;
  changes?: { field: string; from: string; to: string; aiValue?: string }[];
  reason?: string;
  requestId: string;
};

export type PreviewMovement = {
  id: string;
  sku: string;
  type: "receipt" | "adjustment" | "reservation" | "reservation_release" | "issue";
  onHandDelta: string;
  reservedDelta: string;
  onHandAfter: string;
  reservedAfter: string;
  at: string;
  actor: string;
  reference: string;
};

/* ---------- Review fixtures ---------- */

export type PreviewField = {
  key: string;
  label: string;
  value: string;
  provenance: ProvenanceState;
  confidence?: number;
  page?: number;
  alternatives?: { value: string; label: string }[];
  sourceLabel?: string;
  /** Exactly as printed, for ambiguous values. */
  printedAs?: string;
  hint?: string;
};

export type PreviewCandidate = {
  sku: string;
  method: MatchMethod;
  score: number;
};

export type PreviewReviewLine = {
  lineNo: number;
  page: number;
  customerPartNumber: string;
  description: string;
  poQuantity: string;
  poUom: string;
  poUnitPrice: string | null;
  match: { sku: string | null; method: MatchMethod; score: number | null };
  candidates: PreviewCandidate[];
  confidence: number;
  expectedUnitPrice: string | null;
  expectedPriceSource: "customer_price" | "list_price" | null;
  /** Suggested conversion when the PO unit differs from the selling unit. */
  conversion?: { factor: number; note: string };
};

export type PreviewDocumentPage = {
  heading: string;
  lines: number[];
  showHeader: boolean;
  showTotals: boolean;
};

export type PreviewReview = {
  intakeId: string;
  documentTitle: string;
  documentFrom: { name: string; lines: string[] };
  documentTo: { name: string; lines: string[] };
  printedDates: { label: string; value: string }[];
  printedTotal: string | null;
  printedNotes: string | null;
  pages: PreviewDocumentPage[];
  customerSuggestions: { customerId: string; reason: string }[];
  header: PreviewField[];
  lines: PreviewReviewLine[];
};

export type PreviewApproval = {
  intakeId: string;
  requestedDate: string;
  shipTo: string[];
  note: string | null;
  changesFromAi: { field: string; ai: string; final: string; by: string }[];
  decisions: string[];
  aliasesToRemember: { customerPartNumber: string; sku: string }[];
  overrideRequired: { code: string; title: string; message: string }[];
  resolved: { title: string; resolution: string }[];
  lines: {
    lineNo: number;
    sku: string;
    name: string;
    quantity: string;
    uom: string;
    unitPrice: string;
    priceSource: "po_price" | "customer_price" | "list_price";
    tracked: boolean;
  }[];
};

export type PreviewException = {
  code: string;
  severity: ExceptionSeverity;
  overridable: boolean;
};
