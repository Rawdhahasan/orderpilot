/**
 * Local-only review state for the development preview. This is NOT the
 * validation engine (Phase 4B builds that in src/domain with database
 * hard gates). It demonstrates the review flow with fictional data, and
 * nothing here is persisted.
 */
import { compare, divideBy, lineTotal, normalize, subtract } from "@/domain/money/decimal";
import {
  type ExceptionSeverity,
  type MatchMethod,
  type ProvenanceState,
} from "@/domain/orders/statuses";

import { CUSTOMERS, WORKSPACE, availableFor, productBySku, type PreviewReview } from "../fixtures";

export type FieldState = {
  key: string;
  label: string;
  value: string;
  state: ProvenanceState;
  aiValue?: string;
  confidence?: number;
  page?: number;
  alternatives?: { value: string; label: string }[];
  sourceLabel?: string;
  printedAs?: string;
  hint?: string;
  by?: string;
};

export type LineState = {
  lineNo: number;
  page: number;
  customerPartNumber: string;
  description: string;
  poQuantity: string;
  poUom: string;
  poUnitPrice: string | null;
  confidence: number;
  sku: string | null;
  method: MatchMethod;
  matchScore: number | null;
  candidates: { sku: string; method: MatchMethod; score: number }[];
  matchConfirmed: boolean;
  remember: boolean;
  quantity: string;
  quantityState: ProvenanceState;
  conversion: { factor: number; note: string } | null;
  suggestedConversion?: { factor: number; note: string };
  priceChoice: "po" | "expected" | null;
  expectedUnitPrice: string | null;
  expectedPriceSource: "customer_price" | "list_price" | null;
  confirmed: boolean;
  confirmedBy?: string;
};

export type ReviewState = {
  intakeId: string;
  manualEntry: boolean;
  customerId: string | null;
  suggestedCustomerId: string | null;
  customerReason: string | null;
  customerConfirmed: boolean;
  header: FieldState[];
  shipToId: string | null;
  lines: LineState[];
  assignedTo: string | null;
};

export type ReviewException = {
  id: string;
  code: string;
  severity: ExceptionSeverity;
  overridable: boolean;
  title: string;
  scope: string;
  message: string;
  /** Field key or `line-<n>` to focus when the exception is selected. */
  target: string;
  page?: number;
};

export function initialState(
  review: PreviewReview | undefined,
  intakeId: string,
  assignedTo: string | null,
): ReviewState {
  if (!review) {
    return {
      intakeId,
      manualEntry: true,
      customerId: null,
      suggestedCustomerId: null,
      customerReason: null,
      customerConfirmed: false,
      header: [
        { key: "po_number", label: "Customer PO number", value: "", state: "missing" },
        { key: "po_date", label: "PO date", value: "", state: "missing" },
        { key: "requested_date", label: "Requested delivery", value: "", state: "missing" },
        { key: "payment_terms", label: "Payment terms (as printed)", value: "", state: "missing" },
        {
          key: "currency",
          label: "Currency",
          value: WORKSPACE.currency,
          state: "system_default",
          sourceLabel: "Workspace default",
        },
      ],
      shipToId: null,
      lines: [],
      assignedTo,
    };
  }
  const threshold = WORKSPACE.confidenceThreshold;
  const suggestion = review.customerSuggestions[0];
  return {
    intakeId,
    manualEntry: false,
    customerId: suggestion?.customerId ?? null,
    suggestedCustomerId: suggestion?.customerId ?? null,
    customerReason: suggestion?.reason ?? null,
    customerConfirmed: false,
    header: review.header.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      state:
        field.provenance === "suggested" && (field.confidence ?? 1) < threshold
          ? "suggested_low"
          : field.provenance,
      aiValue: field.provenance === "system_default" ? undefined : field.value,
      confidence: field.confidence,
      page: field.page,
      alternatives: field.alternatives,
      sourceLabel: field.sourceLabel,
      printedAs: field.printedAs,
      hint: field.hint,
    })),
    shipToId: null,
    lines: review.lines.map((line) => ({
      lineNo: line.lineNo,
      page: line.page,
      customerPartNumber: line.customerPartNumber,
      description: line.description,
      poQuantity: line.poQuantity,
      poUom: line.poUom,
      poUnitPrice: line.poUnitPrice,
      confidence: line.confidence,
      sku: line.match.sku,
      method: line.match.method,
      matchScore: line.match.score,
      candidates: line.candidates,
      matchConfirmed:
        line.match.method === "alias" ||
        line.match.method === "sku" ||
        line.match.method === "gtin",
      remember: false,
      quantity: line.poQuantity,
      quantityState: line.confidence < threshold ? "suggested_low" : "suggested",
      conversion: null,
      suggestedConversion: line.conversion,
      priceChoice: null,
      expectedUnitPrice: line.expectedUnitPrice,
      expectedPriceSource: line.expectedPriceSource,
      confirmed: false,
    })),
    assignedTo,
  };
}

