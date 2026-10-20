import { describe, expect, it } from "vitest";

import { stockStatus, toThousandths } from "@/domain/orders/statuses";

describe("stock status (FR-INV-01)", () => {
  it.each([
    ["640", "120", "150", "in_stock"],
    ["180", "60", "150", "low"],
    ["0", "0", "48", "out_of_stock"],
    ["40", "40", null, "out_of_stock"],
    ["48", "56", "40", "over_committed"],
    ["142.5", "20.0", "50", "in_stock"],
  ] as const)("on hand %s, reserved %s, reorder %s → %s", (onHand, reserved, reorder, expected) => {
    expect(stockStatus(onHand, reserved, reorder)).toBe(expected);
  });

  it("parses quantities exactly into thousandths", () => {
    expect(toThousandths("12.5")).toBe(12_500n);
    expect(toThousandths("-0.001")).toBe(-1n);
    expect(() => toThousandths("1.2345")).toThrow(RangeError);
  });
});
