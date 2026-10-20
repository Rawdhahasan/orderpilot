import type { DecimalString } from "./locale";

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/**
 * Formats a decimal string exactly. Intl.NumberFormat accepts strings and
 * formats them without converting to binary floating point.
 */
export function formatDecimal(
  value: DecimalString,
  locale: string,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  const { minimumFractionDigits = 0, maximumFractionDigits = 3 } = options;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
    roundingMode: "halfExpand",
  }).format(value as unknown as number);
}

export function formatPercent(fraction: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    fraction,
  );
}
