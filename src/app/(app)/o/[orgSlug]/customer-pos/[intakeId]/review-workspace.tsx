"use client";

import { Check, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  ProvenanceMarker,
  provenanceFieldClass,
  type Provenance,
} from "@/components/provenance/provenance-marker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fieldControlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compare, lineTotal } from "@/domain/money/decimal";
import { saveDraft, searchProducts, type ProductOption } from "@/features/review/actions";
import { cn } from "@/lib/cn";

type Meta = Record<string, unknown> & {
  source?: string;
  state?: string;
  confidence?: number;
  ambiguous?: boolean;
  price_decision?: string;
};
type MetaMap = Record<string, Meta>;

export type ReviewHeader = {
  customer_id: string | null;
  customer_po_number: string | null;
  po_date: string | null;
  requested_delivery_date: string | null;
  currency: string | null;
  payment_terms: string | null;
  document_total: string | null;
  notes: string | null;
  ship_to: Record<string, string> | null;
  ship_to_address_id: string | null;
  field_meta: MetaMap;
};

export type ReviewProduct = {
  id: string;
  sku: string;
  name: string;
  selling_uom: string;
  quantity_decimals: number;
  status: string;
};

export type ReviewLine = {
  id?: string;
  key: string;
  line_no: number;
  customer_part_number: string | null;
  description: string | null;
  po_quantity: string | null;
  po_uom: string | null;
  po_unit_price: string | null;
  product: ReviewProduct | null;
  match_method: string | null;
  match_score: number | null;
  remember_alias: boolean;
  quantity: string | null;
  uom_conversion_note: string | null;
  unit_price: string | null;
  price_source: string | null;
  expected_price: string | null;
  expected_source: string | null;
  available: string | null;
  field_meta: MetaMap;
  removed: boolean;
};

export type ReviewProps = {
  slug: string;
  organizationId: string;
  intakeId: string;
  version: number;
  canEdit: boolean;
  confidenceThreshold: number;
  currentUser: string;
  money: { locale: string; currency: string };
  customers: { id: string; name: string; status: string }[];
  addresses: {
    id: string;
    label: string | null;
    line1: string;
    city: string | null;
    postal_code: string | null;
    country_code: string;
    is_default: boolean;
  }[];
  header: ReviewHeader;
  lines: ReviewLine[];
};

/** Provenance state for a field (DESIGN_SYSTEM.md §9.6). */
function provenanceOf(
  meta: Meta | undefined,
  value: unknown,
  threshold: number,
): Provenance | null {
  if (!meta) return value === null || value === "" ? { state: "missing" } : null;
  const common = {
    confidence: meta.confidence,
    page: typeof meta.page === "number" ? meta.page : undefined,
  };
  if (meta.source === "system_default")
    return { state: "system_default", sourceLabel: String(meta.label ?? "System default") };
  if (meta.state === "confirmed")
    return { state: "confirmed", by: meta.confirmed_by as string | undefined };
  if (meta.state === "edited")
    return {
      state: "edited",
      aiValue: meta.ai_value === undefined ? undefined : String(meta.ai_value),
      by: meta.edited_by as string | undefined,
    };
  if (meta.source === "user") return { state: "user_entered" };
  if (meta.state === "suggested") {
    if (meta.ambiguous) return { state: "ambiguous", ...common, alternatives: [] };
    return { state: (meta.confidence ?? 1) < threshold ? "suggested_low" : "suggested", ...common };
  }
  return null;
}

function isPending(meta: Meta | undefined) {
  return meta?.source === "ai" && meta.state === "suggested";
}

function FieldRow({
  label,
  id,
  provenance,
  onConfirm,
  canEdit,
  children,
}: {
  label: string;
  id: string;
  provenance: Provenance | null;
  onConfirm?: () => void;
  canEdit: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-md p-1.5",
        provenance ? provenanceFieldClass(provenance.state) : "",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="flex items-center gap-1">
          {provenance ? <ProvenanceMarker provenance={provenance} /> : null}
          {canEdit && onConfirm ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onConfirm}
              aria-label={`Confirm ${label}`}
            >
              <Check aria-hidden />
            </Button>
          ) : null}
        </span>
      </div>
      {children}
    </div>
  );
}

