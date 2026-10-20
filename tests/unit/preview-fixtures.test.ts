import { describe, expect, it } from "vitest";

import { PREVIEW_BANNER_TEXT } from "@/preview/components/preview-shell";
import {
  APPROVALS,
  CUSTOMERS,
  FIXTURE_MODULES,
  INTAKES,
  SALES_ORDERS,
  USERS,
  WORKSPACE,
  approvalFor,
  dashboardMetrics,
  intakeById,
  intakeSubtotal,
  reviewFor,
} from "@/preview/fixtures";
import { intakeExceptionCounts } from "@/preview/review/counts";
import {
  canBulkConfirm,
  deriveExceptions,
  initialState,
  submissionBlockers,
} from "@/preview/review/model";
import { reviewReducer, type ReviewAction } from "@/preview/review/reducer";
import { allocationsFor } from "@/preview/screens/approval-summary-screen";

describe("fixtures are explicitly fictional (FR-PREV-01)", () => {
  it("labels every fixture module FICTIONAL", () => {
    for (const [name, module] of Object.entries(FIXTURE_MODULES)) {
      expect((module as { FICTIONAL?: boolean }).FICTIONAL, name).toBe(true);
    }
  });

  it("uses the fictional workspace name and the exact banner text", () => {
    expect(WORKSPACE.name).toBe("Northstar Distribution");
    expect(PREVIEW_BANNER_TEXT).toBe("Development Preview — Fictional Data");
  });

  it("uses only reserved .example email domains", () => {
    const emails = [...USERS.map((u) => u.email), ...CUSTOMERS.map((c) => c.contactEmail)];
    for (const email of emails) expect(email).toMatch(/@[a-z0-9.-]+\.example$/);
  });
});

describe("fixture figures are consistent", () => {
  it("reconciles the Harbor & Pine PO lines with its printed total", () => {
    expect(intakeSubtotal(intakeById("in-001042")!)).toBe(reviewFor("in-001042")!.printedTotal);
  });

  it("has unique sales order numbers and links every order to an intake", () => {
    expect(new Set(SALES_ORDERS.map((o) => o.number)).size).toBe(SALES_ORDERS.length);
    for (const order of SALES_ORDERS)
      expect(intakeById(order.intakeId)?.salesOrderId).toBe(order.id);
  });

  it("computes dashboard counts from intake statuses", () => {
    const m = dashboardMetrics();
    expect(m.inReview).toBe(INTAKES.filter((i) => i.status === "in_review").length);
    expect(m.pending).toBe(INTAKES.filter((i) => i.status === "pending_approval").length);
  });

  it("derives list exception counts with the review rules", () => {
    const fromList = intakeExceptionCounts(intakeById("in-001042")!);
    const fromReview = deriveExceptions(initialState(reviewFor("in-001042"), "in-001042", null));
    expect(fromList?.blocking).toBe(fromReview.filter((e) => e.severity === "blocking").length);
  });
});

describe("review model (preview only)", () => {
  const review = reviewFor("in-001042")!;
  const start = () => initialState(review, "in-001042", "u-jordan");
  const codes = (state = start()) =>
    deriveExceptions(state)
      .map((e) => e.code)
      .sort();

  it("raises the realistic problems in the messy fixture", () => {
    expect(codes()).toEqual(
      [
        "CUSTOMER_UNMATCHED",
        "DATE_AMBIGUOUS",
        "INSUFFICIENT_STOCK",
        "INSUFFICIENT_STOCK",
        "PRICE_MISMATCH",
        "PRODUCT_UNMATCHED",
        "SHIP_TO_MISSING",
        "UNCONFIRMED_FIELDS",
        "UOM_MISMATCH",
      ].sort(),
    );
  });

  it("never fabricates values for an unrecognised document (PR-07)", () => {
    const manual = initialState(undefined, "in-001046", null);
    expect(manual.manualEntry).toBe(true);
    expect(manual.lines).toHaveLength(0);
    expect(
      manual.header
        .filter((f) => f.state !== "system_default")
        .every((f) => f.value === "" && f.state === "missing"),
    ).toBe(true);
  });

  it("excludes low-confidence and description matches from bulk confirmation (D-06)", () => {
    const state = start();
    const eligible = state.lines.filter((l) => canBulkConfirm(l)).map((l) => l.lineNo);
    expect(eligible).not.toContain(5); // 61 % quantity confidence
    expect(eligible).not.toContain(6); // suggested by description
    expect(eligible).not.toContain(7); // not matched
  });

  it("allows submission once only overridable or no blocking exceptions remain (C-01)", () => {
    const actions: ReviewAction[] = [
      { type: "confirmCustomer" },
      { type: "confirmField", key: "po_number", by: "Jordan" },
      { type: "confirmField", key: "po_date", by: "Jordan" },
      { type: "chooseAlternative", key: "requested_date", value: "2026-11-04", by: "Jordan" },
      { type: "confirmField", key: "payment_terms", by: "Jordan" },
      { type: "confirmField", key: "notes", by: "Jordan" },
      { type: "setShipTo", addressId: "a-harbor-dc" },
      { type: "applyConversion", lineNo: 3, factor: 4, note: "Case of 4" },
      { type: "choosePrice", lineNo: 4, choice: "expected" },
      { type: "confirmQuantity", lineNo: 5 },
      { type: "confirmMatch", lineNo: 6 },
      { type: "chooseProduct", lineNo: 7, sku: "JAN-3150" },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(
        (lineNo) => ({ type: "confirmLine", lineNo, by: "Jordan" }) as ReviewAction,
      ),
    ];
    const final = actions.reduce(reviewReducer, start());
    expect(submissionBlockers(deriveExceptions(final))).toEqual([]);
    // Stock warnings remain visible but do not block.
    expect(deriveExceptions(final).every((e) => e.severity === "warning")).toBe(true);
    // The converted line is priced per selling unit and matches the catalog.
    expect(final.lines.find((l) => l.lineNo === 3)?.quantity).toBe("20");
  });

  it("does not change the fixture when actions run (no persistence)", () => {
    const before = JSON.stringify(review);
    reviewReducer(start(), { type: "confirmCustomer" });
    expect(JSON.stringify(review)).toBe(before);
  });
});

describe("approval allocation preview (M-01, M-03)", () => {
  it("allocates nothing from zero stock and backorders the whole line", () => {
    const wipes = allocationsFor(approvalFor("in-001040")!).find((a) => a.sku === "JAN-3150")!;
    expect(wipes.allocated).toBe("0");
    expect(wipes.backordered).toBe("24");
  });

  it("allocates untracked products in full without a stock check", () => {
    const aprons = allocationsFor(approvalFor("in-001041")!).find((a) => a.sku === "FS-7002")!;
    expect(aprons.tracked).toBe(false);
    expect(aprons.allocated).toBe("10");
    expect(aprons.backordered).toBe("0");
  });

  it("reserves what is available and backorders the rest", () => {
    const cups = allocationsFor(approvalFor("in-001041")!).find((a) => a.sku === "FS-5101")!;
    expect([cups.allocated, cups.backordered]).toEqual(["23", "7"]);
  });

  it("covers every pending approval with a fixture", () => {
    const pending = INTAKES.filter((i) => i.status === "pending_approval")
      .map((i) => i.id)
      .sort();
    expect(APPROVALS.map((a) => a.intakeId).sort()).toEqual(pending);
  });
});
