/** CSV import kinds, their columns and an example row (fictional). */
export const IMPORTS = {
  customers: {
    label: "Customers and addresses",
    rpc: "import_customers",
    required: ["name"],
    columns: [
      "account_number",
      "name",
      "email",
      "phone",
      "payment_terms",
      "date_order_hint",
      "ship_line1",
      "ship_city",
      "ship_region",
      "ship_postal_code",
      "ship_country",
      "bill_line1",
      "bill_city",
      "bill_region",
      "bill_postal_code",
      "bill_country",
    ],
    example: [
      "C-3001",
      "Example Hardware (fictional)",
      "orders@example.test",
      "",
      "Net 30",
      "mdy",
      "1 Example Way",
      "Columbus",
      "OH",
      "43215",
      "US",
      "",
      "",
      "",
      "",
      "",
    ],
  },
  products: {
    label: "Products",
    rpc: "import_products",
    required: ["sku", "name", "selling_uom", "list_price"],
    columns: [
      "sku",
      "name",
      "description",
      "selling_uom",
      "quantity_decimals",
      "list_price",
      "gtin",
      "track_inventory",
      "reorder_point",
    ],
    example: ["EX-100", "Example product (fictional)", "", "EA", "0", "9.95", "", "true", "10"],
  },
  stock: {
    label: "Opening stock",
    rpc: "import_opening_stock",
    required: ["sku", "quantity"],
    columns: ["sku", "quantity", "note"],
    example: ["EX-100", "120", "Count on go-live day"],
  },
} as const;

export type ImportKind = keyof typeof IMPORTS;

export function templateCsv(kind: ImportKind): string {
  const t = IMPORTS[kind];
  return `${t.columns.join(",")}\r\n${t.example.map((v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(",")}\r\n`;
}
