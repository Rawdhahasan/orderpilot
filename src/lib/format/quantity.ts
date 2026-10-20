import type { DecimalString } from "./locale";
import { formatDecimal } from "./number";

/** Quantities show the product's allowed decimals and the unit: `24 EA`, `12.5 KG`. */
export function formatQuantity(
  quantity: DecimalString,
  uom: string,
  locale: string,
  decimals = 0,
): string {
  const value = formatDecimal(quantity, locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return `${value} ${uom}`;
}
