"use client";

import {
  ArrowRight,
  Check,
  FileText,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ExceptionItem } from "@/components/exceptions/exception-item";
import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { PhaseNotice } from "@/components/states/phase-notice";
import { IntakeStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/domain/auth/permissions";
import {
  allocate,
  compare,
  lineTotal,
  normalize,
  subtract,
  sumMoney,
} from "@/domain/money/decimal";
import { cn } from "@/lib/cn";

import {
  SALES_ORDERS,
  WORKSPACE,
  availableFor,
  customerById,
  productBySku,
  userName,
  type PreviewApproval,
  type PreviewIntake,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt, previewHref } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";

const PRICE_SOURCE = {
  po_price: "PO price",
  customer_price: "Customer price",
  list_price: "List price",
};

function nextSalesOrderNumber(): string {
  const max = Math.max(...SALES_ORDERS.map((o) => Number(o.number.slice(-6))));
  return `${WORKSPACE.salesOrderPrefix}-2026-${String(max + 1).padStart(6, "0")}`;
}

type Allocation = {
  lineNo: number;
  sku: string;
  uom: string;
  requested: string;
  allocated: string;
  backordered: string;
  tracked: boolean;
};

/** Allocation preview (M-01, M-03): untracked lines in full; nothing from zero or negative stock. */
export function allocationsFor(approval: PreviewApproval): Allocation[] {
  return approval.lines.map((line) => {
    const decimals = productBySku(line.sku)?.quantityDecimals ?? 0;
    if (!line.tracked) {
      return {
        lineNo: line.lineNo,
        sku: line.sku,
        uom: line.uom,
        requested: line.quantity,
        allocated: line.quantity,
        backordered: "0",
        tracked: false,
      };
    }
    const allocated = normalize(allocate(line.quantity, availableFor(line.sku)), decimals);
    return {
      lineNo: line.lineNo,
      sku: line.sku,
      uom: line.uom,
      requested: line.quantity,
      allocated,
      backordered: normalize(subtract(line.quantity, allocated), decimals),
      tracked: true,
    };
  });
}

export function ApprovalSummaryScreen({
  intake,
  approval,
}: {
  intake: PreviewIntake;
  approval: PreviewApproval;
}) {
  const { user, role } = usePersona();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overrideCode, setOverrideCode] = useState<string | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState<"changes" | "reject" | null>(null);

  if (!can(role, "intake.approve")) {
    return <NoPermissionState roleNeeded="Approver" action="approve orders" />;
  }

  const customer = customerById(intake.customerId);
  const subtotal = sumMoney(approval.lines.map((l) => lineTotal(l.quantity, l.unitPrice)));
  const allocations = allocationsFor(approval);
  const short = allocations.filter((a) => a.backordered !== "0");
  const openOverrides = approval.overrideRequired.filter((o) => !overrides[o.code]);
  const selfSubmitted = WORKSPACE.requireIndependentApproval && intake.submittedBy === user.id;
  const approveDisabledReason = selfSubmitted
    ? "You submitted this customer PO. Independent approval is on, so another approver must decide."
    : openOverrides.length
      ? `Override or return ${openOverrides.length} item${openOverrides.length > 1 ? "s" : ""} before approving.`
      : null;
  const soNumber = nextSalesOrderNumber();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title={
          <>
            Approve <span className="font-mono">{intake.reference}</span>?
          </>
        }
        description={`${customer?.name} · PO ${intake.poNumber} · Submitted by ${userName(intake.submittedBy)} ${fmt.relative(intake.submittedAt ?? intake.receivedAt)}`}
        meta={
          <>
            <IntakeStatusBadge status={intake.status} />
            <FictionalBadge />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Order summary */}
          <Card>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
              <div>
                <p className="text-caption text-muted-foreground">Ship to</p>
                <address className="mt-1 text-body text-navy-900 not-italic">
                  {approval.shipTo.map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                </address>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Requested delivery</p>
                <p className="mt-1 text-body text-navy-900">{fmt.date(approval.requestedDate)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Subtotal · {approval.lines.length} lines
                </p>
                <p className="mt-1 text-h2 font-semibold tabular text-navy-900">
                  {fmt.money(subtotal)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Override required */}
          {approval.overrideRequired.length ? (
            <section aria-labelledby="override-heading" className="space-y-2">
              <h2
                id="override-heading"
                className="text-caption font-medium tracking-[0.04em] text-subtle-foreground uppercase"
              >
                Override required ({openOverrides.length})
              </h2>
              {approval.overrideRequired.map((item) => (
                <ExceptionItem
                  key={item.code}
                  code={item.code}
                  severity="blocking"
                  title={item.title}
                  scope="Header"
                  message={item.message}
                  status={overrides[item.code] ? "overridden" : "override_required"}
                  resolution={
                    overrides[item.code]
                      ? `Overridden by ${user.name}: “${overrides[item.code]}” (preview only)`
                      : undefined
                  }
                  actions={
                    <Button
                      size="sm"
                      onClick={() => setOverrideCode(item.code)}
                      disabled={selfSubmitted}
                    >
                      <ShieldCheck aria-hidden />
                      Override…
                    </Button>
                  }
                />
              ))}
            </section>
          ) : null}

          {/* Lines */}
          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
              {short.length ? (
                <Badge tone="warning">
                  <TriangleAlert aria-hidden className="size-3" />
                  {short.length} line{short.length > 1 ? "s" : ""} short on stock
                </Badge>
              ) : null}
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Unit price</TableHead>
                  <TableHead className="hidden md:table-cell">Price source</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approval.lines.map((line) => {
                  const product = productBySku(line.sku);
                  const available = availableFor(line.sku);
                  const isShort = line.tracked && compare(line.quantity, available) > 0;
                  return (
                    <TableRow key={line.lineNo}>
                      <TableCell className="tabular">{line.lineNo}</TableCell>
                      <TableCell>
                        <span className="block text-navy-900">{line.name}</span>
                        <span className="font-mono text-caption text-muted-foreground">
                          {line.sku}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {fmt.qty(line.quantity, line.uom, product?.quantityDecimals)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular sm:table-cell">
                        {fmt.unitPrice(line.unitPrice)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {PRICE_SOURCE[line.priceSource]}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular",
                          isShort && "font-medium text-warning-800",
                        )}
                      >
                        {line.tracked
                          ? fmt.qty(available, line.uom, product?.quantityDecimals)
                          : "Not tracked"}
                      </TableCell>
                      <TableCell className="hidden text-right tabular sm:table-cell">
                        {fmt.money(lineTotal(line.quantity, line.unitPrice))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <SummaryList
              title="Changes from AI suggestion"
              empty="No values were changed from the extracted suggestions."
            >
              {approval.changesFromAi.map((c) => (
                <li key={c.field} className="text-small text-body-foreground">
                  <span className="font-medium text-navy-900">{c.field}:</span> {c.ai}{" "}
                  <ArrowRight aria-label="changed to" className="inline size-3" /> {c.final}
                  <span className="block text-caption text-muted-foreground">by {c.by}</span>
                </li>
              ))}
            </SummaryList>
            <SummaryList
              title="Decisions"
              empty="No price, unit or substitution decisions were needed."
            >
              {[
                ...approval.decisions,
                ...approval.resolved.map((r) => `${r.title}: ${r.resolution}`),
              ].map((d) => (
                <li key={d} className="text-small text-body-foreground">
                  {d}
                </li>
              ))}
            </SummaryList>
            <SummaryList
              title="Aliases to remember"
              empty="No new customer part numbers will be saved."
            >
              {approval.aliasesToRemember.map((a) => (
                <li key={a.customerPartNumber} className="text-small text-body-foreground">
                  <span className="font-mono">{a.customerPartNumber}</span> →{" "}
                  <span className="font-mono">{a.sku}</span>
                </li>
              ))}
            </SummaryList>
            <SummaryList
              title={`Note from ${userName(intake.submittedBy)}`}
              empty="No note was added."
            >
              {approval.note ? (
                <li className="text-small text-body-foreground">“{approval.note}”</li>
              ) : null}
            </SummaryList>
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Original document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="flex items-center gap-2 text-body text-navy-900">
                <FileText aria-hidden className="size-4 text-subtle-foreground" />
                <span className="truncate">{intake.fileName}</span>
              </p>
              <p className="text-small text-subtle-foreground">
                {intake.pages} page{intake.pages > 1 ? "s" : ""} · fictional file, not rendered in
                the preview
              </p>
              <PhaseNotice phase="4B" feature="Viewing the original document beside the summary" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Approval rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-small text-subtle-foreground">
              <p>
                Independent approval is {WORKSPACE.requireIndependentApproval ? "on" : "off"}: the
                submitter cannot approve their own order.
              </p>
              <p>Stock is checked again at the moment of approval, inside one transaction.</p>
              <p>
                <Link
                  href={previewHref("customer-pos")}
                  className="font-medium text-primary hover:underline"
                >
                  Back to customer POs
                </Link>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-white px-4 py-3 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-subtle-foreground" role="status">
            {approveDisabledReason ??
              (short.length
                ? `${short.length} line${short.length > 1 ? "s" : ""} need a stock decision when you approve.`
                : "Everything is resolved.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDecisionOpen("changes")} disabled={selfSubmitted}>
              <RotateCcw aria-hidden />
              Request changes
            </Button>
            <Button onClick={() => setDecisionOpen("reject")} disabled={selfSubmitted}>
              <XCircle aria-hidden />
              Reject
            </Button>
            <Button
              variant="primary"
              disabled={approveDisabledReason !== null}
              onClick={() => (short.length ? setStockOpen(true) : setConfirmOpen(true))}
            >
              <Check aria-hidden />
              Approve order
            </Button>
          </div>
        </div>
      </div>

      <OverrideDialog
        item={approval.overrideRequired.find((o) => o.code === overrideCode)}
        onClose={() => setOverrideCode(null)}
        onConfirm={(reason) => {
          if (overrideCode) setOverrides((current) => ({ ...current, [overrideCode]: reason }));
          setOverrideCode(null);
        }}
      />

      <StockDecisionDialog
        open={stockOpen}
        onOpenChange={setStockOpen}
        allocations={short}
        onBackorder={() => {
          setStockOpen(false);
          setConfirmOpen(true);
        }}
        onRequestChanges={() => {
          setStockOpen(false);
          setDecisionOpen("changes");
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this order?</DialogTitle>
            <DialogDescription>
              This creates sales order {soNumber} and reserves stock for{" "}
              {allocations.filter((a) => a.tracked && a.allocated !== "0").length} lines.
              {short.length
                ? ` ${short.length} line${short.length > 1 ? "s" : ""} will be backordered (${short.map((s) => `${s.backordered} ${s.uom}`).join(", ")}).`
                : ""}
              {allocations.some((a) => !a.tracked) ? " Untracked products are not reserved." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="primary"
                onClick={() =>
                  previewOnly(
                    `In the product, ${soNumber} would be created and stock reserved in one transaction. Nothing was approved.`,
                  )
                }
              >
                Approve order
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        mode={decisionOpen}
        reference={intake.reference}
        onClose={() => setDecisionOpen(null)}
      />
    </div>
  );
}

function SummaryList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-body">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-2">{children}</ul>
        ) : (
          <p className="text-small text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function OverrideDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: { code: string; title: string; message: string } | undefined;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override “{item?.title}”?</DialogTitle>
          <DialogDescription>
            {item?.message} Your reason is shown on the order and recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="override-reason">Reason (required)</Label>
          <Textarea
            id="override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockDecisionDialog({
  open,
  onOpenChange,
  allocations,
  onBackorder,
  onRequestChanges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocations: Allocation[];
  onBackorder: () => void;
  onRequestChanges: () => void;
}) {
  const [choices, setChoices] = useState<Record<number, string>>({});
  const allChosen = allocations.every((a) => choices[a.lineNo]);
  const anyChanges = allocations.some((a) => choices[a.lineNo] === "changes");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Stock is short on {allocations.length} line{allocations.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Stock was checked again just now. Choose what to do for each line. Nothing is created
            until you confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {allocations.map((a) => (
            <fieldset key={a.lineNo} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-small font-medium text-navy-900">
                Line {a.lineNo} · <span className="font-mono">{a.sku}</span>: {a.requested} {a.uom}{" "}
                requested, {a.allocated} available
              </legend>
              <RadioGroup
                value={choices[a.lineNo] ?? ""}
                onValueChange={(v) => setChoices((c) => ({ ...c, [a.lineNo]: v }))}
                className="mt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`bo-${a.lineNo}`} value="backorder" />
                  <Label htmlFor={`bo-${a.lineNo}`} className="font-normal">
                    {a.allocated === "0"
                      ? `Reserve nothing and backorder all ${a.backordered} ${a.uom}`
                      : `Reserve ${a.allocated} ${a.uom} and backorder ${a.backordered} ${a.uom}`}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`ch-${a.lineNo}`} value="changes" />
                  <Label htmlFor={`ch-${a.lineNo}`} className="font-normal">
                    Request changes instead
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={!allChosen}
            onClick={anyChanges ? onRequestChanges : onBackorder}
          >
            {anyChanges ? "Request changes" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  mode,
  reference,
  onClose,
}: {
  mode: "changes" | "reject" | null;
  reference: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const reject = mode === "reject";
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {reject ? `Reject ${reference}?` : `Request changes to ${reference}?`}
          </DialogTitle>
          <DialogDescription>
            {reject
              ? "Rejecting is final. Use it for orders the business will not fulfil."
              : "The customer PO returns to review with your reason shown to the reviewer."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="decision-reason">Reason (required)</Label>
          <Textarea
            id="decision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              variant={reject ? "destructive" : "primary"}
              disabled={!reason.trim()}
              onClick={() =>
                previewOnly(
                  reject
                    ? `In the product, ${reference} would be rejected with your reason. Nothing was rejected.`
                    : `In the product, ${reference} would return to review with your reason. Nothing was changed.`,
                )
              }
            >
              {reject ? "Reject order" : "Request changes"}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
