"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right";
    /** Hidden below this breakpoint so lists keep priority columns on small screens. */
    hideBelow?: "sm" | "md" | "lg";
    className?: string;
  }
}

const HIDE_BELOW = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

export type DataTableState = "ready" | "loading" | "error";

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Accessible caption describing the table. */
  caption: string;
  state?: DataTableState;
  empty?: { title: string; description?: string; action?: ReactNode };
  onRetry?: () => void;
  /** Rows link to a record: the primary row click opens it (DESIGN_SYSTEM.md §9.3). */
  rowHref?: (row: TData) => string | undefined;
  getRowId?: (row: TData) => string;
  pageSize?: number;
  /** Total count for "1–50 of 2,341" when the server paginates (Phase 2 onwards). */
  className?: string;
  initialSorting?: SortingState;
};

export function DataTable<TData>({
  columns,
  data,
  caption,
  state = "ready",
  empty = { title: "Nothing here yet" },
  onRetry,
  rowHref,
  getRowId,
  pageSize = 25,
  className,
  initialSorting = [],
}: DataTableProps<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  // TanStack Table returns new functions on each render by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const total = data.length;
  const { pageIndex } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-white", className)}>
      <Table aria-busy={state === "loading" || undefined}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader className="sticky top-0 z-10">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const sortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                    }
                    className={cn(
                      meta?.align === "right" && "text-right",
                      meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                      meta?.className,
                    )}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-navy-900",
                          meta?.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp aria-hidden className="size-3" />
                        ) : sorted === "desc" ? (
                          <ArrowDown aria-hidden className="size-3" />
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {state === "loading"
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((column, c) => (
                    <TableCell
                      key={c}
                      className={cn(column.meta?.hideBelow && HIDE_BELOW[column.meta.hideBelow])}
                    >
                      <Skeleton className="h-4 w-full max-w-36" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
          {state === "ready"
            ? rows.map((row) => {
                const href = rowHref?.(row.original);
                return (
                  <TableRow
                    key={row.id}
                    data-href={href}
                    className={cn(href && "cursor-pointer")}
                    onClick={(event) => {
                      if (!href) return;
                      const target = event.target as HTMLElement;
                      if (target.closest("a,button,input,[role=menuitem]")) return;
                      router.push(href);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            meta?.align === "right" && "text-right tabular",
                            meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                            meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            : null}
        </TableBody>
      </Table>

      {state === "error" ? (
        <ErrorState onRetry={onRetry} className="border-t border-border" />
      ) : null}
      {state === "ready" && rows.length === 0 ? (
        <EmptyState
          title={empty.title}
          description={empty.description}
          action={empty.action}
          className="border-t border-border"
        />
      ) : null}

      {state === "ready" && total > pageSize ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <p className="text-small text-subtle-foreground tabular" aria-live="polite">
            {from}–{to} of {total}
          </p>
          <div className="flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft aria-hidden />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight aria-hidden />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
