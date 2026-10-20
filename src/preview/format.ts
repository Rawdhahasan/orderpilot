import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatQuantity,
  formatRelative,
  formatUnitPrice,
} from "@/lib/format";

import { FORMAT, PREVIEW_NOW } from "./fixtures";
import { PREVIEW_BASE_PATH } from "./guard";

/** Formatting bound to the fictional workspace's locale, currency and time zone. */
export const fmt = {
  money: (v: string) => formatMoney(v, FORMAT),
  unitPrice: (v: string) => formatUnitPrice(v, FORMAT),
  date: (v: string) => formatDate(v, FORMAT),
  dateTime: (v: string) => formatDateTime(v, FORMAT),
  relative: (v: string) => formatRelative(v, PREVIEW_NOW),
  duration: (ms: number) => formatDuration(ms),
  qty: (v: string, uom: string, decimals = 0) => formatQuantity(v, uom, FORMAT.locale, decimals),
};

export function previewHref(path: string): string {
  return `${PREVIEW_BASE_PATH}/${path.replace(/^\//, "")}`;
}
