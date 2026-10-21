import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ProvenanceMarker,
  isUnconfirmedSuggestion,
  provenanceFieldClass,
  type Provenance,
} from "@/components/provenance/provenance-marker";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PROVENANCE_STATES } from "@/domain/orders/statuses";

const renderMarker = (provenance: Provenance) =>
  render(
    <TooltipProvider>
      <ProvenanceMarker provenance={provenance} />
    </TooltipProvider>,
  );

describe("provenance markers (DESIGN_SYSTEM.md §9.6)", () => {
  it("uses violet only for unconfirmed AI suggestions", () => {
    for (const state of PROVENANCE_STATES) {
      const violet = /\bai-/.test(provenanceFieldClass(state));
      expect(violet, state).toBe(isUnconfirmedSuggestion(state));
    }
  });

  it("shows confidence on a suggestion", () => {
    renderMarker({ state: "suggested", confidence: 0.97, page: 1 });
    expect(screen.getByRole("button", { name: /Suggested · 97%/ })).toBeVisible();
  });

  it("asks for an individual check below the threshold", () => {
    renderMarker({ state: "suggested_low", confidence: 0.61 });
    expect(
      screen.getByRole("button", { name: /Check · 61%.*confirm this value individually/ }),
    ).toBeVisible();
  });

  it("shows no percentage when the model gives no calibrated confidence (real AI)", () => {
    renderMarker({ state: "suggested_low", page: 2 });
    expect(
      screen.getByRole("button", { name: /^Check\b(?!.*%).*page 2.*against the document/ }),
    ).toBeVisible();
  });

  it("lists alternatives for ambiguous values", () => {
    renderMarker({ state: "ambiguous", alternatives: ["Nov 4", "Apr 11"] });
    expect(screen.getByText(/Ambiguous: Nov 4 or Apr 11/)).toBeVisible();
  });

  it("gives icon-only markers an accessible name", () => {
    renderMarker({ state: "confirmed", by: "Jordan Ellis", at: "09:14" });
    expect(
      screen.getByRole("button", { name: /Confirmed by Jordan Ellis, 09:14/ }),
    ).toBeInTheDocument();
  });

  it("keeps the original AI value after an edit", () => {
    renderMarker({ state: "edited", aiValue: "12", by: "Jordan Ellis" });
    expect(
      screen.getByRole("button", { name: /AI suggested 12\. Changed by Jordan Ellis/ }),
    ).toBeInTheDocument();
  });

  it("never shows a sample value for missing data", () => {
    renderMarker({ state: "missing" });
    expect(screen.getByText("Not found on document")).toBeVisible();
  });

  it("labels system defaults with their source", () => {
    renderMarker({ state: "system_default", sourceLabel: "Customer default" });
    expect(screen.getByText("Customer default")).toBeVisible();
  });
});
