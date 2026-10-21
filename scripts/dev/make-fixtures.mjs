// Generates the fictional fixture POs (TECHNICAL_ARCHITECTURE.md §9.3) and the
// simulated provider's registry (SHA-256 → prepared extraction result).
// Deterministic: same input, same bytes, same hashes. All companies, people
// and addresses are invented.
//   node scripts/dev/make-fixtures.mjs
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { pdf } from "./pdf.mjs";

const OUT = new URL("../../tests/fixtures/documents/", import.meta.url);
const REGISTRY = new URL("../../src/server/extraction/fixture-registry.json", import.meta.url);

const f = (raw, confidence = 0.97, extra = {}) => ({
  raw,
  value: raw,
  confidence,
  page: 1,
  ...extra,
});
const line = (no, part, desc, qty, uom, price, confidence = 0.95, page = 1) => ({
  line_no: no,
  page,
  customer_part_number: f(part, confidence, { page }),
  description: f(desc, confidence, { page }),
  quantity: f(qty, confidence, { page }),
  uom: f(uom, confidence, { page }),
  unit_price: f(price, confidence, { page }),
  line_total: f((Number(qty.replace(/,/g, "")) * Number(price)).toFixed(2), confidence, { page }),
});
const address = (name, line1, city, region, postal, country = "US") => ({
  raw: `${name}, ${line1}, ${city}, ${region} ${postal}`,
  value: { name, line1, city, region, postal_code: postal, country_code: country },
  confidence: 0.93,
  page: 1,
});

const FIXTURES = [
  {
    file: "01-harbor-pine-clean.pdf",
    description: "Clean PO: known customer, aliases and SKUs, matching prices",
    pages: [
      [
        "HARBOR & PINE SUPPLY - PURCHASE ORDER (fictional)",
        "Account: C-1042",
        "PO Number: HP-55120",
        "PO Date: 2026-10-12",
        "Ship to: Harbor & Pine Supply, 77 Industrial Ct, Columbus, OH 43215",
        "Terms: Net 30",
        "1  HP-221  Nitrile gloves medium 100ct  20 BX  8.95",
        "2  HP-510  Multifold towel 16pk  4 CS  43.10",
        "3  JAN-4402  Trash liners 40-45 gal  2 CS  38.50",
        "Total: 438.90",
      ],
    ],
    result: {
      header: {
        customer_name: f("Harbor & Pine Supply"),
        account_number: f("C-1042"),
        customer_po_number: f("HP-55120"),
        po_date: f("2026-10-12"),
        currency: f("USD"),
        payment_terms: f("Net 30"),
        ship_to: address("Harbor & Pine Supply", "77 Industrial Ct", "Columbus", "OH", "43215"),
        document_total: f("438.90"),
      },
      lines: [
        line(1, "HP-221", "Nitrile gloves medium 100ct", "20", "BX", "8.95"),
        line(2, "HP-510", "Multifold towel 16pk", "4", "CS", "43.10"),
        line(3, "JAN-4402", "Trash liners 40-45 gal", "2", "CS", "38.50"),
      ],
    },
  },
  {
    file: "02-northgate-messy.pdf",
    description:
      "Messy PO: unknown part, unit mismatch, price mismatch, missing ship-to, ambiguous date, low confidence",
    pages: [
      [
        "NORTHGATE FACILITIES - PURCHASE ORDER (fictional)",
        "PO#: NG-7781",
        "Date: 04/05/2026",
        "1  NG-0099  Floor sealant 5 gal  3 EA  61.00",
        "2  JAN-1001  Exam gloves M  2 CS  8.95",
        "3  JAN-2207  Towels multifold  10 CS  39.00",
      ],
    ],
    result: {
      header: {
        customer_name: f("Northgate Facilities", 0.88),
        customer_po_number: f("NG-7781", 0.9),
        po_date: f("04/05/2026", 0.62, { ambiguous: true }),
        currency: f("USD", 0.8),
      },
      lines: [
        line(1, "NG-0099", "Floor sealant 5 gal", "3", "EA", "61.00", 0.71),
        line(2, "JAN-1001", "Exam gloves M", "2", "CS", "8.95", 0.83),
        line(3, "JAN-2207", "Towels multifold", "10", "CS", "39.00", 0.9),
      ],
    },
  },
  {
    file: "03-harbor-pine-two-pages.pdf",
    description: "Two-page PO with lines on both pages",
    pages: [
      [
        "HARBOR & PINE SUPPLY - PURCHASE ORDER (fictional)",
        "PO Number: HP-55188",
        "PO Date: 2026-10-15",
        "Ship to: 77 Industrial Ct, Columbus, OH 43215",
        "1  HP-221  Nitrile gloves medium 100ct  10 BX  8.95",
        "2  JAN-2207  Multifold towel 16pk  2 CS  43.10",
      ],
      [
        "Page 2",
        "3  JAN-4402  Trash liners 40-45 gal  1 CS  38.50",
        "4  FS-6300  Degreaser concentrate  2.5 KG  6.20",
      ],
    ],
    result: {
      header: {
        customer_name: f("Harbor & Pine Supply"),
        customer_po_number: f("HP-55188"),
        po_date: f("2026-10-15"),
        currency: f("USD"),
        ship_to: address("Harbor & Pine Supply", "77 Industrial Ct", "Columbus", "OH", "43215"),
      },
      lines: [
        line(1, "HP-221", "Nitrile gloves medium 100ct", "10", "BX", "8.95"),
        line(2, "JAN-2207", "Multifold towel 16pk", "2", "CS", "43.10"),
        line(3, "JAN-4402", "Trash liners 40-45 gal", "1", "CS", "38.50", 0.95, 2),
        line(4, "FS-6300", "Degreaser concentrate", "2.5", "KG", "6.20", 0.95, 2),
      ],
    },
  },
  {
    file: "04-retry-once.pdf",
    description: "Fails on its first attempt (transient) and succeeds on retry (C-10)",
    failFirstAttempt: true,
    pages: [
      [
        "NORTHGATE FACILITIES - PURCHASE ORDER (fictional)",
        "PO#: NG-7790",
        "Date: 2026-10-14",
        "1  JAN-1001  Exam gloves M  5 BX  8.95",
      ],
    ],
    result: {
      header: {
        customer_name: f("Northgate Facilities"),
        customer_po_number: f("NG-7790"),
        po_date: f("2026-10-14"),
        currency: f("USD"),
        ship_to: address("Northgate Facilities", "400 Gateway Blvd", "Dublin", "OH", "43017"),
      },
      lines: [line(1, "JAN-1001", "Exam gloves M", "5", "BX", "8.95")],
    },
  },
];

mkdirSync(OUT, { recursive: true });
const registry = {};
for (const fx of FIXTURES) {
  const bytes = pdf(fx.pages);
  writeFileSync(new URL(fx.file, OUT), bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  registry[sha] = {
    file: fx.file,
    description: fx.description,
    failFirstAttempt: Boolean(fx.failFirstAttempt),
    result: {
      schema: "extraction.v1",
      status: "complete",
      document: { pages: fx.pages.length, warnings: [] },
      ...fx.result,
    },
  };
}
// An unknown document (not in the registry): the simulator returns no values.
writeFileSync(
  new URL("90-unknown-document.pdf", OUT),
  pdf([["A LETTER THAT IS NOT A PURCHASE ORDER (fictional)", "Hello."]]),
);
writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Wrote ${FIXTURES.length + 1} fixture documents and the registry.`);
