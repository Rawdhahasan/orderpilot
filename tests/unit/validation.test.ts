import { createHash } from "node:crypto";

import { validate, type ValidationInput, type ValidationLine } from "@/domain/orders/validation";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const line = (over: Partial<ValidationLine> = {}): ValidationLine => ({
  id: "l1",
  lineNo: 1,
  productId: "p1",
  productStatus: "active",
  sellingUom: "BX",
  quantityDecimals: 0,
  poUom: "BX",
  uomConversionNote: null,
  quantity: "10",
  unitPrice: "8.95",
  poUnitPrice: "8.95",
  expectedPrice: "8.95",
  available: "100",
  fieldMeta: {},
  ...over,
});

const base = (
  over: Partial<ValidationInput["intake"]> = {},
  lines: ValidationLine[] = [line()],
  dup: Partial<ValidationInput["duplicates"]> = {},
): ValidationInput => ({
  today: "2026-10-21",
  workspace: { baseCurrency: "USD", priceTolerancePct: 0 },
  intake: {
    customerId: "c1",
    customerStatus: "active",
    poNumber: "PO-1",
    requestedDeliveryDate: null,
    currency: "USD",
    hasShipTo: true,
    shipToAddressId: "a1",
    shipToOnFile: true,
    documentTotal: null,
    fieldMeta: {},
    ...over,
  },
  duplicates: {
    poConflicts: [],
    poFingerprint: "f",
    documentConflicts: [],
    documentFingerprint: "g",
    possibleDuplicates: [],
    ...dup,
  },
  lines,
});

const codes = (input: ValidationInput) =>
  validate(input, hash)
    .map((e) => e.code)
    .sort();

describe("validation engine", () => {
  it("a clean order raises nothing", () => {
    expect(codes(base())).toEqual([]);
  });

  it.each([
    [{ customerId: null, customerStatus: null }, "CUSTOMER_UNMATCHED"],
    [{ customerStatus: "on_hold" as const }, "CUSTOMER_ON_HOLD"],
    [{ customerStatus: "inactive" as const }, "CUSTOMER_INACTIVE"],
    [{ poNumber: " " }, "PO_NUMBER_MISSING"],
    [{ hasShipTo: false, shipToAddressId: null }, "SHIP_TO_MISSING"],
    [{ shipToAddressId: null, shipToOnFile: false }, "SHIP_TO_NOT_ON_FILE"],
    [{ currency: "GBP" }, "CURRENCY_MISMATCH"],
    [{ requestedDeliveryDate: "2026-10-01" }, "REQUESTED_DATE_PAST"],
    [{ documentTotal: "90.00" }, "TOTAL_MISMATCH"],
    [
      { fieldMeta: { customer_po_number: { source: "ai" as const, state: "suggested" } } },
      "UNCONFIRMED_FIELDS",
    ],
    [
      { fieldMeta: { po_date: { source: "ai" as const, state: "suggested", ambiguous: true } } },
      "DATE_AMBIGUOUS",
    ],
  ])("header rule %j raises %s", (over, code) => {
    expect(codes(base(over))).toContain(code);
  });

  it.each([
    [{ productId: null, productStatus: null }, "PRODUCT_UNMATCHED"],
    [{ productStatus: "discontinued" as const }, "PRODUCT_DISCONTINUED"],
    [{ quantity: "0" }, "QUANTITY_INVALID"],
    [{ quantity: "1.5" }, "QUANTITY_INVALID"],
    [{ quantity: null }, "QUANTITY_INVALID"],
    [{ poUom: "CS" }, "UOM_MISMATCH"],
    [{ unitPrice: "9.95" }, "PRICE_MISMATCH"],
    [{ poUnitPrice: null }, "PRICE_MISSING"],
    [{ quantity: "500" }, "INSUFFICIENT_STOCK"],
    [
      { fieldMeta: { quantity: { source: "ai" as const, state: "suggested" } } },
      "UNCONFIRMED_FIELDS",
    ],
  ])("line rule %j raises %s", (over, code) => {
    expect(codes(base({}, [line(over)]))).toContain(code);
  });

  it("severity follows the catalogue", () => {
    const all = validate(
      base({ customerStatus: "on_hold", requestedDeliveryDate: "2026-01-01" }, [
        line({ quantity: "500" }),
      ]),
      hash,
    );
    expect(all.find((e) => e.code === "CUSTOMER_ON_HOLD")?.severity).toBe("blocking");
    expect(all.find((e) => e.code === "REQUESTED_DATE_PAST")?.severity).toBe("warning");
    expect(all.find((e) => e.code === "INSUFFICIENT_STOCK")?.severity).toBe("warning");
  });

  it("a unit conversion note resolves a unit mismatch", () => {
    expect(codes(base({}, [line({ poUom: "CS", uomConversionNote: "1 CS = 10 BX" })]))).toEqual([]);
  });

  it("a recorded price decision resolves a price mismatch; within tolerance needs none", () => {
    expect(
      codes(
        base({}, [
          line({ unitPrice: "9.95", fieldMeta: { unit_price: { price_decision: "po" } } }),
        ]),
      ),
    ).toEqual([]);
    const tolerant = base({}, [line({ unitPrice: "9.00" })]);
    tolerant.workspace.priceTolerancePct = 1;
    expect(codes(tolerant)).toEqual([]);
  });

  it("duplicates use the database conflict fingerprint so overrides match", () => {
    const result = validate(
      base({}, [line()], {
        poConflicts: [{ type: "sales_order", id: "s1" }],
        poFingerprint: "abc",
      }),
      hash,
    );
    expect(result.find((e) => e.code === "DUPLICATE_PO_NUMBER")?.fingerprint).toBe("abc");
  });

  it("the same product on two lines is a warning", () => {
    expect(codes(base({}, [line(), line({ id: "l2", lineNo: 2 })]))).toEqual(["DUPLICATE_LINE"]);
  });

  it("a fingerprint changes when the values it looked at change", () => {
    const a = validate(base({}, [line({ unitPrice: "9.95" })]), hash)[0]!.fingerprint;
    const b = validate(base({}, [line({ unitPrice: "9.99" })]), hash)[0]!.fingerprint;
    expect(a).not.toBe(b);
  });
});
