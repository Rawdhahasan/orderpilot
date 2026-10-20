import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatTile } from "@/components/dashboard/stat-tile";

describe("stat tiles (FR-DASH-05)", () => {
  it("shows the value and its context", () => {
    render(<StatTile label="Awaiting approval" value="3" context="Oldest waiting 2 h" />);
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("Oldest waiting 2 h")).toBeVisible();
  });

  it("never shows a placeholder number when there is not enough data", () => {
    const { container } = render(
      <StatTile label="Median upload to approval" value={null} context="Last 7 days" />,
    );
    expect(screen.getByText("Not enough data yet")).toBeVisible();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("links to the records behind the number", () => {
    render(<StatTile label="Awaiting review" value="3" href="/preview/customer-pos" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/preview/customer-pos");
  });
});
