import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/states/empty-state";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { PhaseNotice } from "@/components/states/phase-notice";

describe("empty, permission and phase states", () => {
  it("explains what belongs in an empty view", () => {
    render(<EmptyState title="No customer POs yet" description="Upload a PO to start." />);
    expect(screen.getByText("No customer POs yet")).toBeVisible();
  });

  it("names the role needed and who to ask", () => {
    render(<NoPermissionState roleNeeded="Approver" action="approve orders" />);
    expect(
      screen.getByText(/You need the Approver role to approve orders\. Ask a workspace Owner\./),
    ).toBeVisible();
  });

  it("states which phase delivers an unbuilt feature", () => {
    render(<PhaseNotice phase="4B" feature="The PDF viewer" />);
    expect(screen.getByText(/arrives in/)).toHaveTextContent("The PDF viewer arrives in Phase 4B.");
  });
});
