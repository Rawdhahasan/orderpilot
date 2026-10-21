import { parseDate, parseDecimal } from "@/domain/orders/parse";

describe("parseDate", () => {
  it("reads ISO dates without ambiguity", () => {
    expect(parseDate("2026-10-12")).toEqual({ value: "2026-10-12", ambiguous: false });
  });
  it("flags 04/05/2026 as ambiguous and follows the customer's hint", () => {
    expect(parseDate("04/05/2026", "dmy")).toEqual({ value: "2026-05-04", ambiguous: true });
    expect(parseDate("04/05/2026", "mdy")).toEqual({ value: "2026-04-05", ambiguous: true });
    expect(parseDate("04/05/2026", "unknown", "en-GB")).toEqual({
      value: "2026-05-04",
      ambiguous: true,
    });
  });
  it("is not ambiguous when only one reading is a date", () => {
    expect(parseDate("13/05/2026")).toEqual({ value: "2026-05-13", ambiguous: false });
    expect(parseDate("05/13/26")).toEqual({ value: "2026-05-13", ambiguous: false });
    expect(parseDate("07/07/2026")).toEqual({ value: "2026-07-07", ambiguous: false });
  });
  it("rejects impossible dates", () => {
    expect(parseDate("2026-02-30").value).toBeNull();
    expect(parseDate("next Tuesday").value).toBeNull();
  });
});

describe("parseDecimal", () => {
  it.each([
    ["1,234.50", "1234.50"],
    ["$8.95", "8.95"],
    ["1.234,50", "1234.50"],
    ["2,5", "2.5"],
    ["0040", "40"],
    ["12", "12"],
  ])("%s → %s", (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });
  it("returns null for text without a number", () => {
    expect(parseDecimal("n/a")).toBeNull();
    expect(parseDecimal("1.2.3")).toBeNull();
  });
});
