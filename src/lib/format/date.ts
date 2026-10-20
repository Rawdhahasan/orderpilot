import type { FormatContext } from "./locale";

type DateContext = Pick<FormatContext, "locale">;
type TimeContext = Pick<FormatContext, "locale" | "timeZone">;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Business dates (PO date, requested date) are calendar dates without a time
 * zone. Always unambiguous: `14 Oct 2026`, or `Oct 14, 2026` for en-US.
 * Numeric dates such as `04/11/2026` are never produced.
 */
export function formatDate(isoDate: string, ctx: DateContext): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`Expected an ISO date (YYYY-MM-DD), received "${isoDate}"`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return new Intl.DateTimeFormat(ctx.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Time in the workspace time zone; 12-hour clock only for en-US. */
export function formatTime(isoTimestamp: string, ctx: TimeContext): string {
  return new Intl.DateTimeFormat(ctx.locale, {
    hour: ctx.locale === "en-US" ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12: ctx.locale === "en-US",
    timeZone: ctx.timeZone,
  }).format(new Date(isoTimestamp));
}

/** Absolute timestamp for tooltips and audit records: `14 Oct 2026, 09:14`. */
export function formatDateTime(isoTimestamp: string, ctx: TimeContext): string {
  const date = new Date(isoTimestamp);
  const day = new Intl.DateTimeFormat(ctx.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ctx.timeZone,
  }).format(date);
  return `${day}, ${formatTime(isoTimestamp, ctx)}`;
}

/** Durations: `35 min`, `2 h 10 min`, `3 d 4 h`. */
export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (totalMinutes < 1) return "under 1 min";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}

/** Relative time for lists and timelines: `just now`, `35 min ago`, `2 h ago`. */
export function formatRelative(isoTimestamp: string, now: Date): string {
  const elapsed = now.getTime() - new Date(isoTimestamp).getTime();
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
