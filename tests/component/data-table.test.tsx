import type { ColumnDef } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/data-table/data-table";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Row = { sku: string; qty: number };
const columns: ColumnDef<Row, unknown>[] = [
  { id: "sku", header: "SKU", accessorKey: "sku" },
  { id: "qty", header: "On hand", accessorKey: "qty", meta: { align: "right" } },
];

describe("data table (DESIGN_SYSTEM.md §9.3)", () => {
  it("renders real table markup with a caption", () => {
    render(<DataTable caption="Stock" columns={columns} data={[{ sku: "JAN-1001", qty: 640 }]} />);
    expect(screen.getByRole("table", { name: "Stock" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /SKU/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "JAN-1001" })).toBeInTheDocument();
  });

  it("sorts and exposes the sort state", async () => {
    render(
      <DataTable
        caption="Stock"
        columns={columns}
        data={[
          { sku: "B", qty: 2 },
          { sku: "A", qty: 1 },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /SKU/ }));
    expect(screen.getByRole("columnheader", { name: /SKU/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("A");
  });

  it("shows an empty state with one action", () => {
    render(
      <DataTable
        caption="Stock"
        columns={columns}
        data={[]}
        empty={{ title: "No products yet", action: <button type="button">Add product</button> }}
      />,
    );
    expect(screen.getByText("No products yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add product" })).toBeVisible();
  });

  it("shows skeleton rows while loading", () => {
    render(<DataTable caption="Stock" columns={columns} data={[]} state="loading" />);
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Nothing here yet")).toBeNull();
  });

  it("shows an error with Try again", async () => {
    const onRetry = vi.fn();
    render(
      <DataTable caption="Stock" columns={columns} data={[]} state="error" onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
