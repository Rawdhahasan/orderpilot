"use client";

import { CheckCheck, Keyboard, ListChecks, Send, UserCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";

import { useShellLayout } from "@/components/app-shell/app-shell";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Banner } from "@/components/feedback/banner";
import { IntakeStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/domain/auth/permissions";
import { sumMoney } from "@/domain/money/decimal";
import { cn } from "@/lib/cn";

import {
  WORKSPACE,
  customerById,
  userName,
  type PreviewIntake,
  type PreviewReview,
} from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { fmt } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";

import { DocumentViewer } from "./document-viewer";
import { ExceptionsPanel } from "./exceptions-panel";
import { HeaderPanel } from "./header-panel";
import { LineItem } from "./line-item";
import {
  canBulkConfirm,
  deriveExceptions,
  initialState,
  lineAmount,
  submissionBlockers,
  unconfirmedCounts,
  type ReviewException,
} from "./model";
import { reviewReducer } from "./reducer";

const SHORTCUTS: [string, string][] = [
  ["Alt + ↓ / Alt + ↑", "Next / previous value to confirm"],
  ["Alt + Enter", "Confirm the focused value"],
  ["Alt + E", "Go to exceptions"],
];

export function ReviewWorkspace({
  intake,
  review,
}: {
  intake: PreviewIntake;
  review: PreviewReview | undefined;
}) {
  const { user, role } = usePersona();
  const editable = can(role, "intake.review");
  const [state, dispatch] = useReducer(reviewReducer, undefined, () =>
    initialState(review, intake.id, intake.assignedTo),
  );
  const initialExceptions = useMemo(
    () => deriveExceptions(initialState(review, intake.id, intake.assignedTo)),
    [review, intake],
  );
  const exceptions = deriveExceptions(state);
  const openIds = new Set(exceptions.map((e) => e.id));
  const resolved = initialExceptions.filter((e) => !openIds.has(e.id) && e.severity === "blocking");
  const blockers = submissionBlockers(exceptions);
  const overridable = exceptions.filter((e) => e.severity === "blocking" && e.overridable);
  const counts = unconfirmedCounts(state);
  const bulkCount = state.lines.filter((l) => canBulkConfirm(l)).length;

  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [highlightPage, setHighlightPage] = useState<number | null>(null);
  const [selectedException, setSelectedException] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [tab, setTab] = useState("order");
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isLarge = useMediaQuery("(min-width: 1024px)");
  const isWide = useMediaQuery("(min-width: 1280px)");
  const isPhoneWide = useMediaQuery("(min-width: 768px)");

  // Give the three review regions room: collapse the sidebar while reviewing.
  const { collapsed, setCollapsed } = useShellLayout();
  const previouslyCollapsed = useRef(collapsed);
  useEffect(() => {
    const restore = previouslyCollapsed.current;
    setCollapsed(true);
    return () => setCollapsed(restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusPage = (target: number | undefined) => {
    if (!target) return;
    setPage(target);
    setHighlightPage(target);
    window.setTimeout(() => setHighlightPage(null), 900);
  };

  const focusTarget = (exception: ReviewException) => {
    setSelectedException(exception.id);
    setExceptionsOpen(false);
    setTab("order");
    const targetId =
      exception.target === "first-unconfirmed"
        ? rootRef.current?.querySelector<HTMLElement>("[data-unconfirmed]")?.id
        : `field-${exception.target}`;
    window.requestAnimationFrame(() => {
      const element = targetId ? document.getElementById(targetId) : null;
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      (element?.matches("input,button,[tabindex]")
        ? element
        : element?.querySelector<HTMLElement>("input,button,[tabindex]")
      )?.focus({ preventScroll: true });
    });
    if (exception.target.startsWith("line-")) setSelectedLine(Number(exception.target.slice(5)));
    focusPage(exception.page);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>("[data-unconfirmed]") ?? [],
      );
      if (!items.length) return;
      event.preventDefault();
      const current = items.findIndex((el) => el.contains(document.activeElement));
      const next =
        event.key === "ArrowDown"
          ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length;
      const target = items[next]!;
      target.scrollIntoView({ block: "center" });
      (
        target.querySelector<HTMLElement>("input, select, textarea") ??
        target.querySelector<HTMLElement>("button") ??
        target
      ).focus({ preventScroll: true });
    }
    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      if (isWide) document.getElementById("exceptions-region")?.focus();
      else if (isLarge) setExceptionsOpen(true);
      else setTab("exceptions");
    }
  };

  const customer = customerById(state.customerId);
  const subtotal = sumMoney(state.lines.map((l) => lineAmount(l) ?? "0"));
  const remaining = [
    blockers.length
      ? `${blockers.length} blocking exception${blockers.length > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);

  const viewer = (
    <DocumentViewer
      review={review}
      page={page}
      onPageChange={setPage}
      zoomIndex={zoomIndex}
      onZoomChange={setZoomIndex}
      highlightPage={highlightPage}
      fileName={intake.fileName}
    />
  );

  const order = (
    <div className="space-y-6 p-4">
      {state.manualEntry ? (
        <Banner tone="info" className="rounded-lg">
          No values were extracted. Enter the order from the document. Nothing has been guessed.
        </Banner>
      ) : null}
      <HeaderPanel
        state={state}
        dispatch={dispatch}
        editable={editable}
        actor={user.name}
        onFocusPage={focusPage}
      />
      <section aria-labelledby="lines-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="lines-heading"
            className="text-caption font-medium tracking-[0.04em] text-subtle-foreground uppercase"
          >
            Lines <span className="tabular">({state.lines.length})</span>
          </h2>
          {editable && state.lines.length ? (
            <BulkConfirmDialog
              count={bulkCount}
              threshold={WORKSPACE.confidenceThreshold}
              onConfirm={() => dispatch({ type: "bulkConfirm", by: user.name })}
            />
          ) : null}
        </div>
        {state.lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-400 bg-white p-6 text-center">
            <p className="text-body text-navy-900">No lines yet.</p>
            <p className="mt-1 text-small text-subtle-foreground">
              Manual line entry arrives in Phase 4B.
            </p>
          </div>
        ) : (
          state.lines.map((line) => (
            <LineItem
              key={line.lineNo}
              line={line}
              dispatch={dispatch}
              editable={editable}
              actor={user.name}
              selected={selectedLine === line.lineNo}
              onFocus={() => {
                setSelectedLine(line.lineNo);
                focusPage(line.page);
              }}
            />
          ))
        )}
      </section>
    </div>
  );

  const exceptionsPanel = (
    <ExceptionsPanel
      open={exceptions}
      resolved={resolved}
      selectedId={selectedException}
      onSelect={focusTarget}
      onShowOnDocument={(p) => {
        setTab("document");
        focusPage(p);
      }}
      actor={user.name}
    />
  );

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className="-mx-4 -my-6 flex min-h-[calc(100dvh-6.5rem)] flex-col md:-mx-6"
    >
      {/* Intake header */}
      <div className="border-b border-border bg-white px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-h2 font-semibold text-navy-900">{intake.reference}</h1>
              <IntakeStatusBadge status={intake.status} />
              {state.manualEntry ? (
                <Badge tone="neutral">Manual entry</Badge>
              ) : (
                <Badge tone="ai">Simulated extraction (demo)</Badge>
              )}
              <FictionalBadge />
            </div>
            <p className="mt-1 text-small text-subtle-foreground">
              {customer?.name ?? "Customer not identified"}
              {intake.poNumber ? ` · PO ${intake.poNumber}` : ""} · Received{" "}
              {fmt.relative(intake.receivedAt)}
              {" · "}
              {state.assignedTo ? `Assigned to ${userName(state.assignedTo)}` : "Unassigned"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-muted-foreground" aria-live="polite">
              Preview: changes are not saved
            </span>
            <ShortcutsDialog />
            {editable && state.assignedTo !== user.id ? (
              <Button
                size="sm"
                onClick={() => {
                  dispatch({ type: "assign", userId: user.id });
                  previewOnly(
                    `In the product, ${intake.reference} would be assigned to ${user.name} and the change audited.`,
                  );
                }}
              >
                <UserCheck aria-hidden />
                {state.assignedTo ? "Take over" : "Assign to me"}
              </Button>
            ) : null}
            {editable ? <CancelDialog reference={intake.reference} /> : null}
          </div>
        </div>
        {editable && !isPhoneWide ? (
          <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-small text-subtle-foreground">
            Reviewing works best on a larger screen, with the document beside the order.
          </p>
        ) : null}
        {!editable ? (
          <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-small text-subtle-foreground">
            Read-only: your role can view customer POs but not review them.
          </p>
        ) : null}
      </div>

      {/* Regions: tabs below 1024 px, document + order from 1024 px, three regions from 1280 px.
          Only one layout is rendered so every field id stays unique. */}
      {!isLarge ? (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="bg-white px-4">
            <TabsTrigger value="order">Order</TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="exceptions">
              Exceptions <span className="tabular text-danger-700">{exceptions.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="order" className="pt-0">
            {order}
          </TabsContent>
          <TabsContent value="document" className="h-[70dvh] pt-0">
            {viewer}
          </TabsContent>
          <TabsContent value="exceptions" className="p-4">
            {exceptionsPanel}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,1fr)_minmax(540px,1.1fr)_320px]">
          <div className="sticky top-14 h-[calc(100dvh-6.5rem)] border-r border-border">
            {viewer}
          </div>
          <div className="min-w-0 bg-background">
            {!isWide ? (
              <div className="flex justify-end px-4 pt-3">
                <Sheet open={exceptionsOpen} onOpenChange={setExceptionsOpen}>
                  <SheetTrigger asChild>
                    <Button size="sm">
                      <ListChecks aria-hidden />
                      Exceptions ({exceptions.length})
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Exceptions</SheetTitle>
                      <SheetDescription>
                        Problems found in this customer PO, with their fixes.
                      </SheetDescription>
                    </SheetHeader>
                    <SheetBody>{exceptionsPanel}</SheetBody>
                  </SheetContent>
                </Sheet>
              </div>
            ) : null}
            {order}
          </div>
          {isWide ? (
            <aside
              id="exceptions-region"
              tabIndex={-1}
              aria-label="Exceptions"
              className="sticky top-14 h-[calc(100dvh-6.5rem)] overflow-y-auto border-l border-border bg-white p-4 outline-none"
            >
              <h2 className="mb-3 text-caption font-medium tracking-[0.04em] text-subtle-foreground uppercase">
                Exceptions
              </h2>
              {exceptionsPanel}
            </aside>
          ) : null}
        </div>
      )}

      {/* Submit bar */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 md:px-6">
        <p className="text-small text-subtle-foreground" aria-live="polite">
          {remaining.length || counts.fields + counts.lines ? (
            <>
              {remaining.join(" · ")}
              {remaining.length && counts.fields + counts.lines ? " · " : ""}
              {counts.fields + counts.lines
                ? `${counts.fields} fields and ${counts.lines} lines to confirm`
                : ""}
            </>
          ) : (
            <span className="text-success-700">Ready to submit</span>
          )}
          {state.lines.length ? (
            <span className="ml-2 tabular text-navy-900">· Subtotal {fmt.money(subtotal)}</span>
          ) : null}
        </p>
        {editable ? (
          <SubmitDialog
            reference={intake.reference}
            disabled={blockers.length > 0}
            disabledReason={remaining.join(", ")}
            overrideCount={overridable.length}
          />
        ) : null}
      </div>
    </div>
  );
}

function BulkConfirmDialog({
  count,
  threshold,
  onConfirm,
}: {
  count: number;
  threshold: number;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" disabled={count === 0}>
          <CheckCheck aria-hidden />
          Confirm high-confidence lines{count ? ` (${count})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {count} high-confidence lines?</DialogTitle>
          <DialogDescription>
            This confirms {count} lines where every value is at or above{" "}
            {Math.round(threshold * 100)}% confidence and the product match is known. Lines with
            low-confidence values or open problems are left for you to check individually. In the
            product this is an audited action.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="primary" onClick={onConfirm}>
              Confirm {count} lines
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmitDialog({
  reference,
  disabled,
  disabledReason,
  overrideCount,
}: {
  reference: string;
  disabled: boolean;
  disabledReason: string;
  overrideCount: number;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog>
      <div className="flex flex-col items-end">
        <DialogTrigger asChild>
          <Button
            variant="primary"
            disabled={disabled}
            aria-describedby={disabled ? "submit-disabled-reason" : undefined}
          >
            <Send aria-hidden />
            Submit for approval
          </Button>
        </DialogTrigger>
        {disabled ? (
          <span id="submit-disabled-reason" className="sr-only">
            Resolve first: {disabledReason}
          </span>
        ) : null}
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit {reference} for approval?</DialogTitle>
          <DialogDescription>
            An approver reviews the order before any sales order is created.
            {overrideCount
              ? ` ${overrideCount} item${overrideCount > 1 ? "s" : ""} will need an approver override.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="submit-note">Note for the approver (optional)</Label>
          <Textarea
            id="submit-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              variant="primary"
              onClick={() =>
                previewOnly(
                  `In the product, ${reference} would move to Awaiting approval. Nothing was submitted.`,
                )
              }
            >
              Submit for approval
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CANCEL_REASONS = [
  { value: "duplicate", label: "Duplicate" },
  { value: "not_a_purchase_order", label: "Not a purchase order" },
  { value: "sent_in_error", label: "Sent in error" },
  { value: "other", label: "Other" },
];

function CancelDialog({ reference }: { reference: string }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const valid = reason !== "" && (reason !== "other" || note.trim().length > 0);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <XCircle aria-hidden />
          Cancel intake
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {reference}?</DialogTitle>
          <DialogDescription>
            The document and its history stay available. No sales order is created.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} aria-label="Reason">
          {CANCEL_REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <RadioGroupItem id={`cancel-${r.value}`} value={r.value} />
              <Label htmlFor={`cancel-${r.value}`} className="font-normal">
                {r.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-note">
            Note {reason === "other" ? "(required)" : "(optional)"}
          </Label>
          <Textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Keep intake</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              variant="destructive"
              disabled={!valid}
              onClick={() =>
                previewOnly(
                  `In the product, ${reference} would be cancelled with your reason. Nothing was cancelled.`,
                )
              }
            >
              Cancel intake
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Keyboard shortcuts">
          <Keyboard aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts use modifier keys so they do not conflict with screen readers.
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-body text-navy-900">{action}</dt>
              <dd>
                <Kbd className={cn("px-1.5")}>{keys}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
