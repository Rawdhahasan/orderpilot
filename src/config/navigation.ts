import type { Permission } from "@/domain/auth/permissions";

/**
 * Navigation (docs/DESIGN_SYSTEM.md §12.1): eight destinations in three
 * groups, no nested menus. Items a role cannot use are hidden, not disabled.
 */
export type NavIconName =
  | "dashboard"
  | "customer-pos"
  | "approvals"
  | "sales-orders"
  | "customers"
  | "products"
  | "inventory"
  | "audit"
  | "settings";

export type NavItem = {
  key: NavIconName;
  label: string;
  /** Path below the workspace base path, for example `customer-pos`. */
  segment: string;
  /** Permission needed to see the item; undefined means every member. */
  permission?: Permission;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAVIGATION: NavGroup[] = [
  {
    label: "Work",
    items: [
      { key: "dashboard", label: "Dashboard", segment: "dashboard" },
      { key: "customer-pos", label: "Customer POs", segment: "customer-pos" },
      { key: "approvals", label: "Approvals", segment: "approvals", permission: "intake.approve" },
    ],
  },
  {
    label: "Records",
    items: [
      { key: "sales-orders", label: "Sales orders", segment: "sales-orders" },
      { key: "customers", label: "Customers", segment: "customers" },
      { key: "products", label: "Products", segment: "products" },
      { key: "inventory", label: "Inventory", segment: "inventory" },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "audit", label: "Audit log", segment: "audit", permission: "audit.view" },
      { key: "settings", label: "Settings", segment: "settings", permission: "settings.change" },
    ],
  },
];

/** Labels for URL segments, used by breadcrumbs. */
export const SEGMENT_LABELS: Record<string, string> = Object.fromEntries(
  NAVIGATION.flatMap((group) => group.items.map((item) => [item.segment, item.label])),
);
