import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pageFrom, Pagination } from "@/components/app/pagination";
import { FilterSelect, SearchForm } from "@/components/app/search-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ProductStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 25;

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireWorkspace(orgSlug, `/o/${orgSlug}/products`);
  const fmt = workspaceFormat(workspace);
  const page = pageFrom(sp.page);
  const status = sp.status === "active" || sp.status === "discontinued" ? sp.status : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const safe = q.replace(/[^\p{L}\p{N} .-]/gu, " ").trim();

  // FR-PROD-01: search also matches customers' part numbers for our products.
  let aliasProductIds: string[] = [];
  if (safe) {
    const { data } = await supabase
      .from("customer_item_aliases")
      .select("product_id")
      .eq("organization_id", workspace.id)
      .eq("status", "active")
      .ilike("customer_part_number", `%${safe}%`)
      .limit(50);
    aliasProductIds = [...new Set((data ?? []).map((a) => a.product_id))];
  }

  let query = supabase
    .from("products")
    .select("id, sku, name, selling_uom, list_price, status, track_inventory, gtin", {
      count: "exact",
    })
    .eq("organization_id", workspace.id)
    .order("sku")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (safe) {
    const terms = [`sku.ilike.*${safe}*`, `name.ilike.*${safe}*`, `gtin.ilike.*${safe}*`];
    if (aliasProductIds.length) terms.push(`id.in.(${aliasProductIds.join(",")})`);
    query = query.or(terms.join(","));
  }
  const { data: products, count, error } = await query;
  if (error) throw new Error("Products could not be loaded.");

  const base = `/o/${orgSlug}/products`;
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Products"
        description="Your catalog: units, decimals, list prices and whether stock is tracked."
        actions={
          can(workspace.role, "product.edit") ? (
            <Link
              href={`${base}/new`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Plus aria-hidden className="size-4" />
              New product
            </Link>
          ) : null
        }
      />
      <div>
        <SearchForm
          action={base}
          query={q}
          label="Search products"
          placeholder="SKU, name, GTIN or customer part number"
          filters={
            <FilterSelect
              name="status"
              label="Status"
              value={status}
              options={[
                { value: "", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "discontinued", label: "Discontinued" },
              ]}
            />
          }
        />
        <Card>
          {products && products.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">List price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`${base}/${p.id}`}
                        className="font-mono font-medium text-navy-900 hover:text-primary hover:underline"
                      >
                        {p.sku}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {p.name}
                      {p.track_inventory ? null : (
                        <Badge className="ml-2" tone="neutral">
                          Not stocked
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.selling_uom}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.unitPrice(p.list_price)}
                    </TableCell>
                    <TableCell>
                      <ProductStatusBadge status={p.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={q || status ? "No products match" : "No products yet"}
              description={
                q || status
                  ? "Try another SKU, name, GTIN or part number."
                  : "Add the items your customers order."
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
