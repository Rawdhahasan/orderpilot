/** Every development preview route, with a heading that proves it rendered. */
export const PREVIEW_ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/preview/dashboard", heading: /^Dashboard$/ },
  { path: "/preview/customer-pos", heading: /^Customer POs$/ },
  { path: "/preview/customer-pos/in-001042", heading: /IN-001042/ },
  { path: "/preview/customer-pos/in-001043", heading: /IN-001043/ },
  { path: "/preview/customer-pos/in-001046", heading: /IN-001046/ },
  { path: "/preview/customer-pos/in-001044", heading: /IN-001044/ },
  { path: "/preview/customer-pos/in-001045", heading: /IN-001045/ },
  { path: "/preview/customer-pos/in-001036", heading: /IN-001036/ },
  { path: "/preview/approvals", heading: /^Approvals$/ },
  { path: "/preview/approvals/in-001041", heading: /Approve IN-001041/ },
  { path: "/preview/approvals/in-001040", heading: /Approve IN-001040/ },
  { path: "/preview/approvals/in-001039", heading: /Approve IN-001039/ },
  { path: "/preview/sales-orders", heading: /^Sales orders$/ },
  { path: "/preview/sales-orders/so-000408", heading: /SO-2026-000408/ },
  { path: "/preview/sales-orders/so-000411", heading: /SO-2026-000411/ },
  { path: "/preview/customers", heading: /^Customers$/ },
  { path: "/preview/products", heading: /^Products$/ },
  { path: "/preview/inventory", heading: /^Inventory$/ },
  { path: "/preview/audit", heading: /^Audit log$/ },
  { path: "/preview/components", heading: /^Component gallery$/ },
];

/** Settings needs an Owner or Admin persona; covered separately. */
export const SETTINGS_ROUTE = "/preview/settings";

export const BANNER = "Development Preview — Fictional Data";
