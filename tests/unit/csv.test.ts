import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads headers and rows, normalising header names", () => {
    expect(parseCsv("Account Number,Name\nC-1,Acme\n")).toEqual({
      headers: ["account_number", "name"],
      rows: [{ account_number: "C-1", name: "Acme" }],
    });
  });
  it("handles quotes, commas, escaped quotes, CRLF, a BOM and blank lines", () => {
    const { rows } = parseCsv(
      '﻿name,notes\r\n"Smith, Jones & Co","He said ""hi"""\r\n\r\nPlain,\r\n',
    );
    expect(rows).toEqual([
      { name: "Smith, Jones & Co", notes: 'He said "hi"' },
      { name: "Plain", notes: "" },
    ]);
  });
  it("keeps line breaks inside quoted fields", () => {
    expect(parseCsv('name,address\nA,"1 Way\nSuite 2"').rows[0]!.address).toBe("1 Way\nSuite 2");
  });
  it("fills missing trailing fields with empty strings", () => {
    expect(parseCsv("a,b,c\n1").rows).toEqual([{ a: "1", b: "", c: "" }]);
  });
  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});
