import { describe, expect, it } from "vitest";

import { PERMISSIONS, can, rolesWith, type Permission } from "@/domain/auth/permissions";
import { ROLES, type Role } from "@/domain/auth/roles";

/**
 * Written out independently from docs/PRODUCT_REQUIREMENTS.md §8 so that a
 * change to either the document or the code is caught.
 * Columns: Owner, Admin, Approver, Processor, Inventory Manager, Viewer.
 */
const MATRIX: Record<Permission, string> = {
  "records.view": "OAPPIV",
  "timeline.view": "OAPPIV",
  "intake.upload": "OAPP--",
  "intake.review": "OAPP--",
  "intake.submit": "OAPP--",
  "intake.withdraw_any": "OAP---",
  "intake.withdraw_own": "OAPP--",
  "intake.cancel": "OAPP--",
  "intake.approve": "OAP---",
  "exception.override": "OAP---",
  "sales_order.cancel": "OAP---",
  "sales_order.fulfil": "OAP-I-",
  "customer.edit": "OAPP--",
  "customer.hold": "OAP---",
  "customer.deactivate": "OA----",
  "customer_alias.manage": "OAPP--",
  "product.edit": "OA--I-",
  "price.change": "OA----",
  "stock.change": "OA--I-",
  "import.run": "OA----",
  "audit.view": "OAP---",
  "audit.export": "OA----",
  "member.manage": "OA----",
  "owner.grant": "O-----",
  "settings.change": "OA----",
};

describe("permission map matches PRODUCT_REQUIREMENTS.md §8", () => {
  it("covers every permission in the matrix and nothing else", () => {
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  for (const permission of Object.keys(MATRIX) as Permission[]) {
    it(permission, () => {
      const expected = ROLES.filter((_, i) => MATRIX[permission][i] !== "-");
      expect([...rolesWith(permission)].sort()).toEqual([...expected].sort());
    });
  }

  it("never lets a Viewer change anything", () => {
    const writes = PERMISSIONS.filter((p) => !p.endsWith(".view"));
    for (const p of writes) expect(can("viewer", p)).toBe(false);
  });

  it("only lets Approver+ approve or override (PR-01, FR-APR-05)", () => {
    const approvers: Role[] = ["owner", "admin", "approver"];
    for (const role of ROLES) {
      expect(can(role, "intake.approve")).toBe(approvers.includes(role));
      expect(can(role, "exception.override")).toBe(approvers.includes(role));
    }
  });
});
