import { add, compare, lineTotal, round, subtract } from "@/domain/money/decimal";

/**
 * The validation engine (PRODUCT_REQUIREMENTS.md §9, TECHNICAL_ARCHITECTURE.md
 * §10.3): small pure rules over a snapshot of the intake. Each exception
 * carries a fingerprint of the values it looked at, so a closed exception
 * re-opens when those values change. The database re-checks blocking rules
 * at submit and approve; this engine gives the detailed feedback.
 */

export type FieldMeta = {
  source?: "ai" | "user" | "system_default";
  state?: string;
  confidence?: number;
  ambiguous?: boolean;
  price_decision?: "po" | "expected" | "manual";
  [key: string]: unknown;
};

export type ValidationLine = {
  id: string;
  lineNo: number;
  productId: string | null;
  productStatus: "active" | "discontinued" | null;
  sellingUom: string | null;
  quantityDecimals: number;
  poUom: string | null;
  uomConversionNote: string | null;
  quantity: string | null;
  unitPrice: string | null;
  poUnitPrice: string | null;
  expectedPrice: string | null;
  /** Available stock for tracked products; null when not tracked. */
  available: string | null;
  fieldMeta: Record<string, FieldMeta>;
};

export type ValidationInput = {
  today: string;
  workspace: { baseCurrency: string; priceTolerancePct: number };
  intake: {
    customerId: string | null;
    customerStatus: "active" | "on_hold" | "inactive" | null;
    poNumber: string | null;
    requestedDeliveryDate: string | null;
    currency: string | null;
    hasShipTo: boolean;
    shipToAddressId: string | null;
    shipToOnFile: boolean;
    documentTotal: string | null;
    fieldMeta: Record<string, FieldMeta>;
  };
  duplicates: {
    poConflicts: unknown[];
    poFingerprint: string;
    documentConflicts: unknown[];
    documentFingerprint: string;
    possibleDuplicates: string[];
  };
  lines: ValidationLine[];
};

export type ExceptionCode =
  | "UNCONFIRMED_FIELDS"
  | "CUSTOMER_UNMATCHED"
  | "CUSTOMER_ON_HOLD"
  | "CUSTOMER_INACTIVE"
  | "PO_NUMBER_MISSING"
  | "DUPLICATE_PO_NUMBER"
  | "DUPLICATE_DOCUMENT"
  | "POSSIBLE_DUPLICATE"
  | "SHIP_TO_MISSING"
  | "SHIP_TO_NOT_ON_FILE"
  | "CURRENCY_MISMATCH"
  | "DATE_AMBIGUOUS"
  | "REQUESTED_DATE_PAST"
  | "TOTAL_MISMATCH"
  | "PRODUCT_UNMATCHED"
  | "PRODUCT_DISCONTINUED"
  | "QUANTITY_INVALID"
  | "UOM_MISMATCH"
  | "PRICE_MISMATCH"
  | "PRICE_MISSING"
  | "DUPLICATE_LINE"
  | "INSUFFICIENT_STOCK";

export type ValidationException = {
  code: ExceptionCode;
  severity: "blocking" | "warning";
  line_id: string | null;
  message: string;
  details: Record<string, unknown>;
  fingerprint: string;
};

/** Catalogue titles shown in the exceptions panel. */
export const EXCEPTION_TITLES: Record<ExceptionCode, string> = {
  UNCONFIRMED_FIELDS: "Unconfirmed values",
  CUSTOMER_UNMATCHED: "No customer selected",
  CUSTOMER_ON_HOLD: "Customer on hold",
  CUSTOMER_INACTIVE: "Customer inactive",
  PO_NUMBER_MISSING: "PO number missing",
  DUPLICATE_PO_NUMBER: "Duplicate PO number",
  DUPLICATE_DOCUMENT: "Duplicate document",
  POSSIBLE_DUPLICATE: "Possible duplicate order",
  SHIP_TO_MISSING: "Ship-to missing",
  SHIP_TO_NOT_ON_FILE: "Ship-to not on file",
  CURRENCY_MISMATCH: "Currency differs",
  DATE_AMBIGUOUS: "Ambiguous date",
  REQUESTED_DATE_PAST: "Requested date in the past",
  TOTAL_MISMATCH: "Total differs",
  PRODUCT_UNMATCHED: "No product selected",
  PRODUCT_DISCONTINUED: "Discontinued product",
  QUANTITY_INVALID: "Invalid quantity",
  UOM_MISMATCH: "Unit differs",
  PRICE_MISMATCH: "Price differs",
  PRICE_MISSING: "No price on the PO",
  DUPLICATE_LINE: "Product on several lines",
  INSUFFICIENT_STOCK: "Not enough stock",
};

