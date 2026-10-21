import "server-only";

import { parseDate, parseDecimal, type DateOrder } from "@/domain/orders/parse";

import type { ExtractionResult } from "./contract";

/**
 * Our own parsing of provider text (§9.2): dates use the customer's date
 * order and the workspace locale; numbers are re-parsed from the raw text.
 * Values that cannot be parsed become null (the person enters them).
 */
export function normalizeResult(
  result: ExtractionResult,
  hint: DateOrder,
  locale: string,
): ExtractionResult {
  const header = { ...result.header };
  for (const key of ["po_date", "requested_delivery_date"] as const) {
    const field = header[key];
    if (field) {
      const parsed = parseDate(field.raw, hint, locale);
      header[key] = {
        ...field,
        value: parsed.value,
        ambiguous: Boolean(field.ambiguous) || parsed.ambiguous,
      };
    }
  }
  if (header.document_total)
    header.document_total = {
      ...header.document_total,
      value: parseDecimal(header.document_total.raw),
    };
  if (header.currency) {
    const code = header.currency.raw.trim().toUpperCase();
    header.currency = { ...header.currency, value: /^[A-Z]{3}$/.test(code) ? code : null };
  }
  const lines = result.lines.map((line) => ({
    ...line,
    quantity: line.quantity && { ...line.quantity, value: parseDecimal(line.quantity.raw) },
    unit_price: line.unit_price && { ...line.unit_price, value: parseDecimal(line.unit_price.raw) },
    line_total: line.line_total && { ...line.line_total, value: parseDecimal(line.line_total.raw) },
    uom: line.uom && { ...line.uom, value: line.uom.raw.trim().toUpperCase().slice(0, 20) || null },
  }));
  return { ...result, header, lines };
}

export function overallConfidence(result: ExtractionResult): number | null {
  const values: number[] = [];
  // Only calibrated confidences count; providers without them report none.
  for (const field of Object.values(result.header))
    if (typeof field?.confidence === "number") values.push(field.confidence);
  for (const line of result.lines) {
    for (const field of [line.customer_part_number, line.quantity, line.unit_price])
      if (typeof field?.confidence === "number") values.push(field.confidence);
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}
