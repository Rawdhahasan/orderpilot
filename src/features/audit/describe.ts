/** Plain-language descriptions of audit events (FR-AUD-03). */
const ACTIONS: Record<string, string> = {
  "inbound_order.received": "uploaded the customer PO",
  "inbound_order.submitted": "submitted it for approval",
  "inbound_order.withdrawn": "withdrew it from approval",
  "inbound_order.changes_requested": "requested changes",
  "inbound_order.rejected": "rejected it",
  "inbound_order.cancelled": "cancelled it",
  "inbound_order.approved": "approved it",
  "inbound_order.manual_entry": "switched to manual entry",
  "inbound_order.updated": "updated the order",
  "inbound_order.created": "created the intake",
  "inbound_order_line.created": "added a line",
  "inbound_order_line.updated": "changed a line",
  "exception.created": "raised an exception",
  "exception.updated": "updated an exception",
  "exception.overridden": "overrode an exception",
  "exception.reopened": "re-opened an override",
  "extraction.completed": "finished reading the document",
  "extraction.failed": "could not read the document",
  "extraction.retry_scheduled": "scheduled another extraction attempt",
  "extraction.retried": "retried extraction",
  "extraction_run.created": "queued extraction",
  "extraction_run.updated": "updated extraction",
  "sales_order.created": "created the sales order",
  "sales_order.confirmed": "confirmed the sales order",
  "sales_order.fulfilled": "marked it fulfilled",
  "sales_order.cancelled": "cancelled the sales order",
  "sales_order.updated": "updated the sales order",
  "sales_order_line.created": "added a sales order line",
  "sales_order_line.backorder_handled": "marked a backorder handled externally",
  "inventory_movement.created": "moved stock",
  "customer.created": "created the customer",
  "customer.updated": "changed the customer",
  "product.created": "created the product",
  "product.updated": "changed the product",
};

const HIDDEN = new Set([
  "field_meta",
  "id",
  "organization_id",
  "inbound_order_id",
  "source_document_id",
  "latest_extraction_run_id",
]);

function short(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "object") return "…";
  const text = String(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export function describeEvent(
  action: string,
  changes: Record<string, [unknown, unknown]> | null,
  metadata: Record<string, unknown> | null,
): { summary: string; detail?: string } {
  const summary = ACTIONS[action] ?? action.replace(".", " ").replaceAll("_", " ");
  const parts: string[] = [];
  if (changes && action.endsWith(".updated")) {
    for (const [field, pair] of Object.entries(changes).slice(0, 6)) {
      if (HIDDEN.has(field) || !Array.isArray(pair)) continue;
      parts.push(`${field.replaceAll("_", " ")}: ${short(pair[0])} → ${short(pair[1])}`);
    }
  }
  if (metadata?.order_number) parts.push(String(metadata.order_number));
  if (metadata?.code) parts.push(String(metadata.code));
  return { summary, detail: parts.join("; ") || undefined };
}
