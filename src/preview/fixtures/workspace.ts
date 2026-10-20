/**
 * FICTIONAL DEMONSTRATION DATA. Northstar Distribution, its people, customers
 * and products are invented for the development preview. Any resemblance to a
 * real organisation is coincidental. Email addresses use the reserved
 * `.example` domain.
 */
import type { PreviewUser, PreviewWorkspace } from "./types";

export const FICTIONAL = true as const;

/** Fixed preview clock so relative times and counts are deterministic. */
export const PREVIEW_NOW = new Date("2026-10-20T15:42:00Z");

export const WORKSPACE: PreviewWorkspace = {
  name: "Northstar Distribution",
  slug: "northstar",
  legalName: "Northstar Distribution LLC (fictional)",
  countryCode: "US",
  currency: "USD",
  locale: "en-US",
  timeZone: "America/New_York",
  salesOrderPrefix: "SO",
  requireIndependentApproval: true,
  priceTolerancePct: "0",
  confidenceThreshold: 0.85,
  duplicateLookbackDays: 30,
};

export const FORMAT = {
  locale: WORKSPACE.locale,
  currency: WORKSPACE.currency,
  timeZone: WORKSPACE.timeZone,
};

export const USERS: PreviewUser[] = [
  {
    id: "u-sofia",
    name: "Sofia Brandt",
    initials: "SB",
    email: "sofia.brandt@northstar.example",
    role: "owner",
    status: "active",
    lastActiveAt: "2026-10-20T13:05:00Z",
  },
  {
    id: "u-alex",
    name: "Alex Moreno",
    initials: "AM",
    email: "alex.moreno@northstar.example",
    role: "admin",
    status: "active",
    lastActiveAt: "2026-10-20T14:48:00Z",
  },
  {
    id: "u-priya",
    name: "Priya Raman",
    initials: "PR",
    email: "priya.raman@northstar.example",
    role: "approver",
    status: "active",
    lastActiveAt: "2026-10-20T15:31:00Z",
  },
  {
    id: "u-dana",
    name: "Dana Whitfield",
    initials: "DW",
    email: "dana.whitfield@northstar.example",
    role: "approver",
    status: "active",
    lastActiveAt: "2026-10-20T12:10:00Z",
  },
  {
    id: "u-jordan",
    name: "Jordan Ellis",
    initials: "JE",
    email: "jordan.ellis@northstar.example",
    role: "processor",
    status: "active",
    lastActiveAt: "2026-10-20T15:40:00Z",
  },
  {
    id: "u-casey",
    name: "Casey Nguyen",
    initials: "CN",
    email: "casey.nguyen@northstar.example",
    role: "processor",
    status: "active",
    lastActiveAt: "2026-10-20T15:12:00Z",
  },
  {
    id: "u-marc",
    name: "Marc Dubois",
    initials: "MD",
    email: "marc.dubois@northstar.example",
    role: "inventory_manager",
    status: "active",
    lastActiveAt: "2026-10-20T14:02:00Z",
  },
  {
    id: "u-sam",
    name: "Sam Patel",
    initials: "SP",
    email: "sam.patel@northstar.example",
    role: "viewer",
    status: "suspended",
    lastActiveAt: "2026-09-28T16:20:00Z",
  },
];

export const PENDING_INVITATIONS = [
  {
    email: "taylor.brooks@northstar.example",
    role: "processor" as const,
    invitedBy: "Alex Moreno",
    expiresAt: "2026-10-25T14:00:00Z",
  },
];

/** People the preview role switcher can show the product as. Demonstration only. */
export const PERSONA_IDS = ["u-sofia", "u-alex", "u-priya", "u-jordan", "u-marc", "u-sam"] as const;

export function userById(id: string | null | undefined): PreviewUser | undefined {
  return id ? USERS.find((user) => user.id === id) : undefined;
}

export function userName(id: string | null | undefined): string {
  return userById(id)?.name ?? "Unassigned";
}
