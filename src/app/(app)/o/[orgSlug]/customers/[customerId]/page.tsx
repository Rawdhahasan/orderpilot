import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InlineAction } from "@/components/forms/inline-action";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import {
  CustomerStatusBadge,
  IntakeStatusBadge,
  SalesOrderStatusBadge,
} from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { archiveAddress, archiveAlias } from "@/features/customers/actions";
import { workspaceFormat } from "@/features/workspace/format";
import { cn } from "@/lib/cn";
import { requireWorkspace } from "@/server/auth/context";

import { CustomerForm } from "../customer-form";
import {
  AddressForm,
  AliasForm,
  EditAddress,
  StatusActions,
  type AddressValues,
} from "./customer-panels";

export const metadata: Metadata = { title: "Customer" };

const TABS = [
  { key: "details", label: "Details" },
  { key: "addresses", label: "Addresses" },
  { key: "aliases", label: "Part numbers" },
  { key: "orders", label: "Orders" },
] as const;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; customerId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug, customerId } = await params;
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t.key === requested)?.key ?? "details";
  const base = `/o/${orgSlug}/customers/${customerId}`;
  const { supabase, workspace } = await requireWorkspace(orgSlug, base);
  if (!/^[0-9a-f-]{36}$/.test(customerId)) notFound();
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, name, account_number, email, phone, payment_terms, date_order_hint, notes, status, hold_reason, hold_set_at",
    )
    .eq("organization_id", workspace.id)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) notFound();

  const fmt = workspaceFormat(workspace);
  const canEdit = can(workspace.role, "customer.edit");
  const scope = { organizationId: workspace.id, slug: orgSlug, customerId };

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader
        title={customer.name}
        description={
          customer.account_number ? `Account ${customer.account_number}` : "No account number"
        }
        meta={
          <>
            <CustomerStatusBadge status={customer.status} />
            {customer.hold_reason ? (
              <span className="text-small text-subtle-foreground">
                {customer.hold_reason} · since {fmt.date(customer.hold_set_at)}
              </span>
            ) : null}
          </>
        }
        actions={
          <StatusActions
            scope={scope}
            status={customer.status}
            canHold={can(workspace.role, "customer.hold")}
            canDeactivate={can(workspace.role, "customer.deactivate")}
          />
        }
      />

      <nav aria-label="Customer sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "details" ? base : `${base}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-small font-medium",
              tab === t.key
                ? "border-primary text-navy-900"
                : "border-transparent text-subtle-foreground hover:text-navy-900",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "details" ? (
        <Card>
          <CardContent className="pt-5">
            <CustomerForm
              organizationId={workspace.id}
              slug={orgSlug}
              values={customer}
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>
      ) : null}

      {tab === "addresses" ? <Addresses scope={scope} canEdit={canEdit} /> : null}
      {tab === "aliases" ? (
        <Aliases scope={scope} canEdit={can(workspace.role, "customer_alias.manage")} />
      ) : null}
      {tab === "orders" ? <Orders slug={orgSlug} customerId={customerId} /> : null}
    </div>
  );

  async function Addresses({
    scope: s,
    canEdit: editable,
  }: {
    scope: typeof scope;
    canEdit: boolean;
  }) {
    const { data: addresses } = await supabase
      .from("customer_addresses")
      .select(
        "id, type, label, line1, line2, line3, city, region, postal_code, country_code, is_default, status",
      )
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("type")
      .order("is_default", { ascending: false });
    return (
      <div className="space-y-5">
        {addresses && addresses.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((a) => (
              <Card key={a.id} data-testid="address-card">
                <CardContent className="pt-4 text-small">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>{a.type === "billing" ? "Billing" : "Shipping"}</Badge>
                    {a.is_default ? <Badge tone="info">Default</Badge> : null}
                    <span className="font-medium text-navy-900">{a.label}</span>
                  </div>
                  <address className="not-italic text-body-foreground">
                    {[
                      a.line1,
                      a.line2,
                      a.line3,
                      [a.city, a.region, a.postal_code].filter(Boolean).join(", "),
                      a.country_code,
                    ]
                      .filter(Boolean)
                      .map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                  </address>
                  {editable ? (
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      <EditAddress scope={s} address={a as AddressValues} />
                      <InlineAction
                        action={archiveAddress}
                        fields={{ ...s, addressId: a.id }}
                        label="Archive"
                        variant="ghost"
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No addresses yet"
              description="Add the billing and shipping addresses used on this customer's orders."
            />
          </Card>
        )}
        {editable ? (
          <Card>
            <CardHeader>
              <CardTitle>Add an address</CardTitle>
            </CardHeader>
            <CardContent>
              <AddressForm scope={s} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Aliases({
    scope: s,
    canEdit: editable,
  }: {
    scope: typeof scope;
    canEdit: boolean;
  }) {
    const [{ data: aliases }, { data: products }] = await Promise.all([
      supabase
        .from("customer_item_aliases")
        .select(
          "id, customer_part_number, customer_description, created_at, source_inbound_order_id, product:products(sku, name), creator:profiles!customer_item_aliases_created_by_fkey(full_name)",
        )
        .eq("customer_id", customerId)
        .eq("status", "active")
        .order("customer_part_number"),
      editable
        ? supabase
            .from("products")
            .select("id, sku, name")
            .eq("organization_id", workspace.id)
            .eq("status", "active")
            .order("sku")
            .limit(500)
        : Promise.resolve({ data: [] as { id: string; sku: string; name: string }[] }),
    ]);
    return (
      <div className="space-y-5">
        <Card>
          {aliases && aliases.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Their part number</TableHead>
                  <TableHead>Our product</TableHead>
                  <TableHead className="hidden md:table-cell">Mapped by</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliases.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="block font-mono">{a.customer_part_number}</span>
                      {a.customer_description ? (
                        <span className="text-caption text-subtle-foreground">
                          {a.customer_description}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{a.product?.sku}</span> · {a.product?.name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {a.creator?.full_name ?? "System"} · {fmt.date(a.created_at)}
                      {a.source_inbound_order_id ? (
                        <Link
                          href={`/o/${orgSlug}/customer-pos/${a.source_inbound_order_id}`}
                          className="ml-1 text-primary hover:underline"
                        >
                          from an order
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <InlineAction
                          action={archiveAlias}
                          fields={{ ...s, aliasId: a.id }}
                          label="Archive"
                          variant="ghost"
                          ariaLabel={`Archive ${a.customer_part_number}`}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No part numbers mapped"
              description="Mappings are learned at approval, or you can add them here."
            />
          )}
        </Card>
        {editable ? (
          <Card>
            <CardHeader>
              <CardTitle>Map a part number</CardTitle>
            </CardHeader>
            <CardContent>
              <AliasForm
                scope={s}
                products={(products ?? []).map((p) => ({
                  id: p.id,
                  label: `${p.sku} · ${p.name}`,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Orders({ slug, customerId: id }: { slug: string; customerId: string }) {
    const [{ data: intakes }, { data: orders }] = await Promise.all([
      supabase
        .from("inbound_orders")
        .select("id, reference, customer_po_number, status, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("sales_orders")
        .select("id, order_number, customer_po_number, status, subtotal, currency, approved_at")
        .eq("customer_id", id)
        .order("approved_at", { ascending: false })
        .limit(50),
    ]);
    return (
      <div className="space-y-5">
        <section aria-labelledby="intakes-heading">
          <SectionHeading id="intakes-heading">Customer POs</SectionHeading>
          <Card>
            {intakes?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>PO number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intakes.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link
                          href={`/o/${slug}/customer-pos/${i.id}`}
                          className="font-mono font-medium text-navy-900 hover:text-primary hover:underline"
                        >
                          {i.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{i.customer_po_number ?? "–"}</TableCell>
                      <TableCell>
                        <IntakeStatusBadge status={i.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {fmt.dateTime(i.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState title="No customer POs yet" />
            )}
          </Card>
        </section>
        <section aria-labelledby="orders-heading">
          <SectionHeading id="orders-heading">Sales orders</SectionHeading>
          <Card>
            {orders?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>PO number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link
                          href={`/o/${slug}/sales-orders/${o.id}`}
                          className="font-mono font-medium text-navy-900 hover:text-primary hover:underline"
                        >
                          {o.order_number}
                        </Link>
                      </TableCell>
                      <TableCell>{o.customer_po_number ?? "–"}</TableCell>
                      <TableCell>
                        <SalesOrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt.money(o.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState title="No sales orders yet" />
            )}
          </Card>
        </section>
      </div>
    );
  }
}