const DECIMAL = /^-?\d+(\.\d+)?$/;

function unconfirmed(meta: Record<string, FieldMeta>): string[] {
  return Object.entries(meta)
    .filter(([, m]) => m?.source === "ai" && m.state === "suggested")
    .map(([k]) => k)
    .sort();
}

function withinTolerance(actual: string, expected: string, pct: number): boolean {
  const diff = subtract(actual, expected);
  const abs = diff.startsWith("-") ? diff.slice(1) : diff;
  // tolerance = expected × pct / 100, compared exactly (C-05).
  const tolerance = round(String((Number(expected) * pct) / 100), 4);
  return compare(abs, tolerance) <= 0;
}

export function validate(
  input: ValidationInput,
  hash: (text: string) => string,
): ValidationException[] {
  const out: ValidationException[] = [];
  const raise = (
    code: ExceptionCode,
    severity: "blocking" | "warning",
    message: string,
    looked: unknown,
    line: string | null = null,
    details: Record<string, unknown> = {},
    fingerprint?: string,
  ) =>
    out.push({
      code,
      severity,
      line_id: line,
      message,
      details,
      fingerprint: fingerprint ?? hash(JSON.stringify([code, line, looked])),
    });

  const { intake, workspace, duplicates } = input;

  const headerUnconfirmed = unconfirmed(intake.fieldMeta);
  if (headerUnconfirmed.length) {
    raise(
      "UNCONFIRMED_FIELDS",
      "blocking",
      `Confirm or edit: ${headerUnconfirmed.join(", ").replaceAll("_", " ")}.`,
      headerUnconfirmed,
      null,
      { fields: headerUnconfirmed },
    );
  }

  if (!intake.customerId)
    raise("CUSTOMER_UNMATCHED", "blocking", "Select the customer who sent this PO.", null);
  else if (intake.customerStatus === "inactive")
    raise(
      "CUSTOMER_INACTIVE",
      "blocking",
      "The customer is inactive. An Admin can reactivate it, or cancel this PO.",
      intake.customerId,
    );
  else if (intake.customerStatus === "on_hold")
    raise(
      "CUSTOMER_ON_HOLD",
      "blocking",
      "The customer is on hold. An Approver can release the hold or override it for this order.",
      intake.customerId,
    );

  if (!intake.poNumber?.trim())
    raise(
      "PO_NUMBER_MISSING",
      "blocking",
      "Enter the PO number from the document. If there is none, an Approver can override.",
      null,
    );

  if (duplicates.poConflicts.length) {
    raise(
      "DUPLICATE_PO_NUMBER",
      "blocking",
      "This PO number is already on another order for this customer.",
      null,
      null,
      { conflicts: duplicates.poConflicts },
      duplicates.poFingerprint,
    );
  }
  if (duplicates.documentConflicts.length) {
    raise(
      "DUPLICATE_DOCUMENT",
      "blocking",
      "The same file is already on another order.",
      null,
      null,
      { conflicts: duplicates.documentConflicts },
      duplicates.documentFingerprint,
    );
  }
  if (duplicates.possibleDuplicates.length) {
    raise(
      "POSSIBLE_DUPLICATE",
      "warning",
      "A recent order for this customer has the same products and quantities.",
      duplicates.possibleDuplicates,
      null,
      { sales_orders: duplicates.possibleDuplicates },
    );
  }

  if (!intake.hasShipTo && !intake.shipToAddressId) {
    raise(
      "SHIP_TO_MISSING",
      "blocking",
      "Select a saved address or enter the ship-to exactly as printed.",
      null,
    );
  } else if (!intake.shipToAddressId && !intake.shipToOnFile) {
    raise(
      "SHIP_TO_NOT_ON_FILE",
      "warning",
      "The ship-to does not match a saved address for this customer.",
      intake.customerId,
    );
  }

  if (intake.currency && intake.currency !== workspace.baseCurrency) {
    raise(
      "CURRENCY_MISMATCH",
      "blocking",
      `The PO is in ${intake.currency}; this workspace uses ${workspace.baseCurrency}.`,
      intake.currency,
    );
  }

  const ambiguousDates = ["po_date", "requested_delivery_date"].filter(
    (k) => intake.fieldMeta[k]?.ambiguous && intake.fieldMeta[k]?.state === "suggested",
  );
  if (ambiguousDates.length) {
    raise(
      "DATE_AMBIGUOUS",
      "blocking",
      "A date could be read as day-month or month-day. Confirm the intended date.",
      ambiguousDates,
      null,
      { fields: ambiguousDates },
    );
  }
  if (intake.requestedDeliveryDate && intake.requestedDeliveryDate < input.today) {
    raise(
      "REQUESTED_DATE_PAST",
      "warning",
      "The requested delivery date is in the past.",
      intake.requestedDeliveryDate,
    );
  }

  const active = input.lines;
  const totals: string[] = [];
  const productLines = new Map<string, number[]>();
  for (const line of active) {
    const unconfirmedLine = unconfirmed(line.fieldMeta);
    if (unconfirmedLine.length) {
      raise(
        "UNCONFIRMED_FIELDS",
        "blocking",
        `Line ${line.lineNo}: confirm or edit ${unconfirmedLine.join(", ").replaceAll("_", " ")}.`,
        unconfirmedLine,
        line.id,
        { fields: unconfirmedLine },
      );
    }
    if (!line.productId) {
      raise(
        "PRODUCT_UNMATCHED",
        "blocking",
        `Line ${line.lineNo}: select the product.`,
        null,
        line.id,
      );
    } else {
      productLines.set(line.productId, [...(productLines.get(line.productId) ?? []), line.lineNo]);
      if (line.productStatus === "discontinued") {
        raise(
          "PRODUCT_DISCONTINUED",
          "blocking",
          `Line ${line.lineNo}: the product is discontinued. Choose a substitute or remove the line.`,
          line.productId,
          line.id,
        );
      }
    }

    const qty = line.quantity;
    const decimalsOk =
      qty !== null && DECIMAL.test(qty) && compare(round(qty, line.quantityDecimals), qty) === 0;
    if (
      qty === null ||
      !DECIMAL.test(qty) ||
      compare(qty, "0") <= 0 ||
      (line.productId && !decimalsOk)
    ) {
      raise(
        "QUANTITY_INVALID",
        "blocking",
        `Line ${line.lineNo}: enter a quantity greater than zero${line.productId ? ` with at most ${line.quantityDecimals} decimal places` : ""}.`,
        [qty, line.quantityDecimals],
        line.id,
      );
    }

    if (
      line.productId &&
      line.poUom &&
      line.sellingUom &&
      line.poUom.toUpperCase() !== line.sellingUom &&
      !line.uomConversionNote?.trim()
    ) {
      raise(
        "UOM_MISMATCH",
        "blocking",
        `Line ${line.lineNo}: the PO says ${line.poUom}; we sell in ${line.sellingUom}. Convert the quantity and note the conversion.`,
        [line.poUom, line.sellingUom],
        line.id,
      );
    }

    if (line.productId && line.unitPrice && line.expectedPrice) {
      const decision = line.fieldMeta.unit_price?.price_decision;
      if (
        !withinTolerance(line.unitPrice, line.expectedPrice, workspace.priceTolerancePct) &&
        !decision
      ) {
        raise(
          "PRICE_MISMATCH",
          "blocking",
          `Line ${line.lineNo}: the PO price differs from the expected price. Choose which price to use.`,
          [line.unitPrice, line.expectedPrice],
          line.id,
          { po_price: line.unitPrice, expected_price: line.expectedPrice },
        );
      }
    }
    if (line.productId && line.poUnitPrice === null && line.expectedPrice) {
      raise(
        "PRICE_MISSING",
        "warning",
        `Line ${line.lineNo}: no price on the PO; the expected price is applied.`,
        line.expectedPrice,
        line.id,
      );
    }

    if (line.available !== null && qty && DECIMAL.test(qty) && compare(qty, line.available) > 0) {
      raise(
        "INSUFFICIENT_STOCK",
        "warning",
        `Line ${line.lineNo}: only ${line.available} available. The approver decides on a backorder.`,
        [qty, line.available],
        line.id,
        { available: line.available },
      );
    }
    if (qty && DECIMAL.test(qty) && line.unitPrice) totals.push(lineTotal(qty, line.unitPrice));
  }

  for (const [productId, lineNos] of productLines) {
    if (lineNos.length > 1) {
      const first = active.find((l) => l.productId === productId && l.lineNo === lineNos[0])!;
      raise(
        "DUPLICATE_LINE",
        "warning",
        `The same product is on lines ${lineNos.join(", ")}.`,
        lineNos,
        first.id,
        { lines: lineNos },
      );
    }
  }

  if (intake.documentTotal && totals.length) {
    const sum = round(add(...totals, "0"), 2);
    if (compare(sum, round(intake.documentTotal, 2)) !== 0) {
      raise(
        "TOTAL_MISMATCH",
        "warning",
        `Lines add up to ${sum}; the document total is ${round(intake.documentTotal, 2)}.`,
        [sum, intake.documentTotal],
        null,
      );
    }
  }
  return out;
}
