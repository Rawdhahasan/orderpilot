import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatQuantity,
  formatRelative,
  formatTime,
  formatUnitPrice,
} from "@/lib/format";

const US = { locale: "en-US", currency: "USD", timeZone: "America/New_York" };
const GB = { locale: "en-GB", currency: "GBP", timeZone: "Europe/London" };
const DE = { locale: "de-DE", currency: "EUR", timeZone: "Europe/Berlin" };

describe("money (DESIGN_SYSTEM.md §10)", () => {
  it("formats totals with two decimals in the workspace locale", () => {
    expect(formatMoney("1240.5", US)).toBe("$1,240.50");
    expect(formatMoney("1240.5", GB)).toBe("£1,240.50");
    expect(formatMoney("1240.5", DE)).toBe("1.240,50 €");
  });

  it("formats decimal strings exactly, without floating point drift", () => {
    expect(formatMoney("0.1", US)).toBe("$0.10");
    expect(formatMoney("12345678901234.99", US)).toBe("$12,345,678,901,234.99");
  });

  it("shows up to four decimals for unit prices only when needed", () => {
    expect(formatUnitPrice("0.0125", US)).toBe("$0.0125");
    expect(formatUnitPrice("12.4000", US)).toBe("$12.40");
  });
});

describe("dates (never numeric, DESIGN_SYSTEM.md §10)", () => {
  it("uses an unambiguous day, abbreviated month and year", () => {
    expect(formatDate("2026-10-14", GB)).toBe("14 Oct 2026");
    expect(formatDate("2026-10-14", US)).toBe("Oct 14, 2026");
  });

  it("never produces a numeric date such as 04/11/2026", () => {
    for (const ctx of [US, GB, DE]) {
      for (const date of ["2026-04-11", "2026-11-04", "2026-01-02"]) {
        expect(formatDate(date, ctx)).not.toMatch(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/);
      }
    }
  });

  it("treats business dates as calendar dates, unaffected by time zones", () => {
    expect(formatDate("2026-01-01", { locale: "en-US" })).toBe("Jan 1, 2026");
  });

  it("rejects values that are not ISO dates", () => {
    expect(() => formatDate("04/11/2026", US)).toThrow(RangeError);
  });

  it("shows times in the workspace time zone, 12-hour only for en-US", () => {
    expect(formatTime("2026-10-20T13:14:00Z", US)).toBe("9:14 AM");
    expect(formatTime("2026-10-20T08:14:00Z", GB)).toBe("09:14");
    expect(formatDateTime("2026-10-20T08:14:00Z", GB)).toBe("20 Oct 2026, 09:14");
  });
});

describe("durations and relative time", () => {
  const now = new Date("2026-10-20T15:42:00Z");
  it.each([
    [30_000, "under 1 min"],
    [35 * 60_000, "35 min"],
    [130 * 60_000, "2 h 10 min"],
    [120 * 60_000, "2 h"],
    [(3 * 24 + 4) * 3_600_000, "3 d 4 h"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it("formats relative times", () => {
    expect(formatRelative("2026-10-20T15:41:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-20T15:07:00Z", now)).toBe("35 min ago");
    expect(formatRelative("2026-10-20T13:30:00Z", now)).toBe("2 h ago");
    expect(formatRelative("2026-10-17T15:42:00Z", now)).toBe("3 d ago");
  });
});

describe("quantities", () => {
  it("shows the product's decimals and the unit", () => {
    expect(formatQuantity("24", "EA", "en-US")).toBe("24 EA");
    expect(formatQuantity("12.5", "KG", "en-US", 1)).toBe("12.5 KG");
    expect(formatQuantity("1240", "EA", "en-US")).toBe("1,240 EA");
  });
});