let newLineCounter = 0;

export function ReviewWorkspace(props: ReviewProps) {
  const router = useRouter();
  const [header, setHeader] = useState(props.header);
  const [lines, setLines] = useState(props.lines);
  const [version, setVersion] = useState(props.version);
  const [status, setStatus] = useState<{
    kind: "idle" | "saving" | "saved" | "error" | "stale";
    message?: string;
  }>({ kind: "idle" });
  // Every edit bumps the revision; an effect saves shortly after the last one.
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const sentRevision = useRef(0);
  const saving = useRef(false);
  const latest = useRef({ header, lines, version });
  const saveRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    latest.current = { header, lines, version };
    revisionRef.current = revision;
  });

  // Adopt fresh server state when nothing was edited since the last save.
  useEffect(() => {
    if (
      props.version !== version &&
      revisionRef.current === sentRevision.current &&
      !saving.current
    ) {
      setHeader(props.header);
      setLines(props.lines);
      setVersion(props.version);
    }
  }, [props.version, props.header, props.lines, version]);

  const save = useCallback(async () => {
    if (saving.current || !props.canEdit) return;
    saving.current = true;
    sentRevision.current = revisionRef.current;
    setStatus({ kind: "saving" });
    const { header: h, lines: ls, version: v } = latest.current;
    const result = await saveDraft({
      slug: props.slug,
      intakeId: props.intakeId,
      version: v,
      header: {
        customer_id: h.customer_id,
        customer_po_number: h.customer_po_number,
        po_date: h.po_date || null,
        requested_delivery_date: h.requested_delivery_date || null,
        currency: h.currency || null,
        payment_terms: h.payment_terms,
        document_total: h.document_total || null,
        notes: h.notes,
        ship_to: h.ship_to,
        ship_to_address_id: h.ship_to_address_id,
        field_meta: h.field_meta,
      },
      lines: ls.map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        customer_part_number: l.customer_part_number,
        description: l.description,
        po_quantity: l.id ? undefined : l.po_quantity,
        po_uom: l.id ? undefined : l.po_uom,
        product_id: l.product?.id ?? null,
        match_method: (l.product ? (l.match_method ?? "manual") : null) as "manual" | null,
        match_score: l.product ? l.match_score : null,
        remember_alias: l.product ? l.remember_alias : false,
        quantity: l.quantity || null,
        uom_conversion_note: l.uom_conversion_note,
        unit_price: l.unit_price || null,
        price_source: (l.unit_price ? (l.price_source ?? "po_price") : null) as "po_price" | null,
        field_meta: l.field_meta,
        removed: l.removed,
      })),
    });
    saving.current = false;
    if (result.ok) {
      setVersion(result.version);
      setStatus({ kind: "saved" });
      if (revisionRef.current !== sentRevision.current) void saveRef.current();
      else router.refresh();
    } else if (result.stale) {
      setStatus({
        kind: "stale",
        message: `${result.stale.by ?? "Someone else"} changed this order${result.stale.at ? ` at ${new Date(result.stale.at).toLocaleTimeString()}` : ""}. Reload to see their changes.`,
      });
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }, [props.canEdit, props.intakeId, props.slug, router]);

  // Autosave shortly after the last change (FR-REV-10).
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (revision === 0) return;
    const id = setTimeout(() => void saveRef.current(), 700);
    return () => clearTimeout(id);
  }, [revision]);
  const changed = () => setRevision((r) => r + 1);

  const t = props.confidenceThreshold;
  const stamp = { confirmed_by: props.currentUser, confirmed_at: new Date().toISOString() };

  const setHeaderValue = (key: keyof ReviewHeader, value: unknown) => {
    setHeader((h) => {
      const meta = h.field_meta[key];
      const nextMeta: Meta =
        meta?.source === "ai"
          ? { ...meta, state: "edited", edited_by: props.currentUser }
          : { source: "user", state: "user_entered" };
      return { ...h, [key]: value, field_meta: { ...h.field_meta, [key]: nextMeta } };
    });
    changed();
  };
  const confirmHeader = (key: string) => {
    setHeader((h) => ({
      ...h,
      field_meta: {
        ...h.field_meta,
        [key]: { ...h.field_meta[key], state: "confirmed", ...stamp },
      },
    }));
    changed();
  };
  const updateLine = (
    key: string,
    patch: Partial<ReviewLine>,
    metaKey?: string,
    metaPatch?: Meta,
  ) => {
    setLines((list) =>
      list.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (metaKey) {
          const meta = l.field_meta[metaKey];
          const derived: Meta =
            metaPatch ??
            (meta?.source === "ai"
              ? { ...meta, state: "edited", edited_by: props.currentUser }
              : { source: "user", state: "user_entered" });
          next.field_meta = {
            ...l.field_meta,
            [metaKey]: { ...(metaPatch ? meta : {}), ...derived },
          };
        }
        return next;
      }),
    );
    changed();
  };
  const confirmLine = (key: string, fields?: string[]) => {
    setLines((list) =>
      list.map((l) => {
        if (l.key !== key) return l;
        const meta = { ...l.field_meta };
        for (const [k, m] of Object.entries(meta))
          if ((!fields || fields.includes(k)) && isPending(m))
            meta[k] = { ...m, state: "confirmed", ...stamp };
        return { ...l, field_meta: meta };
      }),
    );
    changed();
  };
  /** D-06: bulk confirmation only for values at or above the confidence threshold. */
  const confirmConfident = () => {
    const ok = (m: Meta) => isPending(m) && !m.ambiguous && (m.confidence ?? 0) >= t;
    setHeader((h) => ({
      ...h,
      field_meta: Object.fromEntries(
        Object.entries(h.field_meta).map(([k, m]) => [
          k,
          ok(m) ? { ...m, state: "confirmed", ...stamp } : m,
        ]),
      ),
    }));
    setLines((list) =>
      list.map((l) => ({
        ...l,
        field_meta: Object.fromEntries(
          Object.entries(l.field_meta).map(([k, m]) => [
            k,
            ok(m) ? { ...m, state: "confirmed", ...stamp } : m,
          ]),
        ),
      })),
    );
    changed();
  };

  const pendingCount =
    Object.values(header.field_meta).filter(isPending).length +
    lines
      .filter((l) => !l.removed)
      .reduce((n, l) => n + Object.values(l.field_meta).filter(isPending).length, 0);
  const lowCount =
    Object.values(header.field_meta).filter(
      (m) => isPending(m) && (m.ambiguous || (m.confidence ?? 0) < t),
    ).length +
    lines
      .filter((l) => !l.removed)
      .reduce(
        (n, l) =>
          n +
          Object.values(l.field_meta).filter(
            (m) => isPending(m) && (m.ambiguous || (m.confidence ?? 0) < t),
          ).length,
        0,
      );
  const money = (v: string) =>
    new Intl.NumberFormat(props.money.locale, {
      style: "currency",
      currency: props.money.currency,
    }).format(Number(v));
  const disabled = !props.canEdit;
  const hp = (key: keyof ReviewHeader) => provenanceOf(header.field_meta[key], header[key], t);
  const confirmable = (key: string) =>
    props.canEdit && isPending(header.field_meta[key]) ? () => confirmHeader(key) : undefined;

  return (
    <div className="space-y-5" data-testid="review-workspace">
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-white px-3 py-2 text-small"
        role="status"
        aria-live="polite"
      >
        <span className="font-medium text-navy-900">
          {pendingCount === 0
            ? "All values confirmed"
            : `${pendingCount} value${pendingCount === 1 ? "" : "s"} to confirm`}
        </span>
        {props.canEdit && pendingCount > lowCount ? (
          <Button size="sm" onClick={confirmConfident}>
            Confirm all above {Math.round(t * 100)}%
          </Button>
        ) : null}
        {lowCount > 0 ? (
          <span className="text-warning-800">
            {lowCount} low-confidence or ambiguous: confirm individually
          </span>
        ) : null}
        <span className="ml-auto text-subtle-foreground" data-testid="save-status">
          {status.kind === "saving" ? (
            "Saving…"
          ) : status.kind === "saved" ? (
            "All changes saved"
          ) : status.kind === "error" ? (
            <span className="text-danger-700">{status.message}</span>
          ) : null}
        </span>
      </div>
      {status.kind === "stale" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md bg-warning-50 px-3 py-2 text-small text-warning-800"
        >
          {status.message}
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      ) : null}

      <section
        aria-labelledby="header-heading"
        className="rounded-lg border border-border bg-white p-4"
      >
        <h2 id="header-heading" className="mb-3 text-h3 font-semibold text-navy-900">
          Order details
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow
            label="Customer"
            id="f-customer"
            provenance={hp("customer_id")}
            onConfirm={confirmable("customer_id")}
            canEdit={props.canEdit}
          >
            <select
              id="f-customer"
              className={cn(fieldControlClass, "h-9")}
              value={header.customer_id ?? ""}
              disabled={disabled}
              onChange={(e) => {
                setHeader((h) => ({
                  ...h,
                  customer_id: e.target.value || null,
                  ship_to_address_id: null,
                  field_meta: {
                    ...h.field_meta,
                    customer_id: { source: "user", state: "confirmed", ...stamp },
                  },
                }));
                changed();
              }}
            >
              <option value="">Select the customer</option>
              {props.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== "active" ? ` (${c.status.replace("_", " ")})` : ""}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow
            label="Customer PO number"
            id="f-po"
            provenance={hp("customer_po_number")}
            onConfirm={confirmable("customer_po_number")}
            canEdit={props.canEdit}
          >
            <input
              id="f-po"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.customer_po_number ?? ""}
              onChange={(e) => setHeaderValue("customer_po_number", e.target.value)}
            />
          </FieldRow>
          <FieldRow
            label="PO date"
            id="f-po-date"
            provenance={hp("po_date")}
            onConfirm={confirmable("po_date")}
            canEdit={props.canEdit}
          >
            <input
              id="f-po-date"
              type="date"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.po_date ?? ""}
              onChange={(e) => setHeaderValue("po_date", e.target.value || null)}
            />
          </FieldRow>
          <FieldRow
            label="Requested delivery"
            id="f-rdd"
            provenance={hp("requested_delivery_date")}
            onConfirm={confirmable("requested_delivery_date")}
            canEdit={props.canEdit}
          >
            <input
              id="f-rdd"
              type="date"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.requested_delivery_date ?? ""}
              onChange={(e) => setHeaderValue("requested_delivery_date", e.target.value || null)}
            />
          </FieldRow>
          <FieldRow
            label="Currency"
            id="f-currency"
            provenance={hp("currency")}
            onConfirm={confirmable("currency")}
            canEdit={props.canEdit}
          >
            <input
              id="f-currency"
              className={cn(fieldControlClass, "h-9 uppercase")}
              maxLength={3}
              disabled={disabled}
              value={header.currency ?? ""}
              onChange={(e) => setHeaderValue("currency", e.target.value.toUpperCase())}
            />
          </FieldRow>
          <FieldRow
            label="Payment terms (as printed)"
            id="f-terms"
            provenance={hp("payment_terms")}
            onConfirm={confirmable("payment_terms")}
            canEdit={props.canEdit}
          >
            <input
              id="f-terms"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.payment_terms ?? ""}
              onChange={(e) => setHeaderValue("payment_terms", e.target.value)}
            />
          </FieldRow>
          <FieldRow
            label="Document total (as printed)"
            id="f-total"
            provenance={hp("document_total")}
            onConfirm={confirmable("document_total")}
            canEdit={props.canEdit}
          >
            <input
              id="f-total"
              inputMode="decimal"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.document_total ?? ""}
              onChange={(e) => setHeaderValue("document_total", e.target.value)}
            />
          </FieldRow>
          <FieldRow
            label="Ship to"
            id="f-ship"
            provenance={hp("ship_to")}
            onConfirm={confirmable("ship_to")}
            canEdit={props.canEdit}
          >
            <select
              id="f-ship"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.ship_to_address_id ?? ""}
              onChange={(e) => {
                setHeader((h) => ({ ...h, ship_to_address_id: e.target.value || null }));
                changed();
              }}
            >
              <option value="">
                {header.ship_to
                  ? `As printed: ${[header.ship_to.line1, header.ship_to.city].filter(Boolean).join(", ")}`
                  : "No ship-to: choose a saved address or enter it"}
              </option>
              {props.addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  Saved: {[a.label, a.line1, a.city].filter(Boolean).join(", ")}
                </option>
              ))}
            </select>
            {!header.ship_to_address_id ? (
              <input
                aria-label="Ship-to address line as printed"
                placeholder="Address line as printed"
                className={cn(fieldControlClass, "mt-1 h-9")}
                disabled={disabled}
                value={header.ship_to?.line1 ?? ""}
                onChange={(e) =>
                  setHeaderValue(
                    "ship_to",
                    e.target.value ? { ...(header.ship_to ?? {}), line1: e.target.value } : null,
                  )
                }
              />
            ) : null}
          </FieldRow>
          <FieldRow
            label="Notes (as printed)"
            id="f-notes"
            provenance={hp("notes")}
            onConfirm={confirmable("notes")}
            canEdit={props.canEdit}
          >
            <input
              id="f-notes"
              className={cn(fieldControlClass, "h-9")}
              disabled={disabled}
              value={header.notes ?? ""}
              onChange={(e) => setHeaderValue("notes", e.target.value)}
            />
          </FieldRow>
        </div>
      </section>

      <section aria-labelledby="lines-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="lines-heading" className="text-h3 font-semibold text-navy-900">
            Lines
          </h2>
          {props.canEdit ? (
            <Button
              size="sm"
              onClick={() => {
                newLineCounter += 1;
                setLines((list) => [
                  ...list,
                  {
                    key: `new-${newLineCounter}`,
                    line_no: Math.max(0, ...list.map((l) => l.line_no)) + 1,
                    customer_part_number: null,
                    description: null,
                    po_quantity: null,
                    po_uom: null,
                    po_unit_price: null,
                    product: null,
                    match_method: null,
                    match_score: null,
                    remember_alias: false,
                    quantity: null,
                    uom_conversion_note: null,
                    unit_price: null,
                    price_source: null,
                    expected_price: null,
                    expected_source: null,
                    available: null,
                    field_meta: {},
                    removed: false,
                  },
                ]);
                changed();
              }}
            >
              <Plus aria-hidden />
              Add line
            </Button>
          ) : null}
        </div>
        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-400 bg-white p-4 text-small text-subtle-foreground">
            No lines yet. Add the lines from the document.
          </p>
        ) : null}
        {lines.map((l) => (
          <LineCard
            key={l.key}
            line={l}
            props={props}
            threshold={t}
            money={money}
            onChange={(patch, metaKey, metaPatch) => updateLine(l.key, patch, metaKey, metaPatch)}
            onConfirm={(fields) => confirmLine(l.key, fields)}
          />
        ))}
      </section>
    </div>
  );
}

