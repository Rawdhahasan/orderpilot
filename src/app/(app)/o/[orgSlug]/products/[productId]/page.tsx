import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ProductStatusBadge, StockStatusBadge } from "@/components/status/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import type { StockStatus } from "@/domain/orders/statuses";
import { deleteCustomerPrice, setProductStatus, setTracking } from "@/features/products/actions";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";

import { CustomerPriceForm } from "../customer-price-form";
import { PriceForm, ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({
  params,
}: {
  params: Promise<{ orgSlug: string; productId: string }>;
}) {
  const { orgSlug, productId } = await params;
  const { supabase, workspace } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/products/${productId}`,
  );
  if (!/^[0-9a-f-]{36}$/.test(productId)) notFound();
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, sku, name, description, selling_uom, quantity_decimals, list_price, gtin, status, track_inventory, reorder_point",
    )
    .eq("organization_id", workspace.id)
    .eq("id", productId)
    .maybeSingle();
  if (!product) notFound();

  const canPrice = can(workspace.role, "price.change");
  const [{ data: uoms }, { data: stock }, { data: prices }, { data: customers }] =
    await Promise.all([
      supabase.from("uom_codes").select("code, name").order("code"),
      supabase
        .from("stock_levels")
        .select("on_hand, reserved, available, stock_status")
        .eq("product_id", productId)
        .maybeSingle(),
      supabase
        .from("customer_prices")
        .select("id, unit_price, valid_from, valid_to, customer:customers(name)")
        .eq("product_id", productId)
        .order("valid_from", { ascending: false }),
      canPrice
        ? supabase
            .from("customers")
            .select("id, name")
            .eq("organization_id", workspace.id)
            .neq("status", "inactive")
            .order("name")
            .limit(500)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

  const fmt = workspaceFormat(workspace);
  const canEdit = can(workspace.role, "product.edit");
  const scope = { organizationId: workspace.id, slug: orgSlug, productId };
  const qty = (v: number | null) => fmt.qty(v, product.selling_uom, product.quantity_decimals);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader
        title={product.name}
        description={`${product.sku} · list price ${fmt.unitPrice(product.list_price)} per ${product.selling_uom}`}
        meta={<ProductStatusBadge status={product.status} />}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <InlineAction
                action={setProductStatus}
                fields={{
                  ...scope,
                  status: product.status === "active" ? "discontinued" : "active",
                }}
                label={product.status === "active" ? "Discontinue" : "Reactivate"}
              />
              <InlineAction
                action={setTracking}
                fields={{ ...scope, track: product.track_inventory ? "off" : "on" }}
                label={product.track_inventory ? "Stop tracking inventory" : "Track inventory"}
                variant="ghost"
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm
              organizationId={workspace.id}
              slug={orgSlug}
              uoms={uoms ?? []}
              values={product}
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Stock</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-small">
              {product.track_inventory && stock ? (
                <>
                  <StockStatusBadge status={stock.stock_status as StockStatus} />
                  <dl className="grid grid-cols-2 gap-y-1">
                    <dt className="text-subtle-foreground">On hand</dt>
                    <dd className="text-right tabular-nums">{qty(stock.on_hand)}</dd>
                    <dt className="text-subtle-foreground">Reserved</dt>
                    <dd className="text-right tabular-nums">{qty(stock.reserved)}</dd>
                    <dt className="text-subtle-foreground">Available</dt>
                    <dd className="text-right font-medium tabular-nums">{qty(stock.available)}</dd>
                  </dl>
                  <Link
                    href={`/o/${orgSlug}/inventory/${productId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Stock and movement history
                  </Link>
                </>
              ) : (
                <p className="text-subtle-foreground">
                  Inventory is not tracked. Orders for this product are never reserved or
                  backordered.
                </p>
              )}
            </CardContent>
          </Card>
          {canPrice ? (
            <Card>
              <CardHeader>
                <CardTitle>Change list price</CardTitle>
              </CardHeader>
              <CardContent>
                <PriceForm organizationId={workspace.id} slug={orgSlug} productId={productId} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer prices</CardTitle>
        </CardHeader>
        {prices?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.customer?.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt.unitPrice(p.unit_price)}
                  </TableCell>
                  <TableCell>
                    {fmt.date(p.valid_from)} – {p.valid_to ? fmt.date(p.valid_to) : "open-ended"}
                  </TableCell>
                  <TableCell className="text-right">
                    {canPrice ? (
                      <InlineAction
                        action={deleteCustomerPrice}
                        fields={{ ...scope, priceId: p.id }}
                        label="Remove"
                        variant="ghost"
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No customer prices"
            description="Without one, the list price is the expected price."
          />
        )}
        {canPrice ? (
          <CardContent className="border-t border-border pt-4">
            <CustomerPriceForm
              organizationId={workspace.id}
              slug={orgSlug}
              productId={productId}
              customers={customers ?? []}
            />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
