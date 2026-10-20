import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  INTAKE_STATUS,
  IntakeStatusBadge,
  StockStatusBadge,
} from "@/components/status/status-badge";
import { INTAKE_STATUSES } from "@/domain/orders/statuses";

describe("status badges (DESIGN_SYSTEM.md §9.4)", () => {
  it.each(INTAKE_STATUSES)("renders a text label for intake status %s", (status) => {
    render(<IntakeStatusBadge status={status} />);
    expect(screen.getByText(INTAKE_STATUS[status].label)).toBeVisible();
  });

  it("never relies on colour alone: over-committed has text and an icon", () => {
    const { container } = render(<StockStatusBadge status="over_committed" />);
    expect(screen.getByText("Over-committed")).toBeVisible();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