function LineCard({
  line: l,
  props,
  threshold,
  money,
  onChange,
  onConfirm,
}: {
  line: ReviewLine;
  props: ReviewProps;
  threshold: number;
  money: (v: string) => string;
  onChange: (patch: Partial<ReviewLine>, metaKey?: string, metaPatch?: Meta) => void;
  onConfirm: (fields?: string[]) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const disabled = !props.canEdit;
  const pending = Object.values(l.field_meta).some(isPending);
  const unit = l.product?.selling_uom ?? l.po_uom ?? "";
  const mismatch = Boolean(
    l.product && l.unit_price && l.expected_price && compare(l.unit_price, l.expected_price) !== 0,
  );
  const total =
    l.quantity &&
    l.unit_price &&
    /^\d+(\.\d+)?$/.test(l.quantity) &&
    /^\d+(\.\d+)?$/.test(l.unit_price)
      ? lineTotal(l.quantity, l.unit_price)
      : null;
  const pq = provenanceOf(l.field_meta.quantity, l.quantity, threshold);
  const pp = provenanceOf(l.field_meta.unit_price, l.unit_price, threshold);
  const pprod = provenanceOf(l.field_meta.product_id, l.product?.id ?? null, threshold);
  const id = (f: string) => `line-${l.key}-${f}`;

  if (l.removed) {
    return (
      <article
        className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-25 px-4 py-2 text-small text-subtle-foreground"
        aria-label={`Line ${l.line_no} (removed)`}
      >
        <span className="line-through">
          Line {l.line_no}: {l.description ?? l.customer_part_number ?? "untitled"}
        </span>
        {props.canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => onChange({ removed: false })}
          >
            <Undo2 aria-hidden />
            Restore
          </Button>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className="rounded-lg border border-border bg-white p-4"
      aria-label={`Line ${l.line_no}`}
      data-testid={`line-${l.line_no}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-small font-medium text-navy-900">Line {l.line_no}</span>
        <span className="text-small text-subtle-foreground">
          As printed:{" "}
          {[
            l.customer_part_number,
            l.description,
            l.po_quantity && `${l.po_quantity} ${l.po_uom ?? ""}`,
            l.po_unit_price && `@ ${l.po_unit_price}`,
          ]
            .filter(Boolean)
            .join(" · ") || "entered manually"}
        </span>
        <span className="ml-auto flex gap-1">
          {props.canEdit && pending ? (
            <Button size="sm" onClick={() => onConfirm()}>
              <Check aria-hidden />
              Confirm line
            </Button>
          ) : null}
          {props.canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ removed: true })}
              aria-label={`Remove line ${l.line_no}`}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <div
          className={cn(
            "space-y-1 rounded-md p-1.5",
            pprod ? provenanceFieldClass(pprod.state) : "",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-small font-medium text-navy-900">Product</span>
            <span className="flex items-center gap-1">
              {pprod ? <ProvenanceMarker provenance={pprod} /> : null}
              {l.product && l.match_method ? (
                <span className="text-caption text-subtle-foreground">
                  {l.match_method}
                  {l.match_score !== null ? ` · ${Math.round(l.match_score * 100)}%` : ""}
                </span>
              ) : null}
            </span>
          </div>
          <p className="text-small text-navy-900" data-testid={`line-${l.line_no}-product`}>
            {l.product ? (
              <>
                <span className="font-mono">{l.product.sku}</span> · {l.product.name}
                {l.product.status === "discontinued" ? (
                  <span className="text-danger-700"> (discontinued)</span>
                ) : null}
              </>
            ) : (
              <span className="text-subtle-foreground">No product selected</span>
            )}
          </p>
          {props.canEdit ? (
            searching ? (
              <div className="space-y-1">
                <div className="flex gap-1">
                  <input
                    aria-label={`Search products for line ${l.line_no}`}
                    autoFocus
                    className={cn(fieldControlClass, "h-8 text-small")}
                    value={query}
                    placeholder="SKU, name or GTIN"
                    onChange={async (e) => {
                      setQuery(e.target.value);
                      setResults(await searchProducts(props.organizationId, e.target.value));
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setSearching(false)}>
                    Close
                  </Button>
                </div>
                <ul
                  className="max-h-48 overflow-auto rounded-md border border-border"
                  role="listbox"
                  aria-label="Products"
                >
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={l.product?.id === p.id}
                        className="w-full px-2 py-1.5 text-left text-small hover:bg-neutral-50"
                        onClick={() => {
                          onChange(
                            {
                              product: p,
                              match_method: "manual",
                              match_score: null,
                              remember_alias: Boolean(l.customer_part_number),
                            },
                            "product_id",
                            { source: "user", state: "confirmed", confirmed_by: props.currentUser },
                          );
                          setSearching(false);
                        }}
                      >
                        <span className="font-mono">{p.sku}</span> · {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSearching(true)}>
                  <Search aria-hidden />
                  {l.product ? "Change" : "Find product"}
                </Button>
                {isPending(l.field_meta.product_id) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onConfirm(["product_id"])}
                    aria-label={`Confirm product for line ${l.line_no}`}
                  >
                    <Check aria-hidden />
                    Confirm match
                  </Button>
                ) : null}
              </span>
            )
          ) : null}
          {l.product && l.match_method !== "alias" && l.customer_part_number ? (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id={id("alias")}
                checked={l.remember_alias}
                disabled={disabled}
                onCheckedChange={(v) => onChange({ remember_alias: v === true })}
              />
              <Label htmlFor={id("alias")} className="text-small font-normal">
                Remember {l.customer_part_number} for this customer
              </Label>
            </div>
          ) : null}
        </div>

        <div className={cn("space-y-1 rounded-md p-1.5", pq ? provenanceFieldClass(pq.state) : "")}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id("qty")}>Quantity{unit ? ` (${unit})` : ""}</Label>
            {pq ? <ProvenanceMarker provenance={pq} /> : null}
          </div>
          <input
            id={id("qty")}
            inputMode="decimal"
            className={cn(fieldControlClass, "h-9 tabular-nums")}
            disabled={disabled}
            value={l.quantity ?? ""}
            onChange={(e) => onChange({ quantity: e.target.value }, "quantity")}
          />
          {l.product && l.po_uom && l.po_uom.toUpperCase() !== l.product.selling_uom ? (
            <input
              aria-label={`Unit conversion note for line ${l.line_no}`}
              placeholder={`Conversion, e.g. 1 ${l.po_uom} = 10 ${l.product.selling_uom}`}
              className={cn(fieldControlClass, "h-8 text-small")}
              disabled={disabled}
              value={l.uom_conversion_note ?? ""}
              onChange={(e) => onChange({ uom_conversion_note: e.target.value })}
            />
          ) : null}
          {l.available !== null ? (
            <p className="text-caption text-subtle-foreground">Available: {l.available}</p>
          ) : null}
        </div>

        <div className={cn("space-y-1 rounded-md p-1.5", pp ? provenanceFieldClass(pp.state) : "")}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id("price")}>Unit price</Label>
            {pp ? <ProvenanceMarker provenance={pp} /> : null}
          </div>
          <input
            id={id("price")}
            inputMode="decimal"
            className={cn(fieldControlClass, "h-9 tabular-nums")}
            disabled={disabled}
            value={l.unit_price ?? ""}
            onChange={(e) =>
              onChange({ unit_price: e.target.value, price_source: "po_price" }, "unit_price", {
                ...l.field_meta.unit_price,
                source: l.field_meta.unit_price?.source === "ai" ? "ai" : "user",
                state: l.field_meta.unit_price?.source === "ai" ? "edited" : "user_entered",
                price_decision: "manual",
              })
            }
          />
          {l.expected_price ? (
            <p className="text-caption text-subtle-foreground">
              Expected {money(l.expected_price)} (
              {l.expected_source === "customer_price" ? "customer price" : "list price"})
            </p>
          ) : null}
          {props.canEdit && mismatch && !l.field_meta.unit_price?.price_decision ? (
            <span className="flex flex-wrap gap-1">
              <Button
                size="sm"
                onClick={() =>
                  onChange({ price_source: "po_price" }, "unit_price", {
                    state: "confirmed",
                    price_decision: "po",
                    confirmed_by: props.currentUser,
                  })
                }
              >
                Use PO price
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  onChange(
                    { unit_price: l.expected_price, price_source: l.expected_source },
                    "unit_price",
                    {
                      state: l.field_meta.unit_price?.source === "ai" ? "edited" : "confirmed",
                      price_decision: "expected",
                      confirmed_by: props.currentUser,
                    },
                  )
                }
              >
                Use expected price
              </Button>
            </span>
          ) : null}
          {total ? (
            <p className="text-caption text-subtle-foreground">Line total {money(total)}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
