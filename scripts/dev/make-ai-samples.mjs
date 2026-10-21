// Generates fictional purchase orders for trying real AI extraction locally
// (tests/fixtures/ai-samples). They are deliberately NOT in the simulated
// provider's registry, and their layouts differ from the fixtures, so a
// result can only come from the AI. All companies, people, addresses and
// numbers are invented; nothing here is real customer data.
//   node scripts/dev/make-ai-samples.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { pdf } from "./pdf.mjs";

const OUT = new URL("../../tests/fixtures/ai-samples/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const SAMPLES = {
  // A known customer (Harbor & Pine, C-1042) using its own part numbers.
  "ai-01-harbor-pine-reorder.pdf": [
    [
      "Harbor & Pine Supply (fictional)",
      "418 Wharf Street, Portsmouth, NH 03801",
      "",
      "                                   PURCHASE ORDER",
      "Order No.: HP-55120            Order date: October 14, 2026",
      "Vendor: Northstar Distribution LLC (fictional)",
      "Customer account: C-1042",
      "Deliver by: October 28, 2026",
      "Ship to: Harbor & Pine Supply, Dock 2, 420 Wharf Street, Portsmouth, NH 03801",
      "Terms: Net 30          Currency: USD",
      "",
      "Item     Our part   Description                     Qty    Unit   Price     Amount",
      "1        HP-221     Nitrile gloves medium 100ct     40     BX     8.95      358.00",
      "2        HP-510     Multifold towel 16pk            12     CS     44.20     530.40",
      "",
      "                                               Order total:  USD 888.40",
      "Buyer: Dana Whitfield (fictional)",
    ],
  ],
  // Two pages; one unknown product; the printed total does not add up.
  "ai-02-two-pages-unknown-item.pdf": [
    [
      "NORTHGATE FACILITIES (fictional) - Purchasing Department",
      "PO # NG-2026-0931",
      "Date: 10/15/2026",
      "Supplier: Northstar Distribution (fictional)",
      "Bill to: Northgate Facilities, 77 Commerce Park, Dayton, OH 45402",
      "",
      "Line | Supplier SKU | Item                                  | Quantity | Unit price",
      "  1  | JAN-4402     | Trash liners 40-45 gal, case of 250   | 6 CS     | $38.50",
      "  2  | JAN-1001     | Nitrile exam gloves M, box 100        | 25 BX    | $8.95",
      "",
      "(continued on page 2)",
    ],
    [
      "PO # NG-2026-0931 - page 2",
      "",
      "  3  | XR-9000      | Floor scrubber replacement pads       | 4 EA     | $19.00",
      "",
      "Total due: $600.00",
      "Please confirm by email. Requested delivery: 10/30/2026",
    ],
  ],
  // Missing order date and currency; hand-written style quantities.
  "ai-03-missing-fields.pdf": [
    [
      "Kestrel Medical Centers (fictional) - supply request",
      "Reference: KMC-7781",
      "",
      "Please send:",
      "  - Poly aprons, pack of 100 ......... qty: about 10 (confirm)",
      "  - Deli paper interfolded ........... 12.5 kg",
      "",
      "No prices on this request; use our contract prices.",
      "Contact: R. Osei (fictional), supplychain@kestrel.example",
    ],
  ],
  // Not a purchase order: the AI should say so, and the order is entered manually.
  "ai-04-not-a-purchase-order.pdf": [
    [
      "Quarterly newsletter (fictional)",
      "",
      "Our warehouse team moved to a new building this month.",
      "Thank you to everyone who helped with the move.",
      "Upcoming: inventory count on November 3.",
    ],
  ],
};

for (const [name, pages] of Object.entries(SAMPLES)) writeFileSync(new URL(name, OUT), pdf(pages));

// An image version of the first sample, reduced in size like a poor phone
// scan (macOS only: sips renders the PDF's first page).
if (process.platform === "darwin") {
  const out = fileURLToPath(OUT);
  const full = `${out}ai-05-scan-full.png`;
  execFileSync(
    "sips",
    ["-s", "format", "png", `${out}ai-01-harbor-pine-reorder.pdf`, "--out", full],
    {
      stdio: "ignore",
    },
  );
  execFileSync("sips", ["-Z", "700", full, "--out", `${out}ai-05-phone-scan.png`], {
    stdio: "ignore",
  });
  rmSync(full);
}
console.log("Wrote fictional AI samples to tests/fixtures/ai-samples.");
