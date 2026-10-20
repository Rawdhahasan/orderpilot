/** Workspace roles (docs/DATABASE_ARCHITECTURE.md §5, `member_role`). */
export const ROLES = [
  "owner",
  "admin",
  "approver",
  "processor",
  "inventory_manager",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  approver: "Approver",
  processor: "Processor",
  inventory_manager: "Inventory Manager",
  viewer: "Viewer",
};
