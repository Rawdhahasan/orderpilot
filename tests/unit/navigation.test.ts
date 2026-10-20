import { describe, expect, it } from "vitest";

import { NAVIGATION, SEGMENT_LABELS } from "@/config/navigation";
import { navigationFor } from "@/domain/auth/navigation-access";
import type { Role } from "@/domain/auth/roles";

const keys = (role: Role) =>
  navigationFor(role, NAVIGATION).flatMap((g) => g.items.map((i) => i.key));

describe("navigation (DESIGN_SYSTEM.md §12.1)", () => {
  it("has eight destinations plus settings in three groups", () => {
    expect(NAVIGATION.map((g) => g.label)).toEqual(["Work", "Records", "Admin"]);
    expect(NAVIGATION.flatMap((g) => g.items)).toHaveLength(9);
  });

  it("shows everything to Owners and Admins", () => {
    expect(keys("owner")).toHaveLength(9);
    expect(keys("admin")).toHaveLength(9);
  });

  it("hides approvals, audit and settings from a Viewer", () => {
    expect(keys("viewer")).toEqual([
      "dashboard",
      "customer-pos",
      "sales-orders",
      "customers",
      "products",
      "inventory",
    ]);
  });

  it("shows approvals and audit but not settings to an Approver", () => {
    const approver = keys("approver");
    expect(approver).toContain("approvals");
    expect(approver).toContain("audit");
    expect(approver).not.toContain("settings");
  });

  it("drops empty groups", () => {
    expect(navigationFor("processor", NAVIGATION).map((g) => g.label)).toEqual(["Work", "Records"]);
  });

  it("labels every segment for breadcrumbs", () => {
    expect(SEGMENT_LABELS["customer-pos"]).toBe("Customer POs");
  });
});