/* ---------- Derived values ---------- */

export function lineUom(line: LineState): string {
  return line.conversion ? (productBySku(line.sku)?.uom ?? line.poUom) : line.poUom;
}

export function hasUnitMismatch(line: LineState): boolean {
  const product = productBySku(line.sku);
  return Boolean(product && !line.conversion && product.uom !== line.poUom);
}

/** PO unit price expressed per selling unit (after any conversion). */
export function poPricePerSellingUnit(line: LineState): string | null {
  if (!line.poUnitPrice) return null;
  if (!line.conversion) return line.poUnitPrice;
  return divideBy(line.poUnitPrice, line.conversion.factor, 4);
}

export function hasPriceMismatch(line: LineState): boolean {
  if (!line.sku || hasUnitMismatch(line) || !line.expectedUnitPrice || line.priceChoice)
    return false;
  const po = poPricePerSellingUnit(line);
  return po !== null && compare(normalize(po, 4), normalize(line.expectedUnitPrice, 4)) !== 0;
}

export function finalUnitPrice(line: LineState): string | null {
  if (line.priceChoice === "expected") return line.expectedUnitPrice;
  return poPricePerSellingUnit(line) ?? line.expectedUnitPrice;
}

export function lineAmount(line: LineState): string | null {
  const price = finalUnitPrice(line);
  return price ? lineTotal(line.quantity, price) : null;
}

export function shortfall(line: LineState): string | null {
  const product = productBySku(line.sku);
  if (!product || !product.trackInventory || hasUnitMismatch(line)) return null;
  const available = availableFor(product.sku);
  return compare(line.quantity, available) > 0 ? subtract(line.quantity, available) : null;
}

function headerNeedsConfirmation(field: FieldState) {
  return (
    field.state === "suggested" || field.state === "suggested_low" || field.state === "ambiguous"
  );
}

export function canBulkConfirm(
  line: LineState,
  threshold = WORKSPACE.confidenceThreshold,
): boolean {
  return (
    !line.confirmed &&
    line.sku !== null &&
    line.matchConfirmed &&
    line.confidence >= threshold &&
    line.quantityState === "suggested"
  );
}

export function unconfirmedCounts(state: ReviewState) {
  return {
    fields: state.header.filter(headerNeedsConfirmation).length,
    lines: state.lines.filter((line) => !line.confirmed).length,
  };
}

