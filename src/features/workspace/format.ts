import {
  EMPTY_VALUE,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatUnitPrice,
  type FormatContext,
} from "@/lib/format";

/** Formatting bound to a workspace's locale, currency and time zone. */
export function workspaceFormat(ctx: FormatContext) {
  return {
    money: (v: string | number | null | undefined) =>
      v == null ? EMPTY_VALUE : formatMoney(String(v), ctx),
    unitPrice: (v: string | number | null | undefined) =>
      v == null ? EMPTY_VALUE : formatUnitPrice(String(v), ctx),
    date: (v: string | null | undefined) => (v ? formatDate(v.slice(0, 10), ctx) : EMPTY_VALUE),
    dateTime: (v: string | null | undefined) => (v ? formatDateTime(v, ctx) : EMPTY_VALUE),
    qty: (v: string | number | null | undefined, uom: string, decimals = 3) =>
      v == null ? EMPTY_VALUE : formatQuantity(String(v), uom, ctx.locale, decimals),
  };
}

export type WorkspaceFormat = ReturnType<typeof workspaceFormat>;
