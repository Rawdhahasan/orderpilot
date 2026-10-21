import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/server/supabase/server";

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas and quote every field.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** FR-SO-07 (Should): a sales order as CSV for manual ERP entry. */
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; salesOrderId: string }> },
) {
  const { salesOrderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(salesOrderId)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("sales_orders")
    .select(
      "order_number, customer_po_number, currency, status, customer:customers(name, account_number)",
    )
    .eq("id", salesOrderId)
    .maybeSingle();
  if (!order) return new NextResponse("Not found", { status: 404 });
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select(
      "line_no, sku, product_name, customer_part_number, quantity, uom, unit_price, line_total, allocated_qty, backordered_qty",
    )
    .eq("sales_order_id", salesOrderId)
    .order("line_no");
  const header = [
    "order_number",
    "customer",
    "account_number",
    "customer_po_number",
    "currency",
    "status",
    "line_no",
    "sku",
    "product",
    "customer_part_number",
    "quantity",
    "uom",
    "unit_price",
    "line_total",
    "reserved",
    "backordered",
  ];
  const rows = (lines ?? []).map((l) =>
    [
      order.order_number,
      order.customer?.name,
      order.customer?.account_number,
      order.customer_po_number,
      order.currency,
      order.status,
      l.line_no,
      l.sku,
      l.product_name,
      l.customer_part_number,
      l.quantity,
      l.uom,
      l.unit_price,
      l.line_total,
      l.allocated_qty,
      l.backordered_qty,
    ]
      .map(cell)
      .join(","),
  );
  return new NextResponse([header.map(cell).join(","), ...rows].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${order.order_number}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
