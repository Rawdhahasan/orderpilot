"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { DataTable } from "@/components/data-table/data-table";
import { ExceptionItem } from "@/components/exceptions/exception-item";
import { Banner } from "@/components/feedback/banner";
import { PageHeader } from "@/components/layout/page-header";
import { ProvenanceMarker, provenanceFieldClass } from "@/components/provenance/provenance-marker";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { PhaseNotice } from "@/components/states/phase-notice";
import {
  CUSTOMER_STATUS,
  INTAKE_STATUS,
  PRODUCT_STATUS,
  SALES_ORDER_STATUS,
  STOCK_STATUS,
  StatusBadge,
} from "@/components/status/status-badge";
import { Timeline } from "@/components/timeline/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PROVENANCE_STATES } from "@/domain/orders/statuses";

import { FictionalBadge } from "../components/fictional-badge";
import { previewOnly } from "../notify";

type Row = { sku: string; name: string; qty: string };
const SAMPLE_ROWS: Row[] = [
  { sku: "JAN-1001", name: "Nitrile exam gloves, medium", qty: "640" },
  { sku: "JAN-2207", name: "Multifold paper towels", qty: "210" },
];
const SAMPLE_COLUMNS: ColumnDef<Row, unknown>[] = [
  { id: "sku", header: "SKU", accessorKey: "sku" },
  { id: "name", header: "Product", accessorKey: "name" },
  { id: "qty", header: "On hand", accessorKey: "qty", meta: { align: "right" } },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function ComponentsScreen() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="Component gallery"
        description="Every OrderPilot component state on one page, for visual review. Sample values are fictional."
        meta={<FictionalBadge label="Fictional samples" />}
      />

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Approve order</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Cancel order</Button>
          <Button variant="link">Link</Button>
          <Button variant="primary" pending>
            Approving
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small 32 px</Button>
          <Button size="md">Default 36 px</Button>
          <Button size="lg">Large 40 px</Button>
          <Button size="icon" aria-label="Add">
            <Plus aria-hidden />
          </Button>
        </div>
      </Section>

      <Section title="Status badges">
        {[INTAKE_STATUS, SALES_ORDER_STATUS, CUSTOMER_STATUS, PRODUCT_STATUS, STOCK_STATUS].map(
          (group, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              {Object.entries(group).map(([key, def]) => (
                <StatusBadge key={key} def={def} />
              ))}
            </div>
          ),
        )}
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="ai">AI suggestion</Badge>
        </div>
      </Section>

      <Section title="Provenance markers">
        <p className="text-small text-subtle-foreground">
          Violet appears only on unconfirmed AI suggestions.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROVENANCE_STATES.map((state) => (
            <div
              key={state}
              className={`rounded-md p-2.5 ${provenanceFieldClass(state) || "bg-white ring-1 ring-border ring-inset"}`}
            >
              <p className="mb-1.5 font-mono text-caption text-subtle-foreground">{state}</p>
              <ProvenanceMarker
                provenance={{
                  state,
                  confidence:
                    state === "suggested" ? 0.97 : state === "suggested_low" ? 0.61 : undefined,
                  page: 1,
                  by: "Jordan Ellis",
                  at: "09:14",
                  aiValue: "12",
                  alternatives: ["Nov 4", "Apr 11"],
                  sourceLabel: "Catalog price",
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Exception items">
        <div className="grid gap-3 lg:grid-cols-2">
          <ExceptionItem
            code="UOM_MISMATCH"
            severity="blocking"
            title="Unit mismatch"
            scope="Line 4"
            message="PO says 5 CS; product sells in EA."
            actions={<Button size="sm">Convert quantity</Button>}
          />
          <ExceptionItem
            code="INSUFFICIENT_STOCK"
            severity="warning"
            title="Insufficient stock"
            scope="Line 7"
            message="60 EA requested, 40 available."
          />
          <ExceptionItem
            code="CUSTOMER_ON_HOLD"
            severity="blocking"
            title="Customer on hold"
            scope="Header"
            message="Customer is on hold: overdue invoices."
            status="override_required"
          />
          <ExceptionItem
            code="DUPLICATE_PO_NUMBER"
            severity="blocking"
            title="Duplicate PO number"
            scope="Header"
            message="PO 88213 was already received."
            status="overridden"
            resolution="Overridden by Priya Raman: “Customer reuses PO numbers for weekly releases”"
          />
        </div>
      </Section>

      <Section title="Stat tiles">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Awaiting approval"
            value="3"
            context="Oldest waiting 3 h 44 min"
            href="#"
          />
          <StatTile
            label="Median upload to approval"
            value={null}
            insufficientReason="Needs at least 3 approved orders in the last 7 days."
          />
          <StatTile
            label="Override required"
            value="1"
            context="Needs an approver"
            emphasis="attention"
          />
        </div>
      </Section>

      <Section title="Data table states">
        <DataTable caption="Ready" columns={SAMPLE_COLUMNS} data={SAMPLE_ROWS} />
        <DataTable caption="Loading" columns={SAMPLE_COLUMNS} data={[]} state="loading" />
        <DataTable
          caption="Empty"
          columns={SAMPLE_COLUMNS}
          data={[]}
          empty={{
            title: "No products yet",
            description: "Products you add or import appear here.",
            action: <Button variant="primary">Add product</Button>,
          }}
        />
        <DataTable
          caption="Error"
          columns={SAMPLE_COLUMNS}
          data={[]}
          state="error"
          onRetry={() => previewOnly("Retry is a demonstration here.")}
        />
      </Section>

      <Section title="Empty, error and permission states">
        <div className="grid gap-3 lg:grid-cols-3">
          <Card>
            <EmptyState
              title="No customer POs yet"
              description="Upload a PO to start."
              action={<Button variant="primary">Upload PO</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              requestId="7f3a9c21"
              onRetry={() => previewOnly("Retry is a demonstration here.")}
            />
          </Card>
          <Card>
            <NoPermissionState roleNeeded="Approver" action="approve orders" />
          </Card>
        </div>
        <PhaseNotice phase="4B" feature="The PDF viewer" />
        <Skeleton className="h-10 w-full" />
      </Section>

      <Section title="Banners and toasts">
        <Banner tone="info">
          Simulated extraction (demo): values were produced by the simulated provider.
        </Banner>
        <Banner tone="warning">
          Changes requested by Priya Raman: “Confirm the ship-to with the customer.”
        </Banner>
        <Button
          onClick={() =>
            previewOnly("Toasts confirm background actions and always say what happened.")
          }
        >
          Show a toast
        </Button>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="g-input">Customer PO number</Label>
            <Input id="g-input" defaultValue="88213" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-invalid">Quantity</Label>
            <Input
              id="g-invalid"
              defaultValue="-2"
              aria-invalid
              aria-describedby="g-invalid-error"
            />
            <p id="g-invalid-error" className="text-small text-danger-700">
              Quantity must be greater than zero.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="g-textarea">Note for the approver</Label>
            <Textarea id="g-textarea" placeholder="Optional" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="g-check" defaultChecked />
            <Label htmlFor="g-check" className="font-normal">
              Remember for this customer
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="g-switch" defaultChecked />
            <Label htmlFor="g-switch" className="font-normal">
              Require independent approval
            </Label>
          </div>
        </div>
      </Section>

      <Section title="Timeline">
        <Timeline
          entries={[
            {
              id: "1",
              kind: "upload",
              actor: "Jordan Ellis",
              action: "uploaded HarborPine_PO_88213.pdf",
              when: "2 h ago",
              whenAbsolute: "Oct 20, 2026, 9:51 AM",
            },
            {
              id: "2",
              kind: "edit",
              actor: "Jordan Ellis",
              action: "changed line 5 quantity",
              when: "1 h ago",
              whenAbsolute: "Oct 20, 2026, 10:31 AM",
              detail: "Quantity: 12 → 120. AI suggested 12.",
            },
            {
              id: "3",
              kind: "approval",
              actor: "Priya Raman",
              action: "approved and created SO-2026-000412",
              when: "just now",
              whenAbsolute: "Oct 20, 2026, 11:42 AM",
              emphasis: true,
            },
          ]}
        />
      </Section>

      <p className="flex items-center gap-1.5 text-small text-muted-foreground">
        <Check aria-hidden className="size-3.5" /> Screenshot comparison tests for these states
        start in Phase 6.
      </p>
    </div>
  );
}
