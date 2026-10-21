import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { IntakeStatusBadge } from "@/components/status/status-badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import { INTAKE_STATUSES, type IntakeStatus } from "@/domain/orders/statuses";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Customer POs" };

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "extracting", label: "Extracting" },
  { value: "extraction_failed", label: "Extraction failed" },
  { value: "in_review", label: "In review" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function CustomerPosPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/customer-pos`);
  const fmt = workspaceFormat(workspace);
  const page = pageFrom(sp.page);
  const status = INTAKE_STATUSES.includes(sp.status as IntakeStatus)
    ? (sp.status as IntakeStatus)
    : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const safe = q.replace(/[^\p{L}\p{N} .-]/gu, " ").trim();

  let query = supabase
    .from("inbound_orders")
    .select(
      "id, reference, customer_po_number, status, created_at, manual_entry, customer:customers!inbound_orders_organization_id_customer_id_fkey(name), document:source_documents(original_filename)",
      { count: "exact" },
    )
    .eq("organization_id", workspace.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (safe) query = query.or(`reference.ilike.*${safe}*,customer_po_number.ilike.*${safe}*`);
  const { data: rows, count, error } = await query;
  if (error) throw new Error("Customer POs could not be loaded.");

  const base = `/o/${orgSlug}/customer-pos`;
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Customer POs"
        description="Every purchase order received from customers, from upload to decision."
        actions={
          can(workspace.role, "intake.upload") ? (
            <Link
              href={`${base}/upload`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Upload aria-hidden className="size-4" />
              Upload PO
            </Link>
          ) : null
        }
      />
      <div>
        <SearchForm
          action={base}
          query={q}
          label="Search customer POs"
          placeholder="Reference or PO number"
          filters={
            <FilterSelect name="status" label="Status" value={status} options={STATUS_OPTIONS} />
          }
        />
        <Card>
          {rows && rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>PO number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Received</TableHead>
                  <TableHead className="hidden lg:table-cell">File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`${base}/${r.id}`}
                        className="font-mono font-medium text-navy-900 hover:text-primary hover:underline"
                      >
                        {r.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {r.customer?.name ?? (
                        <span className="text-subtle-foreground">Not matched</span>
                      )}
                    </TableCell>
                    <TableCell>{r.customer_po_number ?? "–"}</TableCell>
                    <TableCell>
                      <IntakeStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {fmt.dateTime(r.created_at)}
                    </TableCell>
                    <TableCell className="hidden max-w-[220px] truncate lg:table-cell">
                      {r.document?.original_filename}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={q || status ? "No customer POs match" : "No customer POs yet"}
              description={
                q || status
                  ? "Try another reference, PO number or status."
                  : "Upload a purchase order to start."
              }
              action={
                !q && !status && can(workspace.role, "intake.upload") ? (
                  <Link
                    href={`${base}/upload`}
                    className="text-small font-medium text-primary hover:underline"
                  >
                    Upload PO
                  </Link>
                ) : undefined
              }
            />
          )}
        </Card>
        <Pagination
          basePath={base}
          params={{ q: q || undefined, status }}
          page={page}
          pageSize={PAGE_SIZE}
          total={count ?? 0}
        />
      </div>
    </div>
  );
}
