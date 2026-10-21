"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseCsv } from "@/lib/csv";
import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { IMPORTS, type ImportKind } from "./templates";

export type ImportReport = {
  ok: boolean;
  dryRun: boolean;
  rows: number;
  created: number;
  errors: { row: number; message: string }[];
  message?: string;
  preview?: Record<string, string>[];
  columns?: string[];
};

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * FR-CUST-09, FR-PROD-06, FR-INV-08 (D-31): parse the CSV, then let the
 * database validate every row. With dryRun nothing is written (the preview);
 * otherwise all rows are written in one transaction, or none.
 */
export async function runImport(input: {
  organizationId: string;
  slug: string;
  kind: ImportKind;
  csv: string;
  dryRun: boolean;
}): Promise<ImportReport> {
  const parsed = z
    .object({
      organizationId: z.uuid(),
      slug: z.string().min(1).max(40),
      kind: z.enum(["customers", "products", "stock"]),
      csv: z.string().max(MAX_BYTES, "The file is larger than 2 MB."),
      dryRun: z.boolean(),
    })
    .safeParse(input);
  const empty = { ok: false, dryRun: input.dryRun, rows: 0, created: 0, errors: [] };
  if (!parsed.success)
    return { ...empty, message: parsed.error.issues[0]?.message ?? "The file could not be read." };
  const spec = IMPORTS[parsed.data.kind];
  const { headers, rows } = parseCsv(parsed.data.csv);
  const missing = spec.required.filter((c) => !headers.includes(c));
  if (missing.length)
    return {
      ...empty,
      message: `The file is missing these columns: ${missing.join(", ")}. Download the template for the expected columns.`,
    };
  if (rows.length === 0) return { ...empty, message: "The file has no rows." };
  const known = new Set<string>(spec.columns);
  const clean = rows.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => known.has(k))),
  );

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(spec.rpc, {
    p_organization_id: parsed.data.organizationId,
    p_rows: clean,
    p_dry_run: parsed.data.dryRun,
  });
  if (error) return { ...empty, message: messageForDbError(error) };
  const report = data as {
    ok: boolean;
    dry_run: boolean;
    rows: number;
    created: number;
    errors: { row: number; message: string }[];
  };
  if (!parsed.data.dryRun && report.ok) {
    for (const path of ["customers", "products", "inventory"])
      revalidatePath(`/o/${parsed.data.slug}/${path}`);
  }
  return {
    ok: report.ok,
    dryRun: report.dry_run,
    rows: report.rows,
    created: report.created,
    errors: report.errors,
    preview: clean.slice(0, 10),
    columns: spec.columns.filter((c) => headers.includes(c)),
  };
}
