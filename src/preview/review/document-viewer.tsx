"use client";

import { ChevronLeft, ChevronRight, Download, Minus, Plus } from "lucide-react";

import { PhaseNotice } from "@/components/states/phase-notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { formatDecimal } from "@/lib/format";
import { lineTotal } from "@/domain/money/decimal";

import { FORMAT, type PreviewReview } from "../fixtures";
import { previewOnly } from "../notify";

const ZOOMS = [0.75, 0.9, 1, 1.15, 1.3];

function money(value: string) {
  return formatDecimal(value, FORMAT.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * A fictional purchase order rendered as HTML for the preview. The real PDF
 * viewer (PDF.js, page navigation, zoom, rotate) arrives in Phase 4B.
 */
export function DocumentViewer({
  review,
  page,
  onPageChange,
  zoomIndex,
  onZoomChange,
  highlightPage,
  fileName,
}: {
  review: PreviewReview | undefined;
  page: number;
  onPageChange: (page: number) => void;
  zoomIndex: number;
  onZoomChange: (index: number) => void;
  highlightPage: number | null;
  fileName: string;
}) {
  const pageCount = review?.pages.length ?? 1;
  const current = review?.pages[page - 1];
  const zoom = ZOOMS[zoomIndex] ?? 1;

  return (
    <section aria-label="Original document" className="flex h-full min-h-0 flex-col bg-neutral-100">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate text-small font-medium text-navy-900"
          title={fileName}
        >
          {fileName}
        </p>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span
            className="min-w-14 text-center text-caption tabular text-subtle-foreground"
            aria-live="polite"
          >
            {page} / {pageCount}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onZoomChange(zoomIndex - 1)}
            disabled={zoomIndex <= 0}
            aria-label="Zoom out"
          >
            <Minus aria-hidden />
          </Button>
          <span className="min-w-11 text-center text-caption tabular text-subtle-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onZoomChange(zoomIndex + 1)}
            disabled={zoomIndex >= ZOOMS.length - 1}
            aria-label="Zoom in"
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Download original"
          onClick={() =>
            previewOnly(
              "In the product this downloads the original file through a 5-minute signed link.",
            )
          }
        >
          <Download aria-hidden />
        </Button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        tabIndex={0}
        role="region"
        aria-label="Document pages"
      >
        <div
          style={{ zoom }}
          className={cn(
            "mx-auto w-full max-w-[640px] rounded-sm bg-white p-8 font-serif text-[12px] leading-relaxed text-[#222] shadow-sm ring-1 ring-black/5 transition-shadow duration-200",
            highlightPage === page && "ring-4 ring-blue-400/50",
          )}
          data-document-page={page}
        >
          {review && current ? (
            <PaperPage review={review} page={current} />
          ) : (
            <ScannedPlaceholder />
          )}
        </div>
        <div className="mx-auto mt-3 max-w-[640px] space-y-2">
          <p className="text-caption text-subtle-foreground">
            Fictional document rendered for the preview. It is not a real customer file.
          </p>
          <PhaseNotice phase="4B" feature="The PDF viewer with real documents" compact />
        </div>
      </div>
    </section>
  );
}

function PaperPage({
  review,
  page,
}: {
  review: PreviewReview;
  page: PreviewReview["pages"][number];
}) {
  const lines = review.lines.filter((line) => page.lines.includes(line.lineNo));
  return (
    <div>
      {page.showHeader ? (
        <>
          <div className="flex items-start justify-between gap-6 border-b border-[#222] pb-3">
            <div>
              <p className="text-[18px] font-bold tracking-wide uppercase">
                {review.documentFrom.name}
              </p>
              {review.documentFrom.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
            <div className="text-right">
              <p className="text-[16px] font-bold uppercase">{review.documentTitle}</p>
              <p>PO # {review.header.find((h) => h.key === "po_number")?.value}</p>
              {review.printedDates.map((d) => (
                <p key={d.label}>
                  {d.label}: {d.value}
                </p>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <p className="font-bold uppercase">Vendor</p>
              <p>{review.documentTo.name}</p>
              {review.documentTo.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
            <div>
              <p className="font-bold uppercase">Terms</p>
              <p>{review.header.find((h) => h.key === "payment_terms")?.value}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="border-b border-[#222] pb-2 font-bold">
          {review.documentFrom.name} · PO #{" "}
          {review.header.find((h) => h.key === "po_number")?.value} (continued)
        </p>
      )}

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-[#222] text-left">
            <th className="py-1 pr-2">Ln</th>
            <th className="py-1 pr-2">Item</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 pr-2 text-right">Qty</th>
            <th className="py-1 pr-2">UM</th>
            <th className="py-1 pr-2 text-right">Price</th>
            <th className="py-1 text-right">Ext.</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.lineNo} className="border-b border-dotted border-[#999] align-top">
              <td className="py-1 pr-2">{line.lineNo}</td>
              <td className="py-1 pr-2">{line.customerPartNumber}</td>
              <td className="py-1 pr-2">{line.description}</td>
              <td className="py-1 pr-2 text-right">{line.poQuantity}</td>
              <td className="py-1 pr-2">{line.poUom}</td>
              <td className="py-1 pr-2 text-right">
                {line.poUnitPrice ? money(line.poUnitPrice) : ""}
              </td>
              <td className="py-1 text-right">
                {line.poUnitPrice ? money(lineTotal(line.poQuantity, line.poUnitPrice)) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {page.showTotals ? (
        <div className="mt-4 flex justify-between gap-6">
          <p className="max-w-[60%] italic">{review.printedNotes}</p>
          {review.printedTotal ? (
            <p className="font-bold">TOTAL {money(review.printedTotal)}</p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-6 text-center text-[10px] text-[#555]">{page.heading}</p>
    </div>
  );
}

function ScannedPlaceholder() {
  return (
    <div>
      <div className="space-y-3 opacity-70 [filter:blur(0.6px)_grayscale(1)]" aria-hidden>
        <div className="h-5 w-1/2 rounded-sm bg-[#bbb]" />
        <div className="h-3 w-1/3 rounded-sm bg-[#ccc]" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="h-3 rounded-sm bg-[#d4d4d4]"
              style={{ width: `${60 + ((i * 17) % 35)}%` }}
            />
          ))}
        </div>
      </div>
      <p className="pt-6 text-center font-sans text-[11px] text-[#444]">
        Scanned page (fictional placeholder)
      </p>
    </div>
  );
}
