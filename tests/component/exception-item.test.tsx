import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExceptionItem } from "@/components/exceptions/exception-item";

describe("exception items (DESIGN_SYSTEM.md §9.5)", () => {
  it("explains the problem and offers its fix", () => {
    render(
      <ExceptionItem
        code="UOM_MISMATCH"
        severity="blocking"
        title="Unit mismatch"
        scope="Line 4"
        message="PO says 5 CS; product sells in EA."
        actions={<button type="button">Convert quantity</button>}
      />,
    );
    expect(screen.getByRole("article", { name: "Blocking: Unit mismatch, Line 4" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Convert quantity" })).toBeVisible();
  });

  it("marks items that need an approver override", () => {
    render(
      <ExceptionItem
        code="CUSTOMER_ON_HOLD"
        severity="blocking"
        title="Customer on hold"
        scope="Header"
        message="On hold."
        status="override_required"
      />,
    );
    expect(screen.getByText("Override required by an approver")).toBeVisible();
  });

  it("hides actions once resolved and shows who resolved it", () => {
    render(
      <ExceptionItem
        code="DUPLICATE_PO_NUMBER"
        severity="blocking"
        title="Duplicate PO number"
        scope="Header"
        message="Already received."
        status="overridden"
        resolution="Overridden by Priya Raman"
        actions={<button type="button">Override</button>}
      />,
    );
    expect(screen.queryByRole("button", { name: "Override" })).toBeNull();
    expect(screen.getByText("Overridden by Priya Raman")).toBeVisible();
  });
});
