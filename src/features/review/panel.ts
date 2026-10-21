import "server-only";

import type { PanelException } from "./exceptions-panel";
import type { ReviewSnapshot } from "./server";

/** Exceptions with line numbers and how each was closed, for the panels. */
export function toPanel(s: ReviewSnapshot): PanelException[] {
  const lineNo = new Map(s.lines.map((l) => [l.id, l.line_no]));
  return s.exceptions.map((e) => ({
    id: e.id,
    code: e.code,
    severity: e.severity,
    overridable: e.overridable,
    status: e.status,
    message: e.message,
    lineNo: e.inbound_order_line_id ? (lineNo.get(e.inbound_order_line_id) ?? null) : null,
    resolution:
      e.status === "overridden"
        ? `Overridden by ${e.overrider?.full_name ?? "an approver"}: ${e.override_reason}`
        : e.status === "acknowledged"
          ? `Acknowledged by ${e.resolver?.full_name ?? "a reviewer"}`
          : e.status === "resolved"
            ? (e.resolution_note ?? "Resolved")
            : null,
  }));
}
