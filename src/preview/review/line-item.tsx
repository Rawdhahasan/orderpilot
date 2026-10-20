"use client";

import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import { useState, type Dispatch } from "react";

import { ProvenanceMarker } from "@/components/provenance/provenance-marker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { multiplyBy } from "@/domain/money/decimal";
import { cn } from "@/lib/cn";
import { EMPTY_VALUE } from "@/lib/format";

import { PRODUCTS, availableFor, productBySku } from "../fixtures";
import { fmt } from "../format";

import {
  finalUnitPrice,
  hasPriceMismatch,
  hasUnitMismatch,
  lineAmount,
  lineUom,
  poPricePerSellingUnit,
  shortfall,
  type LineState,
} from "./model";
import type { ReviewAction } from "./reducer";

const METHOD_LABEL = {
  alias: "Matched by alias",
  sku: "Matched by SKU",
  gtin: "Matched by GTIN",
  description: "Suggested by description",
  manual: "Chosen by reviewer",
  none: "Not matched",
} as const;

export function LineItem({
  line,
  dispatch,
  editable,
  actor,
  selected,
  onFocus,
}: {
  line: LineState;
  dispatch: Dispatch<ReviewAction>;
  editable: boolean;
  actor: string;
  selected: boolean;
  onFocus: () => void;
}) {
  const product = productBySku(line.sku);
  const unitMismatch = hasUnitMismatch(line);
  const priceMismatch = hasPriceMismatch(line);
  const short = shortfall(line);
  const amount = lineAmount(line);
  const price = finalUnitPrice(line);
  const lowQuantity = line.quantityState === "suggested_low";
  const blocked = !product || unitMismatch || priceMismatch || lowQuantity || !line.matchConfirmed;

  return (
    <article
      id={`field-line-${line.lineNo}`}
      tabIndex={-1}
      aria-label={`Line ${line.lineNo}: ${line.description}`}
      data-unconfirmed={!line.confirmed || undefined}
      onFocusCapture={onFocus}
      className={cn(
        "rounded-lg border bg-white outline-none transition-[border-color,box-shadow] duration-150",
        selected ? "border-blue-500 ring-2 ring-ring/20" : "border-border",
        !line.confirmed && "shadow-[inset_2px_0_0_var(--ai-500)]",
      )}
    >
      {/* As printed */}
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <span className="font-mono text-caption font-medium text-navy-900">Line {line.lineNo}</span>
        <span className="text-caption text-muted-foreground">Page {line.page}</span>
        <span
          className="min-w-0 flex-1 truncate text-small text-subtle-foreground"
          title={line.description}
        >
          <span className="font-mono">{line.customerPartNumber}</span> · {line.description}
        </span>
        <span className="text-small tabular text-subtle-foreground">
          PO: {line.poQuantity} {line.poUom}
          {line.poUnitPrice ? ` × ${fmt.unitPrice(line.poUnitPrice)}` : ""}
        </span>
      </header>

      <div className="space-y-3 px-3 py-3">
        {/* Product */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5">
              <Badge
                tone={
                  line.method === "none"
                    ? "danger"
                    : line.method === "description" && !line.matchConfirmed
                      ? "ai"
                      : "neutral"
                }
              >
                {METHOD_LABEL[line.method]}
                {line.method === "description" && line.matchScore
                  ? ` · ${Math.round(line.matchScore * 100)}%`
                  : ""}
              </Badge>
              {line.remember ? (
                <Badge tone="info">Will be remembered for this customer</Badge>
              ) : null}
            </p>
            {product ? (
              <p className="mt-1 text-body font-medium text-navy-900">
                {product.name}{" "}
                <span className="font-mono text-caption font-normal text-muted-foreground">
                  {product.sku}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-body text-muted-foreground">
                Choose the product for “{line.customerPartNumber}”.
              </p>
            )}
          </div>
          {editable ? (
            <div className="flex flex-wrap items-center gap-2">
              {line.method === "description" && !line.matchConfirmed ? (
                <Button
                  size="sm"
                  onClick={() => dispatch({ type: "confirmMatch", lineNo: line.lineNo })}
                >
                  <Check aria-hidden /> Confirm match
                </Button>
              ) : null}
              <ProductPicker
                line={line}
                onChoose={(sku) => dispatch({ type: "chooseProduct", lineNo: line.lineNo, sku })}
              />
            </div>
          ) : null}
        </div>

        {editable && (line.method === "manual" || line.method === "description") && line.sku ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`remember-${line.lineNo}`}
              checked={line.remember}
              onCheckedChange={(v) =>
                dispatch({ type: "setRemember", lineNo: line.lineNo, remember: v === true })
              }
            />
            <Label htmlFor={`remember-${line.lineNo}`} className="font-normal">
              Remember “{line.customerPartNumber}” for this customer (saved at approval)
            </Label>
          </div>
        ) : null}

        {/* Unit mismatch */}
        {unitMismatch && product ? (
          <ConversionForm
            line={line}
            sellingUom={product.uom}
            editable={editable}
            onApply={(factor, note) =>
              dispatch({ type: "applyConversion", lineNo: line.lineNo, factor, note })
            }
          />
        ) : null}
        {line.conversion && product ? (
          <p className="text-small text-subtle-foreground">
            Converted {line.poQuantity} {line.poUom}{" "}
            <ArrowRight aria-hidden className="inline size-3" />{" "}
            {fmt.qty(line.quantity, product.uom, product.quantityDecimals)} · “
            {line.conversion.note}”
          </p>
        ) : null}

        {/* Price mismatch */}
        {priceMismatch && line.expectedUnitPrice ? (
          <div className="rounded-md bg-danger-50 p-2.5">
            <p className="text-small text-danger-800">
              PO price {fmt.unitPrice(poPricePerSellingUnit(line)!)} vs expected{" "}
              {fmt.unitPrice(line.expectedUnitPrice)} (
              {line.expectedPriceSource === "customer_price" ? "customer price" : "list price"}).
            </p>
            {editable ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    dispatch({ type: "choosePrice", lineNo: line.lineNo, choice: "po" })
                  }
                >
                  Use PO price
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    dispatch({ type: "choosePrice", lineNo: line.lineNo, choice: "expected" })
                  }
                >
                  Use expected price
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Figures */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-caption text-muted-foreground">Quantity</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-body tabular text-navy-900">
              {fmt.qty(line.quantity, lineUom(line), product?.quantityDecimals ?? 3)}
              <ProvenanceMarker
                provenance={{
                  state: line.quantityState,
                  confidence: line.confidence,
                  page: line.page,
                  aiValue: `${line.poQuantity} ${line.poUom}`,
                  by: actor,
                }}
              />
            </dd>
            {lowQuantity && editable ? (
              <dd>
                <Button
                  size="sm"
                  variant="link"
                  className="mt-0.5 text-small"
                  onClick={() => dispatch({ type: "confirmQuantity", lineNo: line.lineNo })}
                >
                  Confirm quantity
                </Button>
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Unit price</dt>
            <dd className="mt-0.5 text-body tabular text-navy-900">
              {price && !unitMismatch ? fmt.unitPrice(price) : EMPTY_VALUE}
              {line.priceChoice ? (
                <span className="block text-caption text-subtle-foreground">
                  {line.priceChoice === "po"
                    ? "PO price"
                    : line.expectedPriceSource === "customer_price"
                      ? "Customer price"
                      : "List price"}{" "}
                  chosen
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Line total</dt>
            <dd className="mt-0.5 text-body font-medium tabular text-navy-900">
              {amount && !unitMismatch ? fmt.money(amount) : EMPTY_VALUE}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Availability</dt>
            <dd
              className={cn(
                "mt-0.5 text-body tabular",
                short ? "text-warning-800" : "text-navy-900",
              )}
            >
              {product ? (
                product.trackInventory ? (
                  <span className="inline-flex items-center gap-1">
                    {short ? <TriangleAlert aria-hidden className="size-3.5" /> : null}
                    {fmt.qty(availableFor(product.sku), product.uom, product.quantityDecimals)}
                  </span>
                ) : (
                  "Not tracked"
                )
              ) : (
                EMPTY_VALUE
              )}
              <span className="block text-caption text-muted-foreground">Indicative</span>
            </dd>
          </div>
        </dl>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        {line.confirmed ? (
          <p className="inline-flex items-center gap-1 text-small text-success-700">
            <Check aria-hidden className="size-3.5" /> Line confirmed by {line.confirmedBy}
          </p>
        ) : (
          <p className="text-small text-subtle-foreground">
            {!product
              ? "Choose a product to continue."
              : unitMismatch
                ? "Convert the quantity to continue."
                : priceMismatch
                  ? "Choose a price to continue."
                  : lowQuantity
                    ? "Low confidence: confirm the quantity individually."
                    : !line.matchConfirmed
                      ? "Confirm the suggested match."
                      : "Check the line against the document."}
          </p>
        )}
        {editable && !line.confirmed ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked}
            onClick={() => dispatch({ type: "confirmLine", lineNo: line.lineNo, by: actor })}
          >
            <Check aria-hidden /> Confirm line
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function ProductPicker({ line, onChoose }: { line: LineState; onChoose: (sku: string) => void }) {
  const candidateSkus = line.candidates.map((c) => c.sku);
  const ordered = [
    ...line.candidates.map((c) => ({
      sku: c.sku,
      hint: `${Math.round(c.score * 100)}% description match`,
    })),
    ...PRODUCTS.filter((p) => p.status === "active" && !candidateSkus.includes(p.sku)).map((p) => ({
      sku: p.sku,
      hint: "",
    })),
  ];
  return (
    <Select
      value={line.method === "manual" ? (line.sku ?? undefined) : undefined}
      onValueChange={onChoose}
    >
      <SelectTrigger
        className="h-8 w-48 text-small"
        aria-label={`Choose product for line ${line.lineNo}`}
      >
        <SelectValue placeholder={line.sku ? "Change product" : "Choose product"} />
      </SelectTrigger>
      <SelectContent className="w-80">
        {ordered.map(({ sku, hint }) => {
          const p = productBySku(sku)!;
          return (
            <SelectItem key={sku} value={sku}>
              {p.sku} · {p.name}
              {hint ? ` (${hint})` : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ConversionForm({
  line,
  sellingUom,
  editable,
  onApply,
}: {
  line: LineState;
  sellingUom: string;
  editable: boolean;
  onApply: (factor: number, note: string) => void;
}) {
  const [factor, setFactor] = useState(String(line.suggestedConversion?.factor ?? ""));
  const [note, setNote] = useState("");
  const parsed = Number.parseInt(factor, 10);
  const valid =
    Number.isInteger(parsed) &&
    parsed > 0 &&
    String(parsed) === factor.trim() &&
    note.trim().length > 0;

  return (
    <div className="rounded-md bg-danger-50 p-2.5">
      <p className="text-small text-danger-800">
        PO unit: <strong>{line.poUom}</strong> · Sells in: <strong>{sellingUom}</strong>. Convert
        the quantity and record why.
      </p>
      {editable ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor={`factor-${line.lineNo}`} className="text-caption">
              {sellingUom} per {line.poUom}
            </Label>
            <Input
              id={`factor-${line.lineNo}`}
              inputMode="numeric"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              className="mt-1 h-8 bg-white"
            />
          </div>
          <div>
            <Label htmlFor={`note-${line.lineNo}`} className="text-caption">
              Reason (required)
            </Label>
            <Input
              id={`note-${line.lineNo}`}
              value={note}
              placeholder={line.suggestedConversion?.note ?? "For example: case of 12 per catalog"}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 h-8 bg-white"
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            disabled={!valid}
            onClick={() => onApply(parsed, note.trim())}
          >
            Convert {line.poQuantity} {line.poUom}
            {valid ? ` → ${fmt.qty(multiplyBy(line.poQuantity, parsed), sellingUom, 3)}` : ""}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
