import type { DecimalString, FormatContext } from "./locale";

type MoneyContext = Pick<FormatContext, "locale" | "currency">;

/** Line totals, subtotals and document totals: always two decimals. */
export function formatMoney(amount: DecimalString, ctx: MoneyContext): string {
  return new Intl.NumberFormat(ctx.locale, {
    style: "currency",
    currency: ctx.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    roundingMode: "halfExpand",
  }).format(amount as unknown as number);
}

/** Unit prices: up to four decimals when needed, otherwise two (`$0.0125`, `$12.40`). */
export function formatUnitPrice(amount: DecimalString, ctx: MoneyContext): string {
  return new Intl.NumberFormat(ctx.locale, {
    style: "currency",
    currency: ctx.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    roundingMode: "halfExpand",
  }).format(amount as unknown as number);
}
