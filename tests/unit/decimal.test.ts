import { describe, expect, it } from "vitest";

import {
  add,
  allocate,
  compare,
  divideBy,
  lineTotal,
  multiplyBy,
  normalize,
  round,
  subtract,
  sumMoney,
} from "@/domain/money/decimal";

describe("exact decimal arithmetic (DATABASE_ARCHITECTURE.md §3)", () => {
  it("computes line totals as round(quantity × unit price, 2), half away from zero", () => {
    expect(lineTotal("3", "0.0125")).toBe("0.04"); // 0.0375 → 0.04
    expect(lineTotal("1", "2.0050")).toBe("2.01");
    expect(lineTotal("1", "-2.0050")).toBe("-2.01");
    expect(lineTotal("12.5", "6.2")).toBe("77.50");
  });

  it("does not suffer from binary floating point errors", () => {
    expect(add("0.1", "0.2")).toBe("0.3000000");
    expect(compare(add("0.1", "0.2"), "0.3")).toBe(0);
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
  });

  it("subtracts and rounds", () => {
    expect(normalize(subtract("48", "56"), 0)).toBe("-8");
    expect(round("2.345", 2)).toBe("2.35");
    expect(round("-2.345", 2)).toBe("-2.35");
  });

  it("divides and multiplies by pack sizes exactly", () => {
    expect(divideBy("47.2000", 4, 4)).toBe("11.8000");
    expect(divideBy("10", 3, 4)).toBe("3.3333");
    expect(normalize(multiplyBy("5", 4), 0)).toBe("20");
    expect(() => divideBy("1", 0, 2)).toThrow(RangeError);
  });

  it("rejects malformed input instead of guessing", () => {
    expect(() => add("1,5")).toThrow(RangeError);
    expect(() => add("abc")).toThrow(RangeError);
  });
});

describe("allocation (M-03)", () => {
  it("allocates the smaller of requested and available", () => {
    expect(normalize(allocate("30", "23"), 0)).toBe("23");
    expect(normalize(allocate("10", "40"), 0)).toBe("10");
  });

  it("allocates nothing when stock is zero or over-committed", () => {
    expect(normalize(allocate("24", "0"), 0)).toBe("0");
    expect(normalize(allocate("6", "-8"), 0)).toBe("0");
  });
});
