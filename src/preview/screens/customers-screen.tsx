"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { FilterChips, ListToolbar, SearchField } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerStatusBadge, SalesOrderStatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can } from "@/domain/auth/permissions";
import type { CustomerStatus } from "@/domain/orders/statuses";

import {
  CUSTOMERS,
  customerOpenIntakes,
  customerOrders,
  productBySku,
  salesOrderSubtotal,
  type PreviewCustomer,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { PhaseDialog } from "../components/phase-dialog";
import { fmt } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";

type Filter = "all" | CustomerStatus;

export function CustomersScreen() {
  const { role } = usePersona();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PreviewCustomer | null>(null);

  const columns = useMemo<ColumnDef<PreviewCustomer, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Customer",
        accessorKey: "name",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelected(row.original)}
            className="text-left font-medium text-navy-900 hover:text-primary hover:underline"
          >
            {row.original.name}
          </button>
        ),
      },
      {
        id: "account",
        header: "Account",
        accessorKey: "accountNumber",
        cell: ({ row }) => (
          <span className="font-mono text-small">{row.original.accountNumber}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <span className="inline-flex flex-col gap-0.5">
            <CustomerStatusBadge status={row.original.status} />
            {row.original.holdReason ? (
              <span className="text-caption text-muted-foreground">{row.original.holdReason}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (c) => `${c.city}, ${c.region} · ${c.countryCode}`,
        meta: { hideBelow: "md" },
      },
      { id: "terms", header: "Terms", accessorKey: "paymentTerms", meta: { hideBelow: "lg" } },
      {
        id: "open",
        header: "Open POs",
        accessorFn: (c) => customerOpenIntakes(c.id),
        meta: { align: "right", hideBelow: "sm" },
      },
      {
        id: "orders",
        header: "Sales orders",
        accessorFn: (c) => customerOrders(c.id).length,
        meta: { align: "right", hideBelow: "lg" },
      },
    ],
    [],
  );

  const rows = CUSTOMERS.filter((c) => filter === "all" || c.status === filter).filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.accountNumber.toLowerCase().includes(q);
  });
  const count = (s: CustomerStatus) => CUSTOMERS.filter((c) => c.status === s).length;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Customers"
        description="The businesses that send you purchase orders, with their addresses and part numbers."
        meta={<FictionalBadge />}
        actions={
          can(role, "customer.edit") ? (
            <PhaseDialog
              trigger={
                <Button variant="primary">
                  <Plus aria-hidden />
                  New customer
                </Button>
              }
              title="New customer"
              description="Create customers with addresses, payment terms and a duplicate-name check."
              phase="3"
              feature="Creating and editing customers"
            />
          ) : null
        }
      />
      <div>
        <ListToolbar>
          <FilterChips
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: CUSTOMERS.length },
              { value: "active", label: "Active", count: count("active") },
              { value: "on_hold", label: "On hold", count: count("on_hold") },
              { value: "inactive", label: "Inactive", count: count("inactive") },
            ]}
          />
          <SearchField
            label="Search customers"
            placeholder="Name or account number"
            value={query}
            onChange={setQuery}
          />
        </ListToolbar>
        <DataTable
          caption="Customers"
          columns={columns}
          data={rows}
          getRowId={(c) => c.id}
          empty={{ title: "No customers match", description: "Try a name or account number." }}
        />
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          {selected ? (
            <CustomerDetail customer={selected} canHold={can(role, "customer.hold")} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CustomerDetail({ customer, canHold }: { customer: PreviewCustomer; canHold: boolean }) {
  const orders = customerOrders(customer.id);
  return (
    <>
      <SheetHeader>
        <SheetTitle>{customer.name}</SheetTitle>
        <SheetDescription>
          <span className="font-mono">{customer.accountNumber}</span> · {customer.city},{" "}
          {customer.region} · Fictional customer
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CustomerStatusBadge status={customer.status} />
          {customer.holdSince ? (
            <span className="text-small text-subtle-foreground">
              since {fmt.date(customer.holdSince)}
            </span>
          ) : null}
          {canHold && customer.status !== "inactive" ? (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() =>
                previewOnly(
                  customer.status === "on_hold"
                    ? `In the product the hold on ${customer.name} would be released.`
                    : `In the product ${customer.name} would be placed on hold with a reason.`,
                )
              }
            >
              {customer.status === "on_hold" ? "Release hold" : "Place on hold"}
            </Button>
          ) : null}
        </div>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="addresses">Addresses</TabsTrigger>
            <TabsTrigger value="aliases">Item aliases</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <dl className="grid grid-cols-2 gap-4 text-body">
              <div>
                <dt className="text-caption text-muted-foreground">Contact</dt>
                <dd className="mt-0.5 break-all text-navy-900">{customer.contactEmail}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Payment terms</dt>
                <dd className="mt-0.5 text-navy-900">{customer.paymentTerms}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Open customer POs</dt>
                <dd className="mt-0.5 tabular text-navy-900">{customerOpenIntakes(customer.id)}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Sales orders</dt>
                <dd className="mt-0.5 tabular text-navy-900">{orders.length}</dd>
              </div>
            </dl>
          </TabsContent>
          <TabsContent value="addresses">
            {customer.addresses.length ? (
              <ul className="space-y-3">
                {customer.addresses.map((a) => (
                  <li key={a.id} className="rounded-md border border-border p-3">
                    <p className="text-small font-medium text-navy-900">
                      {a.label} ·{" "}
                      <span className="font-normal text-subtle-foreground">
                        {a.type === "billing" ? "Billing" : "Shipping"}
                        {a.isDefault ? ", default" : ""}
                      </span>
                    </p>
                    <p className="mt-1 text-small text-body-foreground">{a.lines.join(", ")}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-muted-foreground">No addresses on file.</p>
            )}
          </TabsContent>
          <TabsContent value="aliases">
            {customer.aliases.length ? (
              <ul className="divide-y divide-border">
                {customer.aliases.map((a) => (
                  <li key={a.customerPartNumber} className="py-2.5">
                    <p className="text-small text-navy-900">
                      <span className="font-mono">{a.customerPartNumber}</span> →{" "}
                      <span className="font-mono">{a.productSku}</span> ·{" "}
                      {productBySku(a.productSku)?.name}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      Learned from {a.learnedFrom} by {a.learnedBy}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-muted-foreground">
                No customer part numbers are mapped yet. They are learned when reviewers choose
                “Remember for this customer”.
              </p>
            )}
          </TabsContent>
          <TabsContent value="orders">
            {orders.length ? (
              <ul className="divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="font-mono text-small text-navy-900">{o.number}</span>
                    <SalesOrderStatusBadge status={o.status} />
                    <span className="text-small tabular text-navy-900">
                      {fmt.money(salesOrderSubtotal(o))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-muted-foreground">No sales orders yet.</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetBody>
    </>
  );
}
