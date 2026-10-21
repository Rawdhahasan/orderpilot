import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { CustomerStatusBadge } from "@/components/status/status-badge";
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
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/domain/orders/statuses";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/customers`);
  const page = pageFrom(sp.page);
  const status = CUSTOMER_STATUSES.includes(sp.status as CustomerStatus)
    ? (sp.status as CustomerStatus)
    : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);

  let query = supabase
    .from("customers")
    .select("id, name, account_number, status, hold_reason, payment_terms", { count: "exact" })
    .eq("organization_id", workspace.id)
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  const safe = q.replace(/[^\p{L}\p{N} &.'-]/gu, " ").trim();
  if (safe) query = query.or(`name.ilike.*${safe}*,account_number.ilike.*${safe}*`);
  const { data: customers, count, error } = await query;
  if (error) throw new Error("Customers could not be loaded.");

  const base = `/o/${orgSlug}/customers`;
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Customers"
        description="The businesses that send you purchase orders, with their addresses and part numbers."
        actions={
          can(workspace.role, "customer.edit") ? (
            <Link
              href={`${base}/new`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Plus aria-hidden className="size-4" />
              New customer
            </Link>
          ) : null
        }
      />
      <div>
        <SearchForm
          action={base}
          query={q}
          label="Search customers"
          placeholder="Name or account number"
          filters={
            <FilterSelect
              name="status"
              label="Status"
              value={status}
              options={[
                { value: "", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "on_hold", label: "On hold" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          }
        />
        <Card>
          {customers && customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Terms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`${base}/${c.id}`}
                        className="font-medium text-navy-900 hover:text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-small">
                      {c.account_number ?? "–"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex flex-col gap-0.5">
                        <CustomerStatusBadge status={c.status} />
                        {c.hold_reason ? (
                          <span className="text-caption text-muted-foreground">
                            {c.hold_reason}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{c.payment_terms ?? "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={q || status ? "No customers match" : "No customers yet"}
              description={
                q || status
                  ? "Try another name, account number or status."
                  : "Add the businesses that send you purchase orders."
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