export function deriveExceptions(state: ReviewState): ReviewException[] {
  const out: ReviewException[] = [];
  const customer = CUSTOMERS.find((c) => c.id === state.customerId);

  if (!state.customerConfirmed || !customer) {
    out.push({
      id: "customer",
      code: "CUSTOMER_UNMATCHED",
      severity: "blocking",
      overridable: false,
      title: "Customer not confirmed",
      scope: "Header",
      message: customer
        ? `Confirm that this PO is from ${customer.name}, or choose another customer.`
        : "Choose the customer this PO is from.",
      target: "customer",
    });
  } else if (customer.status === "on_hold") {
    out.push({
      id: "on-hold",
      code: "CUSTOMER_ON_HOLD",
      severity: "blocking",
      overridable: true,
      title: "Customer on hold",
      scope: "Header",
      message: `${customer.name} is on hold: “${customer.holdReason}”.`,
      target: "customer",
    });
  }

  const counts = unconfirmedCounts(state);
  if (counts.fields + counts.lines > 0) {
    const parts = [
      counts.fields ? `${counts.fields} field${counts.fields > 1 ? "s" : ""}` : null,
      counts.lines ? `${counts.lines} line${counts.lines > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    out.push({
      id: "unconfirmed",
      code: "UNCONFIRMED_FIELDS",
      severity: "blocking",
      overridable: false,
      title: "Values to confirm",
      scope: "Header and lines",
      message: `${parts.join(" and ")} still need a person to confirm them against the document.`,
      target: "first-unconfirmed",
    });
  }

  const po = state.header.find((f) => f.key === "po_number");
  if (po && !po.value) {
    out.push({
      id: "po-missing",
      code: "PO_NUMBER_MISSING",
      severity: "blocking",
      overridable: true,
      title: "PO number missing",
      scope: "Header",
      message: "Enter the PO number if it is on the document. Otherwise an approver can override.",
      target: "po_number",
    });
  }

  const date = state.header.find((f) => f.key === "requested_date");
  if (date?.state === "ambiguous") {
    out.push({
      id: "date",
      code: "DATE_AMBIGUOUS",
      severity: "blocking",
      overridable: false,
      title: "Ambiguous date",
      scope: "Requested delivery",
      message: `The printed date could be ${date.alternatives?.map((a) => a.label).join(" or ")}. Choose the intended date.`,
      target: "requested_date",
      page: date.page,
    });
  }

  if (!state.shipToId) {
    out.push({
      id: "ship-to",
      code: "SHIP_TO_MISSING",
      severity: "blocking",
      overridable: false,
      title: "Ship-to missing",
      scope: "Header",
      message:
        "No ship-to address was found on the document. Select a saved address. Nothing is guessed.",
      target: "ship_to",
    });
  }

  for (const line of state.lines) {
    const scope = `Line ${line.lineNo}`;
    const target = `line-${line.lineNo}`;
    const product = productBySku(line.sku);
    if (!line.sku) {
      out.push({
        id: `${target}-product`,
        code: "PRODUCT_UNMATCHED",
        severity: "blocking",
        overridable: false,
        title: "Product not matched",
        scope,
        message: `“${line.customerPartNumber}” is not a known part number for this customer. Choose the product.`,
        target,
        page: line.page,
      });
      continue;
    }
    if (hasUnitMismatch(line) && product) {
      out.push({
        id: `${target}-uom`,
        code: "UOM_MISMATCH",
        severity: "blocking",
        overridable: false,
        title: "Unit mismatch",
        scope,
        message: `PO says ${line.poQuantity} ${line.poUom}; this product sells in ${product.uom}. Convert the quantity.`,
        target,
        page: line.page,
      });
    }
    if (hasPriceMismatch(line)) {
      out.push({
        id: `${target}-price`,
        code: "PRICE_MISMATCH",
        severity: "blocking",
        overridable: false,
        title: "Price mismatch",
        scope,
        message: `PO price differs from the ${line.expectedPriceSource === "customer_price" ? "customer price" : "list price"}. Choose which price applies.`,
        target,
        page: line.page,
      });
    }
    const short = shortfall(line);
    if (short && product) {
      const available = availableFor(product.sku);
      out.push({
        id: `${target}-stock`,
        code: "INSUFFICIENT_STOCK",
        severity: "warning",
        overridable: false,
        title: "Insufficient stock",
        scope,
        message:
          compare(available, "0") <= 0
            ? `No stock available (${product.sku} is over-committed). The whole line would be backordered at approval.`
            : `${line.quantity} ${product.uom} requested, ${normalize(available, product.quantityDecimals)} available. Indicative; checked again at approval.`,
        target,
        page: line.page,
      });
    }
  }
  return out;
}

export function submissionBlockers(exceptions: ReviewException[]) {
  return exceptions.filter((e) => e.severity === "blocking" && !e.overridable);
}
