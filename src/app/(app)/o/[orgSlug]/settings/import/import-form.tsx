"use client";

import { CheckCircle2, FileUp, OctagonAlert } from "lucide-react";
import { useState, useTransition } from "react";

import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runImport, type ImportReport } from "@/features/imports/actions";
import { IMPORTS, type ImportKind } from "@/features/imports/templates";

export function ImportForm({ organizationId, slug }: { organizationId: string; slug: string }) {
  const [kind, setKind] = useState<ImportKind>("customers");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();

  const run = (dryRun: boolean) =>
    start(async () => {
      if (!file) return;
      setReport(await runImport({ organizationId, slug, kind, csv: file.text, dryRun }));
    });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          label="What are you importing?"
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ImportKind);
            setReport(null);
          }}
          options={Object.entries(IMPORTS).map(([value, t]) => ({ value, label: t.label }))}
        />
        <div className="space-y-1.5">
          <label htmlFor="import-file" className="text-small font-medium text-navy-900">
            CSV file
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-small file:mr-3 file:rounded-md file:border file:border-input file:bg-white file:px-3 file:py-1.5 file:text-small file:font-medium"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setReport(null);
              setFile(f ? { name: f.name, text: await f.text() } : null);
            }}
          />
          <p className="text-caption text-subtle-foreground">
            Columns: {IMPORTS[kind].columns.join(", ")}.{" "}
            <a
              href={`/o/${slug}/settings/import/template?kind=${kind}`}
              className="font-medium text-primary hover:underline"
            >
              Download the template
            </a>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(true)} disabled={!file} pending={pending && !report}>
          <FileUp aria-hidden />
          Check the file
        </Button>
        {report?.dryRun && report.ok ? (
          <Button variant="primary" onClick={() => run(false)} pending={pending}>
            Import {report.rows} row{report.rows === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>

      {report ? (
        <section aria-live="polite" className="space-y-3" data-testid="import-report">
          {report.message ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-md bg-danger-50 px-3 py-2 text-small text-danger-800"
            >
              <OctagonAlert aria-hidden className="size-4" />
              {report.message}
            </p>
          ) : report.ok && !report.dryRun ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-md bg-success-50 px-3 py-2 text-small text-success-800"
            >
              <CheckCircle2 aria-hidden className="size-4" />
              Imported. {report.created} record{report.created === 1 ? "" : "s"} written.
            </p>
          ) : report.ok ? (
            <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-small text-blue-700">
              All {report.rows} rows are valid. Nothing has been written yet.
            </p>
          ) : (
            <div
              role="alert"
              className="space-y-1 rounded-md bg-danger-50 px-3 py-2 text-small text-danger-800"
            >
              <p className="font-medium">
                {report.errors.length} row{report.errors.length === 1 ? "" : "s"} need fixing.
                Nothing was written.
              </p>
              <ul className="list-disc pl-5">
                {report.errors.slice(0, 50).map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.preview?.length && report.columns?.length ? (
            <div>
              <p className="mb-1 text-small text-subtle-foreground">
                First {report.preview.length} rows
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    {report.columns.map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.preview.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      {report.columns!.map((c) => (
                        <TableCell key={c}>{r[c]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
