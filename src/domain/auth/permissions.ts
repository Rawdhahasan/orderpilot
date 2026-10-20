import type { Role } from "./roles";

/**
 * Permission map from docs/PRODUCT_REQUIREMENTS.md §8. This module drives what
 * the UI shows. It is not a security control on its own: from Phase 2 the
 * server and the database enforce the same rules, and a test compares this
 * map with the database role checks (docs/TECHNICAL_ARCHITECTURE.md §7.2).
 */
const PERMISSION_ROLES = {
  "records.view": ["owner", "admin", "approver", "processor", "inventory_manager", "viewer"],
  "timeline.view": ["owner", "admin", "approver", "processor", "inventory_manager", "viewer"],
  "intake.upload": ["owner", "admin", "approver", "processor"],
  "intake.review": ["owner", "admin", "approver", "processor"],
  "intake.submit": ["owner", "admin", "approver", "processor"],
  "intake.withdraw_any": ["owner", "admin", "approver"],
  "intake.withdraw_own": ["owner", "admin", "approver", "processor"],
  "intake.cancel": ["owner", "admin", "approver", "processor"],
  "intake.approve": ["owner", "admin", "approver"],
  "exception.override": ["owner", "admin", "approver"],
  "sales_order.cancel": ["owner", "admin", "approver"],
  "sales_order.fulfil": ["owner", "admin", "approver", "inventory_manager"],
  "customer.edit": ["owner", "admin", "approver", "processor"],
  "customer.hold": ["owner", "admin", "approver"],
  "customer.deactivate": ["owner", "admin"],
  "customer_alias.manage": ["owner", "admin", "approver", "processor"],
  "product.edit": ["owner", "admin", "inventory_manager"],
  "price.change": ["owner", "admin"],
  "stock.change": ["owner", "admin", "inventory_manager"],
  "import.run": ["owner", "admin"],
  "audit.view": ["owner", "admin", "approver"],
  "audit.export": ["owner", "admin"],
  "member.manage": ["owner", "admin"],
  "owner.grant": ["owner"],
  "settings.change": ["owner", "admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSION_ROLES;

export const PERMISSIONS = Object.keys(PERMISSION_ROLES) as Permission[];

export function rolesWith(permission: Permission): readonly Role[] {
  return PERMISSION_ROLES[permission];
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSION_ROLES[permission] as readonly Role[]).includes(role);
}
